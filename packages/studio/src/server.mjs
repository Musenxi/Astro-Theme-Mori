/**
 * Studio 的本地服务：静态界面 + 一组读写项目文件的接口。只监听 127.0.0.1。
 * 界面用 Preact + htm，不需要构建：/vendor/ 直接指向 node_modules 里的现成模块文件。
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { loadConfig, listEntries, readEntry, writeEntry, entryExists, skeleton, trashEntry, listAssets, saveAsset, isId, KINDS, IMAGE_EXT } from './project.mjs';
import { validateEntry } from 'astro-mori/validate';

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

export async function startStudio({ root, port = 4400 }) {
  root = resolve(root);
  const { path: configPath, config } = await loadConfig(root);
  const preview = { port: 4321, startedByStudio: false }; // Astro 默认端口；项目已经在跑 dev（有锁，只能有一个）就直接复用
  const astroBin = () => join(dirname(require.resolve('astro/package.json', { paths: [root] })), 'bin/astro.mjs');
  const runAstro = (args, opts = {}) => spawn(process.execPath, [astroBin(), ...args], { cwd: root, ...opts });

  async function isUp(p) {
    try { return (await fetch(`http://127.0.0.1:${p}/`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
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
        return send(res, 200, {
          root, configPath, config: { title: config.title ?? 'MORI', accent: config.accent ?? '#002fa7', categories: config.categories ?? [], home: config.home, archive: config.archive },
          entries: listEntries(root), assets: listAssets(root), preview: { port: preview.port, up: await isUp(preview.port) },
        });
      }

      /* ── 文章 ── */
      let mm;
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
          return send(res, 200, { ...v, saved: true });
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
