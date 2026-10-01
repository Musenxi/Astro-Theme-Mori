#!/usr/bin/env node
/**
 *   mori-studio [--root 站点项目目录] [--port 4400] [--dev]
 *   --dev（或环境变量 MORI_STUDIO_DEV=1）：开发模式。构建后自动重启预览用的 astro dev，发布目标里多一个“本地文件夹”。不加就是正常运行。
 * 在站点项目的根目录运行（那里有 mori.config.ts 和 src/content），然后打开输出的地址。
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStudio } from '../src/server.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** 界面（app/）是用 Vite 构建的；没构建过、或者界面源码比构建产物新，就先构建一次（几秒钟） */
async function ensureUi() {
  if (process.env.MORI_STUDIO_NO_BUILD === '1') return;
  const out = join(here, '../dist/index.html');
  const newest = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((t, e) => Math.max(t, e.isDirectory() ? newest(join(dir, e.name)) : statSync(join(dir, e.name)).mtimeMs), 0);
  const src = Math.max(newest(join(here, '../app/src')), statSync(join(here, '../app/index.html')).mtimeMs);
  if (existsSync(out) && statSync(out).mtimeMs >= src) return;
  console.log('正在构建界面（第一次运行、或界面有更新时才需要，几秒钟）……');
  const { build } = await import('vite');
  await build({ configFile: join(here, '../app/vite.config.ts'), logLevel: 'warn' });
}


const args = process.argv.slice(2);
const opt = (name, def) => { const k = args.indexOf(`--${name}`); return k >= 0 ? args[k + 1] : def; };

try {
  await ensureUi();
  const dev = args.includes('--dev') || process.env.MORI_STUDIO_DEV === '1';
  const { url, root } = await startStudio({ root: opt('root', process.cwd()), port: +opt('port', 4400), dev });
  console.log(`MORI Studio${dev ? '（开发模式）' : ''}\n  项目  ${root}\n  地址  ${url}\n\n只监听本机（127.0.0.1）。Ctrl+C 退出。`);
} catch (e) {
  console.error(`启动失败：${e.message}`);
  process.exit(1);
}
