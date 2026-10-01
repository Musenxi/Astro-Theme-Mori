/**
 * Studio 的本地服务：静态界面 + 一组读写项目文件的接口。只监听 127.0.0.1。
 * 界面用 Preact + htm，不需要构建：/vendor/ 直接指向 node_modules 里的现成模块文件。
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync, writeFileSync, utimesSync } from 'node:fs';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { avatarTemplate } from 'astro-mori/avatar';
import { RESERVED_SLUGS, assetUsage, trashAsset, loadConfig, setConfigValue, setCategories, setPublish, setNav, setActions, listPages, readFriends, writeFriends, renameCategoryInEntries, renameTag, countPages, listEntries, readEntry, writeEntry, entryExists, skeleton, trashEntry, listAssets, saveAsset, isId, KINDS, IMAGE_EXT } from './project.mjs';
import { validateEntry } from 'astro-mori/validate';
import { locate } from 'astro-mori/anchor';
import { probeSite } from './probe.mjs';
import { gitInfo, gitInit, publishGit, publishLocal } from './publish.mjs';
import { parseGpx, simplify, readExif, clusterStops } from './geo.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '../dist'); // 界面：app/ 用 Vite 构建出来的静态文件
const require = createRequire(import.meta.url);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif' };

/** 只认本机的名字：防 DNS 重绑定（Host）和别的网站借你的浏览器来改文件、触发发布（Origin） */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const hostnameOf = (v) => { try { return new URL(/^[a-z]+:\/\//i.test(v) ? v : `http://${v}`).hostname; } catch { return ''; } };
export function requestAllowed(req) {
  if (!LOCAL_HOSTS.has(hostnameOf(req.headers.host ?? ''))) return false;
  const origin = req.headers.origin;
  if (origin && origin !== 'null' && !LOCAL_HOSTS.has(hostnameOf(origin))) return false;
  if (origin === 'null' && !['GET', 'HEAD'].includes(req.method)) return false; // 沙箱 iframe / file:// 页面发来的写请求
  return true;
}

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
    if (kind === 'travel' && b.type === 'text') for (const p of b.paras ?? []) if (!p.type || ['p', 'h', 'quote'].includes(p.type)) out.set(p.id, spanText(p.text));
  }
  return out;
}

/** 这次修改会让哪些引用评论找不到原文（块没了，或原文对不上）——保存时提醒作者 */
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

export async function startStudio({ root, port = 4400, dev = false }) {
  root = resolve(root);
  const { path: configPath, config: first } = await loadConfig(root);
  let config = first; // 改了 mori.config.ts 之后重新读
  const preview = { port: 4321, startedByStudio: false }; // Astro 默认端口；项目已经在跑 dev（有锁，只能有一个）就直接复用
  const astroBin = () => join(dirname(require.resolve('astro/package.json', { paths: [root] })), 'bin/astro.mjs');
  const runAstro = (args, opts = {}) => spawn(process.execPath, [astroBin(), ...args], { cwd: root, ...opts });

  /**
   * 预览服务在哪个地址上。`astro dev` 默认绑 localhost，在有的机器上只监听 IPv6（[::1]），
   * 所以三种写法都试一遍，返回第一个连得上的（连不上是 null）。
   */
  async function previewUrl(p) {
    for (const host of ['127.0.0.1', '[::1]', 'localhost']) {
      try { if ((await fetch(`http://${host}:${p}/`, { signal: AbortSignal.timeout(1500) })).ok) return `http://${host}:${p}`; } catch { /* 换下一个 */ }
    }
    return null;
  }
  const isUp = async (p) => !!(await previewUrl(p));

  /**
   * 构建会动到 astro dev 也在用的缓存，预览可能因此出错。构建完如果预览服务开着，就让它重启。
   * 办法：更新 astro.config 的修改时间——Astro 发现配置变了会自己原地重启（不管是谁启动的，不用杀进程）。
   * 构建后只在开发模式（--dev）下做；改了站点配置（设定、分类）后不分模式都要做，因为 Astro 只监听 astro.config，
   * 不会发现它引用的 mori.config.ts 变了。返回一句给界面看的话，不需要重启就返回空。
   */
  async function restartPreview(wasUp, always = false) {
    if ((!dev && !always) || !wasUp) return ''; // 构建后的重启只在开发模式下；改了站点配置必须重启（always），否则预览读的还是旧配置
    const cfg = ['astro.config.mjs', 'astro.config.ts', 'astro.config.js', 'astro.config.mts'].map((f) => join(root, f)).find(existsSync);
    if (!cfg) return '\n预览服务开着，但没找到 astro.config，请手动重启它。\n';
    const now = new Date();
    utimesSync(cfg, now, now);
    // 重启期间旧进程还会接受连接，只是响应会卡一两秒，所以不看“连不连得上”，而是等它连续两次快速响应
    await new Promise((r) => setTimeout(r, 1500));
    let fast = 0;
    for (let i = 0; i < 116; i++) {
      const t = Date.now();
      const ok = await isUp(preview.port);
      fast = ok && Date.now() - t < 400 ? fast + 1 : 0;
      if (fast >= 2) return '\n▸ 预览服务已重启\n';
      await new Promise((r) => setTimeout(r, 250));
    }
    return '\n预览服务没有在 30 秒内恢复，请手动重启 astro dev。\n';
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

  // 评论数字：总数来自评论服务的 /stats；“未读”= 比上次打开评论页更晚的评论（上次时间存在 .mori-studio.json）
  const readState = () => (existsSync(tokenFile) ? JSON.parse(readFileSync(tokenFile, 'utf8')) : {});
  const writeState = (patch) => writeFileSync(tokenFile, JSON.stringify({ ...readState(), ...patch }) + '\n', { mode: 0o600 });
  async function commentNumbers() {
    if (!commentsEndpoint() || !adminToken()) return null;
    try {
      const [st, list] = await Promise.all([admin('GET', '/stats'), admin('GET', '/comments?limit=500')]);
      const seen = readState().commentsSeenAt ?? 0;
      return { total: (st.pending ?? 0) + (st.approved ?? 0) + (st.hidden ?? 0), pending: st.pending ?? 0, unread: list.comments.filter((c) => c.createdAt > seen).length };
    } catch { return null; }
  }

  const server = createServer(async (req, res) => {
    try {
      if (!requestAllowed(req)) return send(res, 403, { error: '不接受这个来源的请求：Studio 只给本机的页面用' });
      const url = new URL(req.url, 'http://x');
      const p = decodeURIComponent(url.pathname);
      const m = (re) => p.match(re);

      /* ── 静态：界面、第三方模块、项目里的图片 ── */
      if (req.method === 'GET' && !p.startsWith('/api/')) {
        // 界面：先找构建产物里的同名文件；没有就当作界面里的页面地址（/posts/xxx 这类），交给前端路由
        if (!p.startsWith('/asset/')) {
          const f = normalize(join(dist, p));
          if (!f.startsWith(dist)) return send(res, 403, { error: 'no' });
          if (p !== '/' && existsSync(f) && statSync(f).isFile()) {
            // 文件名带哈希的可以永久缓存
            if (p.startsWith('/assets/')) { res.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' }); return createReadStream(f).pipe(res); }
            return serveFile(res, f);
          }
          if (extname(p)) return send(res, 404, { error: 'not found' });
          const index = join(dist, 'index.html');
          return existsSync(index) ? serveFile(res, index) : send(res, 503, '界面还没有构建：在 packages/studio 里运行 pnpm build:ui', 'text/plain; charset=utf-8');
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
        const cn = await commentNumbers(); // 侧栏上的未读数量；评论服务连不上就当 0
        const pending = cn?.unread ?? 0;
        return send(res, 200, {
          root, configPath, config: { title: config.title ?? 'MORI', description: config.description ?? '', accent: config.accent ?? '#002fa7', accentDark: config.accentDark, categories: config.categories ?? [], home: config.home, archive: config.archive, feed: config.feed, comments: config.comments?.provider === 'mori' ? { avatar: config.comments.avatar } : undefined, nav: config.nav ?? null, actions: config.actions ?? null, lang: config.lang ?? 'zh-CN' },
          entries: listEntries(root), pages: listPages(root), assets: listAssets(root), dev, preview: { port: preview.port, url: await previewUrl(preview.port) }, publish: config.publish ?? null, comments: { provider: config.comments?.provider ?? null, avatar: avatarTemplate(config.comments?.avatar), endpoint: commentsEndpoint(), hasToken: !!adminToken(), pending },
        });
      }

      /* ── 仪表盘数字：本地能算的现算；阅读量和点赞要评论服务记录，还没有，给 null ── */
      if (req.method === 'GET' && p === '/api/stats') {
        const entries = listEntries(root);
        const cn = await commentNumbers();
        return send(res, 200, {
          pages: countPages(root), categories: (config.categories ?? []).length, words: entries.reduce((a, e) => a + (e.words ?? 0), 0),
          comments: cn ? { total: cn.total, unread: cn.unread } : null, views: null, likes: null,
        });
      }

      /* ── 分类：整个数组重写；改 id 时用到它的文章一起改 ── */
      if (req.method === 'PUT' && p === '/api/categories') {
        const { categories, renames = {} } = await readJson(req);
        const wasUp = await isUp(preview.port);
        setCategories(configPath, categories);
        let moved = 0;
        for (const [from, to] of Object.entries(renames)) if (from !== to) moved += renameCategoryInEntries(root, from, to);
        config = (await loadConfig(root)).config;
        await restartPreview(wasUp, true);
        return send(res, 200, { ok: true, moved, categories: config.categories });
      }

      /* ── git：状态、初始化并连上远端 ── */
      if (req.method === 'GET' && p === '/api/git') return send(res, 200, await gitInfo(root));
      if (req.method === 'POST' && p === '/api/git/init') {
        try { return send(res, 200, await gitInit(root, await readJson(req))); } catch (e) { return send(res, 400, { error: e.message }); }
      }

      /* ── 发布目标：写进 mori.config.ts 的 publish；p 为 null 是清除 ── */
      if (req.method === 'PUT' && p === '/api/publish-config') {
        const { publish } = await readJson(req);
        if (publish?.target === 'local' && !dev) return send(res, 400, { error: '“本地文件夹”只在开发模式下可用（用 pnpm dev 或 mori-studio --dev 启动）' });
        setPublish(configPath, publish ?? null);
        config = (await loadConfig(root)).config;
        return send(res, 200, { ok: true, publish: config.publish ?? null });
      }

      /* ── 友人帐 ── */
      if (p === '/api/friends' && req.method === 'GET') return send(res, 200, { friends: readFriends(root) });
      if (p === '/api/friends' && req.method === 'PUT') {
        try { return send(res, 200, { ok: true, friends: writeFriends(root, (await readJson(req)).friends) }); } catch (e) { return send(res, 400, { error: e.message }); }
      }
      if (p === '/api/friends/probe' && req.method === 'POST') {
        try { return send(res, 200, await probeSite((await readJson(req)).url)); } catch (e) { return send(res, 400, { error: e.message }); }
      }

      /* ── 页头入口：nav 为 null 是恢复默认（内置入口 + 所有页面） ── */
      if (p === '/api/nav' && req.method === 'PUT') {
        const wasUp = await isUp(preview.port);
        try {
          const body = await readJson(req);
          if ('nav' in body) setNav(configPath, body.nav ?? null);
          if ('actions' in body) setActions(configPath, body.actions ?? null);
        } catch (e) { return send(res, 400, { error: e.message }); }
        config = (await loadConfig(root)).config;
        await restartPreview(wasUp, true);
        return send(res, 200, { ok: true, nav: config.nav ?? null, actions: config.actions ?? null });
      }

      /* ── 标签：改名 / 合并 / 删除 ── */
      if (req.method === 'POST' && p === '/api/tags/rename') {
        const { from, to } = await readJson(req);
        if (!from) return send(res, 400, { error: '缺少标签名' });
        return send(res, 200, { ok: true, changed: renameTag(root, from, to ? String(to).trim() : null) });
      }

      /* ── 站点设置：改 mori.config.ts 里的单行字符串 ── */
      if (req.method === 'PUT' && p === '/api/config') {
        const { key, value } = await readJson(req);
        const wasUp = await isUp(preview.port);
        setConfigValue(configPath, key, value);
        config = (await loadConfig(root)).config;
        await restartPreview(wasUp, true); // 预览开着就让它读新配置
        return send(res, 200, { ok: true, config });
      }

      let mm;

      /* ── 评论管理 ── */
      if ((mm = m(/^\/api\/comments(?:\/(stats|token|seen|(\d+)))?$/))) {
        try {
          if (!mm[1] && req.method === 'GET') return send(res, 200, await admin('GET', `/comments?limit=300${url.searchParams.get('status') ? `&status=${url.searchParams.get('status')}` : ''}`));
          if (mm[1] === 'stats' && req.method === 'GET') return send(res, 200, await admin('GET', '/stats'));
          if (mm[1] === 'seen' && req.method === 'POST') { writeState({ commentsSeenAt: Date.now() }); return send(res, 200, { ok: true }); }
          if (mm[1] === 'token' && req.method === 'PUT') {
            const { token } = await readJson(req);
            writeState({ adminToken: String(token ?? '').trim() });
            return send(res, 200, { ok: true });
          }
          if (mm[2] && req.method === 'PATCH') return send(res, 200, await admin('PATCH', `/comments/${mm[2]}`, await readJson(req)));
          if (mm[2] && req.method === 'DELETE') return send(res, 200, await admin('DELETE', `/comments/${mm[2]}`));
        } catch (e) { return send(res, e.code ?? 500, { error: e.message }); }
      }

      /* ── 文章 ── */
      if ((mm = m(/^\/api\/entry\/(post|travel|page)\/([^/]+)$/))) {
        const [, kind, id] = mm;
        if (!isId(id)) return send(res, 400, { error: 'id 只能用字母、数字、下划线和连字符' });
        if (req.method === 'GET') return entryExists(root, kind, id) ? send(res, 200, readEntry(root, kind, id)) : send(res, 404, { error: '没有这篇' });
        if (req.method === 'PUT') {
          const data = await readJson(req);
          const v = validateEntry(kind, data);
          // 校验不通过也允许保存草稿（写作过程中难免不完整），但把问题原样返回；`?strict=1` 时拒绝
          if (!v.ok && url.searchParams.get('strict')) return send(res, 422, v);
          writeEntry(root, kind, id, data);
          // 使用自建评论时：这次修改会不会让已有的引用评论找不到原文？只提醒，不阻止保存
          let annotationWarnings;
          if (kind !== 'page' && commentsEndpoint() && adminToken()) {
            try {
              const list = await admin('GET', `/comments?status=approved&limit=500&entry=${encodeURIComponent(`${KINDS[kind]}/${id}`)}`);
              annotationWarnings = brokenAnnotations(kind, data, list.comments);
            } catch { /* 评论服务连不上就不检查 */ }
          }
          return send(res, 200, { ...v, saved: true, annotationWarnings });
        }
        if (req.method === 'DELETE') { trashEntry(root, kind, id); return send(res, 200, { ok: true }); }
      }
      if (req.method === 'POST' && (mm = m(/^\/api\/entry\/(post|travel|page)$/))) {
        const kind = mm[1];
        const { id, title, category } = await readJson(req);
        if (!isId(id)) return send(res, 400, { error: 'id 只能用字母、数字、下划线和连字符' });
        if (kind === 'page' && RESERVED_SLUGS.includes(id.toLowerCase())) return send(res, 400, { error: `“${id}” 已经是站点自带的地址，页面不能叫这个名字` });
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

      /* ── 文件：图片列表（含尺寸、被谁引用）、删除 ── */
      if (req.method === 'GET' && p === '/api/assets') {
        const list = assetUsage(root);
        for (const a of list) {
          if (a.name.toLowerCase().endsWith('.svg')) continue;
          try { const m = await sharp(join(root, 'src/assets', a.name)).metadata(); a.width = m.width; a.height = m.height; } catch { /* 读不出尺寸就不显示 */ }
        }
        return send(res, 200, { assets: list.sort((a, b) => b.mtime - a.mtime) });
      }
      if (req.method === 'DELETE' && (mm = m(/^\/api\/asset\/(.+)$/))) {
        try { trashAsset(root, decodeURIComponent(mm[1])); return send(res, 200, { ok: true }); } catch (e) { return send(res, 400, { error: e.message }); }
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
        const url = await previewUrl(preview.port);
        return send(res, 200, { port: preview.port, url, up: !!url });
      }
      if (req.method === 'POST' && p === '/api/preview/stop') {
        // 只停自己拉起的；用户自己开的 dev 服务器不动
        if (preview.startedByStudio) { runAstro(['dev', 'stop'], { stdio: 'ignore' }); preview.startedByStudio = false; }
        return send(res, 200, { ok: true });
      }

      /* ── 发布：先构建（内容有错就在这里拦下），再按 mori.config 里的 publish 发出去。输出一路推给界面 ── */
      if (req.method === 'POST' && p === '/api/publish') {
        const pub = config.publish, multi = pub?.target === 'git' || pub?.target === 'local'; // 这两种要多步，自己处理
        const target = multi ? { label: pub.target === 'git' ? 'Git 仓库' : `本地目录 ${pub.dest}` } : publishCommand(pub, root);
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        if (target.error) return res.end(`${target.error}\n[exit 2]\n`);
        if (pub.target === 'local' && !dev) return res.end('“本地文件夹”只在开发模式下可用（用 pnpm dev 或 mori-studio --dev 启动）。\n[exit 2]\n');
        const pipe = (child, done) => { child.stdout.on('data', (d) => res.write(d)); child.stderr.on('data', (d) => res.write(d)); child.on('error', (e) => { res.write(`${e.message}\n`); done(127); }); child.on('close', done); };
        const wasUp = await isUp(preview.port);
        const finish = async (text, code) => res.end(`${text}${await restartPreview(wasUp)}[exit ${code}]\n`);
        res.write('▸ 构建\n');
        pipe(runAstro(['build'], { env: { ...process.env, FORCE_COLOR: '0' } }), async (code) => {
          if (code) return finish('\n构建失败，没有发布。\n', code);
          res.write(`\n▸ 发布：${target.label}\n`);
          if (multi) {
            const c = pub.target === 'git' ? await publishGit(root, pub, (t) => res.write(t)) : publishLocal(root, pub.dest, (t) => res.write(t));
            return finish(`\n${c ? '发布失败' : '已发布'}\n`, c);
          }
          pipe(spawn(target.cmd, target.args, { cwd: root, env: { ...process.env, FORCE_COLOR: '0' } }), (c) => finish(`\n${c ? '发布失败' : '已发布'}\n`, c));
        });
        return;
      }

      /* ── 构建：输出一路推给界面 ── */
      if (req.method === 'POST' && p === '/api/build') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        const wasUp = await isUp(preview.port);
        const child = runAstro(['build'], { env: { ...process.env, FORCE_COLOR: '0' } });
        child.stdout.on('data', (d) => res.write(d));
        child.stderr.on('data', (d) => res.write(d));
        child.on('close', async (code) => res.end(`${await restartPreview(wasUp)}\n[exit ${code}]\n`));
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
