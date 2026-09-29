/**
 * Studio 的本地服务：静态界面 + 一组读写项目文件的接口。只监听 127.0.0.1。
 * 界面用 Preact + htm，不需要构建：/vendor/ 直接指向 node_modules 里的现成模块文件。
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { loadConfig, setConfigValue, listEntries, readEntry, writeEntry, entryExists, skeleton, trashEntry, listAssets, saveAsset, isId, KINDS, IMAGE_EXT } from './project.mjs';
import { validateEntry } from 'astro-mori/validate';
import { locate } from 'astro-mori/anchor';
import { parseGpx, simplify, readExif, clusterStops } from './geo.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ui = join(here, '../ui');
const require = createRequire(import.meta.url);
// 各包的 package.json 不一定对外导出，所以从入口文件的位置推出目录
const dirOfMain = (spec) => dirname(require.resolve(spec));
const VENDOR = {
  '/vendor/preact.js': join(dirOfMain('preact'), 'preact.module.js'),
  '/vendor/preact-hooks.js': join(dirOfMain('preact/hooks'), 'hooks.module.js'),
  '/vendor/htm.js': join(dirOfMain('htm'), 'htm.module.js'),
  '/vendor/htm-preact.js': join(dirOfMain('htm/preact'), 'index.module.js'),
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif' };

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = (req, limit = 60 * 1024 * 1024) =>
  new Promise((ok, fail) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { fail(new Error('文件太大')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', fail);
  });
const readJson = async (req) => JSON.parse((await readBody(req, 8 * 1024 * 1024)).toString('utf8') || '{}');

function serveFile(res, file) {
  if (!existsSync(file) || !statSync(file).isFile()) return send(res, 404, { error: '没有这个文件' });
  res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
}

/** 从内容 JSON 里取出每个能划词的块的纯文字（和页面上 DOM 的文字一致：不含旁注编号，换行符不算字符） */
export function blockTexts(kind, data) {
  const spanText = (v) => (typeof v === 'string' ? v : (v ?? []).map((s) => s.t).join('')).replace(/\n/g, '');
  const out = new Map();
  for (const b of data.blocks ?? []) {
    if (kind === 'post' && ['p', 'h', 'quote'].includes(b.type)) out.set(b.id, spanText(b.text));
    if (kind === 'travel' && b.type === 'text') for (const p of b.paras ?? []) out.set(p.id, spanText(p.text));
  }
  return out;
}

/** 这次修改会让哪些批注找不到原文（块没了，或原文对不上）——保存时提醒作者 */
export function brokenAnnotations(kind, data, comments) {
  const texts = blockTexts(kind, data);
  return comments
    .filter((c) => c.block)
    .filter((c) => { const t = texts.get(c.block); return t === undefined || !locate(t, { start: c.start ?? 0, end: c.end ?? 0, quote: c.quote ?? '', prefix: c.prefix ?? '', suffix: c.suffix ?? '' }); })
    .map((c) => ({ id: c.id, block: c.block, quote: c.quote }));
}

/** 把 publish 设置变成要跑的命令（参数用数组，不经过 shell） */
export function publishCommand(publish, root) {
  if (!publish) return { error: '还没有发布设置。在 mori.config.ts 里加 publish: { target: \'cloudflare-pages\', project: \'…\' } 或 { target: \'rsync\', dest: \'user@host:/var/www/site/\' }。' };
  if (publish.target === 'cloudflare-pages') {
    if (!publish.project) return { error: 'publish.project 没填（Cloudflare Pages 的项目名）。' };
    const args = ['--yes', 'wrangler', 'pages', 'deploy', 'dist', '--project-name', publish.project, ...(publish.branch ? ['--branch', publish.branch] : [])];
    return { cmd: 'npx', args, label: `Cloudflare Pages · ${publish.project}` };
  }
  if (publish.target === 'rsync') {
    if (!publish.dest) return { error: 'publish.dest 没填（如 user@host:/var/www/site/）。' };
    return { cmd: 'rsync', args: ['-az', '--delete', '--stats', 'dist/', publish.dest], label: `rsync → ${publish.dest}` };
  }
  return { error: `不认识的发布目标：${publish.target}` };
}

