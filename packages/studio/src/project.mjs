/**
 * 项目文件的读写：Studio 直接读写站点项目里的内容文件（src/content/posts、src/content/travels、src/assets）。
 * 不需要 git；“删除”是移进 .mori-trash/，不会真的删掉。
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { loadConfigFromFile } from 'vite';

export const KINDS = { post: 'posts', travel: 'travels' };
const ID = /^[a-z0-9][a-z0-9_-]*$/i;
export const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg']);

export const isId = (s) => typeof s === 'string' && ID.test(s);
const dirOf = (root, kind) => join(root, 'src/content', KINDS[kind]);
const fileOf = (root, kind, id) => join(dirOf(root, kind), `${id}.json`);

/** mori.config.ts：用 Vite 的配置加载器读（会处理 TypeScript） */
export async function loadConfig(root) {
  const path = ['mori.config.ts', 'mori.config.mjs', 'mori.config.js'].map((f) => join(root, f)).find(existsSync);
  if (!path) throw new Error(`在 ${root} 里没找到 mori.config.ts。请在站点项目的根目录运行 mori-studio，或用 --root 指定。`);
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, path, root);
  return { path, config: loaded?.config ?? {} };
}

export function listEntries(root) {
  const out = [];
  for (const kind of Object.keys(KINDS)) {
    const dir = dirOf(root, kind);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const id = basename(f, '.json');
      try {
        const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        out.push({ kind, id, title: d.title ?? id, date: String(d.date ?? '').slice(0, 10), category: d.category, draft: !!d.draft, pinned: !!d.pin });
      } catch (e) {
        out.push({ kind, id, title: `${id}（JSON 有语法错误）`, date: '', broken: true });
      }
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export const readEntry = (root, kind, id) => JSON.parse(readFileSync(fileOf(root, kind, id), 'utf8'));

export function writeEntry(root, kind, id, data) {
  mkdirSync(dirOf(root, kind), { recursive: true });
  writeFileSync(fileOf(root, kind, id), JSON.stringify(data, null, 2) + '\n');
}

export const entryExists = (root, kind, id) => existsSync(fileOf(root, kind, id));

/** 新建：给一个能通过校验的最小骨架 */
export function skeleton(kind, { title, category }) {
  const base = { title, date: new Date().toISOString().slice(0, 10), category, excerpt: '' };
  if (kind === 'post') return { ...base, blocks: [{ id: 'b01', type: 'p', text: '' }] };
  return {
    ...base,
    facts: [],
    stops: [{ id: 's1', name: '起点', lnglat: [0, 0] }],
    reading: { default: 'v', allowed: ['v', 'h', 'mix'], direction: 'ltr' },
    blocks: [{ id: 't01', type: 'text', stop: 's1', paras: [{ id: 't01p1', text: '' }] }],
  };
}

/** “删除”：移进 .mori-trash/，带时间戳，随时能拿回来 */
export function trashEntry(root, kind, id) {
  const trash = join(root, '.mori-trash');
  mkdirSync(trash, { recursive: true });
  renameSync(fileOf(root, kind, id), join(trash, `${Date.now()}-${kind}-${id}.json`));
}

export function listAssets(root) {
  const dir = join(root, 'src/assets');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => IMAGE_EXT.has(extname(f).toLowerCase())).sort();
}

export function saveAsset(root, name, buffer) {
  const dir = join(root, 'src/assets');
  mkdirSync(dir, { recursive: true });
  // 只留文件名，去掉路径；不覆盖已有文件（同名就加序号）
  let safe = basename(name).replace(/[^\w.\-一-龥]+/g, '_');
  const ext = extname(safe), stem = safe.slice(0, safe.length - ext.length);
  let k = 1;
  while (existsSync(join(dir, safe))) safe = `${stem}-${++k}${ext}`;
  writeFileSync(join(dir, safe), buffer);
  return safe;
}

/* ───────────── mori.config.ts 里的单行字符串设置 ───────────── */
const CONFIG_KEYS = new Set(['title', 'description', 'accent', 'accentDark', 'editorNote']);
/** 嵌套在 home / archive 块里的设置：'home.style'、'home.direction'、'archive.direction' */
const BLOCK_KEYS = { 'home.style': ['quote', 'cover'], 'home.direction': ['h', 'v'], 'archive.direction': ['h', 'v'] };
const quote = (v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

/**
 * 改配置文件里的一个字符串设置：只替换那一行的值，其余原样不动（保留作者的注释和排版）。
 * key 不在文件里时：顶层的 key 插到配置对象开头；editorNote 这种嵌套的要作者先自己写出来。value 为 null 表示删掉这一行。
 */
export function setConfigValue(configPath, key, value) {
  if (key in BLOCK_KEYS) return setBlockValue(configPath, key, value);
  if (!CONFIG_KEYS.has(key)) throw new Error(`不支持修改 ${key}`);
  let src = readFileSync(configPath, 'utf8');
  // 行尾允许有逗号和 // 注释，替换时原样保留
  const line = new RegExp(`^([ \\t]*)${key}[ \\t]*:[ \\t]*(['"\`])(?:\\\\.|(?!\\2).)*\\2([ \\t]*,?)([ \\t]*\\/\\/.*)?$`, 'm');
  if (value === null) {
    src = src.replace(new RegExp(line.source + '\\n?', 'm'), '');
  } else if (line.test(src)) {
    src = src.replace(line, (_, indent, _q, tail, comment) => `${indent}${key}: ${quote(value)}${tail}${comment ?? ''}`);
  } else if (key === 'editorNote') {
    throw new Error('mori.config.ts 里还没有 editorNote：请先在 home: { } 里写一行 editorNote: \'\'，再回来改。');
  } else {
    const open = src.match(/(defineMoriConfig\(\{|export default \{)[ \t]*\n/);
    if (!open) throw new Error('没在 mori.config.ts 里找到配置对象的开头，请手动添加。');
    src = src.replace(open[0], `${open[0]}  ${key}: ${quote(value)},\n`);
  }
  writeFileSync(configPath, src);
}

/**
 * 改 `home: { … }` / `archive: { … }` 块里的一个取值（只在这个块里找，不会碰到别的块里同名的 key）。
 * key 在块里没有就加进去；整个块都没有就新建一个。value 只能是允许的几个值之一。
 */
function setBlockValue(configPath, dotted, value) {
  const [block, key] = dotted.split('.');
  if (!BLOCK_KEYS[dotted].includes(value)) throw new Error(`${dotted} 只能是 ${BLOCK_KEYS[dotted].join(' / ')}`);
  let src = readFileSync(configPath, 'utf8');
  const open = src.match(new RegExp(`^([ \\t]*)${block}[ \\t]*:[ \\t]*\\{`, 'm'));
  if (!open) {
    const top = src.match(/(defineMoriConfig\(\{|export default \{)[ \t]*\n/);
    if (!top) throw new Error('没在 mori.config.ts 里找到配置对象的开头，请手动添加。');
    writeFileSync(configPath, src.replace(top[0], `${top[0]}  ${block}: { ${key}: '${value}' },\n`));
    return;
  }
  // 找这个块的结尾：从 { 之后数括号
  const from = open.index + open[0].length;
  let depth = 1, i = from;
  for (; i < src.length && depth > 0; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; }
  const end = i - 1, body = src.slice(from, end);
  const line = new RegExp(`(\\b${key}[ \\t]*:[ \\t]*)(['"\`])(?:\\\\.|(?!\\2).)*\\2`);
  let next;
  if (line.test(body)) next = body.replace(line, (_, k) => `${k}'${value}'`);
  else if (body.includes('\n')) next = `\n${open[1]}  ${key}: '${value}',${body}`;   // 多行：加在块的开头
  else next = ` ${key}: '${value}',${body.replace(/^\s*/, ' ')}`;                       // 单行：加在 { 后面
  writeFileSync(configPath, src.slice(0, from) + next + src.slice(end));
}
