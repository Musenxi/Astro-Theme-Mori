#!/usr/bin/env node
/**
 *   mori-studio [--root 站点项目目录] [--port 4400]
 * 在站点项目的根目录运行（那里有 mori.config.ts 和 src/content），然后打开输出的地址。
 */
import { startStudio } from '../src/server.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const k = args.indexOf(`--${name}`); return k >= 0 ? args[k + 1] : def; };

try {
  const { url, root } = await startStudio({ root: opt('root', process.cwd()), port: +opt('port', 4400) });
  console.log(`MORI Studio\n  项目  ${root}\n  地址  ${url}\n\n只监听本机（127.0.0.1）。Ctrl+C 退出。`);
} catch (e) {
  console.error(`启动失败：${e.message}`);
  process.exit(1);
}