export async function startStudio({ root, port = 4400 }) {
  root = resolve(root);
  const { path: configPath, config: first } = await loadConfig(root);
  let config = first; // 改了 mori.config.ts 之后重新读
  const preview = { port: 4321, startedByStudio: false }; // Astro 默认端口；项目已经在跑 dev（有锁，只能有一个）就直接复用
  const astroBin = () => join(dirname(require.resolve('astro/package.json', { paths: [root] })), 'bin/astro.mjs');
  const runAstro = (args, opts = {}) => spawn(process.execPath, [astroBin(), ...args], { cwd: root, ...opts });

  async function isUp(p) {
    try { return (await fetch(`http://127.0.0.1:${p}/`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
  }

  // ── 评论管理：Studio 服务替浏览器去调评论服务的管理接口，管理令牌只存在本机（环境变量或项目里的 .mori-studio.json） ──
  const tokenFile = join(root, '.mori-studio.json');
  const adminToken = () => process.env.MORI_ADMIN_TOKEN || (existsSync(tokenFile) ? JSON.parse(readFileSync(tokenFile, 'utf8')).adminToken : '');
  const commentsEndpoint = () => (config.comments?.provider === 'mori' ? String(config.comments.endpoint ?? '').replace(/\/$/, '') : '');
  async function admin(method, path, body) {
    const ep = commentsEndpoint(), tk = adminToken();
    if (!ep) throw Object.assign(new Error('mori.config.ts 里没有启用自建评论（comments.provider = mori）'), { code: 400 });
    if (!tk) throw Object.assign(new Error('还没有管理令牌'), { code: 401 });
    const r = await fetch(`${ep}/admin${path}`, { method, headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error ?? `评论服务返回 ${r.status}`), { code: r.status === 401 ? 401 : 502 });
    return j;
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const p = decodeURIComponent(url.pathname);
      const m = (re) => p.match(re);

      /* ── 静态：界面、第三方模块、项目里的图片 ── */
      if (req.method === 'GET' && !p.startsWith('/api/')) {
        if (p === '/') return serveFile(res, join(ui, 'index.html'));
        if (VENDOR[p]) return serveFile(res, VENDOR[p]);
        if (p.startsWith('/ui/')) {
          const f = normalize(join(ui, p.slice(4)));
          return f.startsWith(ui) ? serveFile(res, f) : send(res, 403, { error: 'no' });
        }
        if (p.startsWith('/asset/')) {
          const name = p.slice(7);
          const f = normalize(join(root, 'src/assets', name));
          if (!f.startsWith(join(root, 'src/assets')) || !IMAGE_EXT.has(extname(f).toLowerCase())) return send(res, 403, { error: 'no' });
          // ?w= 给缩略图；原图直接给
          const w = +url.searchParams.get('w');
          if (w && extname(f).toLowerCase() !== '.svg' && existsSync(f)) {
            res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store' });
            return res.end(await sharp(f).resize({ width: Math.min(w, 2400), withoutEnlargement: true }).webp({ quality: 78 }).toBuffer());
          }
          return serveFile(res, f);
        }
        return send(res, 404, { error: 'not found' });
      }

      /* ── 项目概况 ── */
      if (req.method === 'GET' && p === '/api/project') {
        let pending = 0; // 侧栏上的待审数量；评论服务连不上就当 0
        try { if (commentsEndpoint() && adminToken()) pending = (await admin('GET', '/stats')).pending ?? 0; } catch {}
        return send(res, 200, {
          root, configPath, config: { title: config.title ?? 'MORI', description: config.description ?? '', accent: config.accent ?? '#002fa7', accentDark: config.accentDark, categories: config.categories ?? [], home: config.home, archive: config.archive, lang: config.lang ?? 'zh-CN' },
          entries: listEntries(root), assets: listAssets(root), preview: { port: preview.port, up: await isUp(preview.port) }, publish: config.publish ?? null, comments: { provider: config.comments?.provider ?? null, endpoint: commentsEndpoint(), hasToken: !!adminToken(), pending },
        });
      }

      /* ── 站点设置：改 mori.config.ts 里的单行字符串 ── */
      if (req.method === 'PUT' && p === '/api/config') {
        const { key, value } = await readJson(req);
        setConfigValue(configPath, key, value);
        config = (await loadConfig(root)).config;
        return send(res, 200, { ok: true, config });
      }

      let mm;

      /* ── 评论管理 ── */
      if ((mm = m(/^\/api\/comments(?:\/(stats|token|(\d+)))?$/))) {
        try {
          if (!mm[1] && req.method === 'GET') return send(res, 200, await admin('GET', `/comments?limit=300${url.searchParams.get('status') ? `&status=${url.searchParams.get('status')}` : ''}`));
          if (mm[1] === 'stats' && req.method === 'GET') return send(res, 200, await admin('GET', '/stats'));
          if (mm[1] === 'token' && req.method === 'PUT') {
            const { token } = await readJson(req);
            writeFileSync(tokenFile, JSON.stringify({ adminToken: String(token ?? '').trim() }) + '\n', { mode: 0o600 });
            return send(res, 200, { ok: true });
          }
          if (mm[2] && req.method === 'PATCH') return send(res, 200, await admin('PATCH', `/comments/${mm[2]}`, await readJson(req)));
          if (mm[2] && req.method === 'DELETE') return send(res, 200, await admin('DELETE', `/comments/${mm[2]}`));
        } catch (e) { return send(res, e.code ?? 500, { error: e.message }); }
      }

      /* ── 文章 ── */
      if ((mm = m(/^\/api\/entry\/(post|travel)\/([^/]+)$/))) {
        const [, kind, id] = mm;
        if (!isId(id)) return send(res, 400, { error: 'id 只能用字母、数字、下划线和连字符' });
        if (req.method === 'GET') return entryExists(root, kind, id) ? send(res, 200, readEntry(root, kind, id)) : send(res, 404, { error: '没有这篇' });
        if (req.method === 'PUT') {
          const data = await readJson(req);
          const v = validateEntry(kind, data);
          // 校验不通过也允许保存草稿（写作过程中难免不完整），但把问题原样返回；`?strict=1` 时拒绝
          if (!v.ok && url.searchParams.get('strict')) return send(res, 422, v);
          writeEntry(root, kind, id, data);
          // 使用自建评论时：这次修改会不会让已有的批注找不到原文？只提醒，不阻止保存
          let annotationWarnings;
          if (commentsEndpoint() && adminToken()) {
            try {
              const list = await admin('GET', `/comments?status=approved&limit=500&entry=${encodeURIComponent(`${KINDS[kind]}/${id}`)}`);
              annotationWarnings = brokenAnnotations(kind, data, list.comments);
            } catch { /* 评论服务连不上就不检查 */ }
          }
          return send(res, 200, { ...v, saved: true, annotationWarnings });
        }
        if (req.method === 'DELETE') { trashEntry(root, kind, id); return send(res, 200, { ok: true }); }
      }
      if (req.method === 'POST' && (mm = m(/^\/api\/entry\/(post|travel)$/))) {
        const kind = mm[1];
        const { id, title, category } = await readJson(req);
        if (!isId(id)) return send(res, 400, { error: 'id 只能用字母、数字、下划线和连字符' });
        if (entryExists(root, kind, id)) return send(res, 409, { error: `已经有一篇叫 ${id} 的了` });
        writeEntry(root, kind, id, skeleton(kind, { title: title || id, category: category ?? config.categories?.[0]?.id ?? '' }));
        return send(res, 200, { ok: true, id });
      }
      if (req.method === 'POST' && p === '/api/validate') {
        const { kind, data } = await readJson(req);
        return send(res, 200, validateEntry(kind, data));
      }

      /* ── 路线数据：导入 GPX、从照片 EXIF 建议站点 ── */
      if (req.method === 'POST' && p === '/api/gpx') {
        const pts = parseGpx((await readBody(req, 30 * 1024 * 1024)).toString('utf8'));
        if (!pts.length) return send(res, 400, { error: '没有在这个 GPX 里找到轨迹点（trkpt / rtept / wpt）' });
        const track = simplify(pts);
        return send(res, 200, { track, points: pts.length, simplified: track.length });
      }
      if (req.method === 'GET' && p === '/api/exif') {
        const photos = [];
        for (const name of listAssets(root)) {
          try { photos.push({ name, ...readExif((await sharp(join(root, 'src/assets', name)).metadata()).exif) }); } catch { photos.push({ name, lnglat: null, time: null }); }
        }
        const gps = photos.filter((x) => x.lnglat).length;
        return send(res, 200, { photos: photos.length, withGps: gps, stops: clusterStops(photos) });
      }

      /* ── 图片 ── */
      if (req.method === 'PUT' && (mm = m(/^\/api\/asset\/(.+)$/))) {
        const name = decodeURIComponent(mm[1]);
        if (!IMAGE_EXT.has(extname(name).toLowerCase())) return send(res, 400, { error: '只接受图片文件' });
        const saved = saveAsset(root, name, await readBody(req));
        return send(res, 200, { ok: true, name: saved });
      }

      /* ── 预览：用项目自己的 astro dev（真实主题渲染） ── */
      if (req.method === 'POST' && p === '/api/preview/start') {
        if (!(await isUp(preview.port))) {
          runAstro(['dev', '--port', String(preview.port), '--host', '127.0.0.1'], { stdio: 'ignore', detached: true }).unref();
          preview.startedByStudio = true;
          for (let i = 0; i < 60 && !(await isUp(preview.port)); i++) await new Promise((r) => setTimeout(r, 500));
        }
        return send(res, 200, { port: preview.port, up: await isUp(preview.port) });
      }
      if (req.method === 'POST' && p === '/api/preview/stop') {
        // 只停自己拉起的；用户自己开的 dev 服务器不动
        if (preview.startedByStudio) { runAstro(['dev', 'stop'], { stdio: 'ignore' }); preview.startedByStudio = false; }
        return send(res, 200, { ok: true });
      }

      /* ── 发布：先构建，再按 mori.config 里的 publish 上传 dist/。输出一路推给界面 ── */
      if (req.method === 'POST' && p === '/api/publish') {
        const target = publishCommand(config.publish, root);
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        if (target.error) return res.end(`${target.error}\n[exit 2]\n`);
        const pipe = (child, done) => { child.stdout.on('data', (d) => res.write(d)); child.stderr.on('data', (d) => res.write(d)); child.on('error', (e) => { res.write(`${e.message}\n`); done(127); }); child.on('close', done); };
        res.write('▸ 构建\n');
        pipe(runAstro(['build'], { env: { ...process.env, FORCE_COLOR: '0' } }), (code) => {
          if (code) return res.end(`\n构建失败，没有发布。\n[exit ${code}]\n`);
          res.write(`\n▸ 上传：${target.label}\n`);
          pipe(spawn(target.cmd, target.args, { cwd: root, env: { ...process.env, FORCE_COLOR: '0' } }), (c) => res.end(`\n${c ? '发布失败' : '已发布'}\n[exit ${c}]\n`));
        });
        return;
      }

      /* ── 构建：输出一路推给界面 ── */
      if (req.method === 'POST' && p === '/api/build') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        const child = runAstro(['build'], { env: { ...process.env, FORCE_COLOR: '0' } });
        child.stdout.on('data', (d) => res.write(d));
        child.stderr.on('data', (d) => res.write(d));
        child.on('close', (code) => res.end(`\n[exit ${code}]\n`));
        return;
      }

      send(res, 404, { error: 'not found' });
    } catch (e) {
      send(res, 500, { error: String(e?.message ?? e) });
    }
  });

  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok); });
  return { server, url: `http://127.0.0.1:${port}/`, root, stop: () => new Promise((r) => server.close(r)) };
}
