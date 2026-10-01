#!/usr/bin/env node
/**
 * 找到本地开发用的站点项目，再在上面跑命令。站点不进 git（各人用自己的），所以仓库里不写死它的目录和包名。
 *
 *   node scripts/site.mjs                打印站点目录
 *   node scripts/site.mjs <命令…>        跑命令；参数里的 {site} 换成站点的包名，{dir} 换成站点目录
 *
 * 站点怎么找：环境变量 MORI_SITE（站点目录）优先；否则在 pnpm-workspace.yaml 列出的目录里找
 * 依赖 astro-mori、并且有 mori.config.* 的包，正好一个就用它。
 * 顺带把站点生成的内容类型（.astro/types.d.ts）接给主题的类型检查（packages/theme/.site-types.d.ts，不进 git）。
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIGS = ['mori.config.ts', 'mori.config.mjs', 'mori.config.js'];

const readPkg = (dir) => {
  try { return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); } catch { return null; }
};

/** pnpm-workspace.yaml 里的 `- a/*` / `- a/b` 展开成目录 */
function workspaceDirs() {
  const globs = [];
  let inPackages = false;
  for (const line of readFileSync(join(repo, 'pnpm-workspace.yaml'), 'utf8').split('\n')) {
    if (/^\S/.test(line)) inPackages = /^packages:\s*$/.test(line);
    else if (inPackages) {
      const m = line.match(/^\s+-\s*['"]?([^'"#\s]+)['"]?/);
      if (m) globs.push(m[1]);
    }
  }
  return globs.flatMap((g) => {
    if (!g.endsWith('/*')) return [join(repo, g)];
    const base = join(repo, g.slice(0, -2));
    return existsSync(base) ? readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(base, e.name)) : [];
  });
}

const isSite = (dir) => {
  const pkg = readPkg(dir);
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  return !!pkg && 'astro-mori' in deps && CONFIGS.some((c) => existsSync(join(dir, c)));
};

/** 站点目录和包名；找不到 / 找到好几个时抛错，错误信息就是给人看的说明 */
export function findSite() {
  const env = process.env.MORI_SITE;
  if (env) {
    const dir = resolve(env);
    if (!isSite(dir)) throw new Error(`MORI_SITE=${env} 不是站点项目（要有 package.json、依赖 astro-mori、有 mori.config.ts）。`);
    return { dir, name: readPkg(dir).name };
  }
  const found = workspaceDirs().filter(isSite);
  if (found.length === 0) throw new Error('没找到站点项目。在 examples/ 下放一个（有 package.json、依赖 astro-mori、有 mori.config.ts），或者用环境变量 MORI_SITE 指定站点目录。');
  if (found.length > 1) throw new Error(`找到好几个站点项目：${found.map((d) => d.slice(repo.length + 1)).join('、')}。用环境变量 MORI_SITE 指定用哪个。`);
  return { dir: found[0], name: readPkg(found[0]).name };
}

/** 主题的 tsconfig 收进这个文件，拿到站点生成的 astro:content 类型 */
function linkTypes(dir) {
  const theme = workspaceDirs().find((d) => readPkg(d)?.name === 'astro-mori');
  if (!theme) return;
  const file = join(theme, '.site-types.d.ts');
  const body = `// 由 scripts/site.mjs 生成，指向本地站点的内容类型；不进 git\n/// <reference path=${JSON.stringify(join(dir, '.astro/types.d.ts'))} />\n`;
  if (!existsSync(file) || readFileSync(file, 'utf8') !== body) writeFileSync(file, body);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let site;
  try { site = findSite(); } catch (e) { console.error(e.message); process.exit(1); }
  linkTypes(site.dir);
  const [cmd, ...args] = process.argv.slice(2).map((a) => a.replaceAll('{site}', site.name).replaceAll('{dir}', site.dir));
  if (!cmd) { console.log(site.dir); process.exit(0); }
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: process.cwd(), shell: process.platform === 'win32' });
  process.exit(r.status ?? 1);
}
