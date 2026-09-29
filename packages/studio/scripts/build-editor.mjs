// 把 CodeMirror 打成一个文件放进 ui/vendor/：`pnpm build:editor`。生成物提交进仓库，运行 Studio 不需要构建。
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const r = await build({ entryPoints: [join(here, 'editor-entry.js')], outfile: join(here, '../ui/vendor/cm.js'), bundle: true, format: 'esm', minify: true, target: 'es2022', legalComments: 'none', metafile: true, logLevel: 'warning' });
const out = Object.values(r.metafile.outputs)[0];
console.log(`ui/vendor/cm.js  ${(out.bytes / 1024).toFixed(0)} KB`);
