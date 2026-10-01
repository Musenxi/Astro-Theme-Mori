/**
 * 项目文件的读写：Studio 直接读写站点项目里的内容文件（src/content/posts（普通文章和游记）、src/assets）。
 * 不需要 git；“删除”是移进 .mori-trash/，不会真的删掉。
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, statSync, copyFileSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { loadConfigFromFile } from 'vite';

/** 普通文章和游记都在 src/content/posts/ 下，靠内容里的 kind 区分 */
export const KINDS = { post: 'posts', travel: 'posts', page: 'pages' };
export const kindOf = (d) => (d?.kind === 'travel' || (d?.kind === undefined && Array.isArray(d?.stops)) ? 'travel' : 'post');
const ID = /^[a-z0-9][a-z0-9_-]*$/i;
export const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg']);

export const isId = (s) => typeof s === 'string' && ID.test(s);
const dirOf = (root, kind) => join(root, 'src/content', KINDS[kind]);
const fileOf = (root, kind, id) => join(dirOf(root, kind), `${id}.json`);
/** 已发布的版本：点“发布”时把当前内容复制到这里，构建（astro build）只读这里；src/content 里的是正在写的版本 */
const pubDirOf = (root, kind) => join(root, 'src/published', KINDS[kind]);
const pubFileOf = (root, kind, id) => join(pubDirOf(root, kind), `${id}.json`);
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

/** 状态：有已发布版本就看它和正在写的是否一致；没有就是从没发布过。旧的、没有草稿标记又没有已发布版本的，当作已发布，补一份 */
function stateOf(root, kind, id, working) {
  const pf = pubFileOf(root, kind, id);
  if (!existsSync(pf) && !working.draft) { mkdirSync(pubDirOf(root, kind), { recursive: true }); copyFileSync(fileOf(root, kind, id), pf); }
  if (!existsSync(pf)) return { draft: true, changed: false };
  try {
    const pub = readJson(pf);
    return { draft: !!pub.draft, changed: JSON.stringify(pub) !== JSON.stringify(working) };
  } catch { return { draft: false, changed: true }; }
}

/** mori.config.ts：用 Vite 的配置加载器读（会处理 TypeScript） */
export async function loadConfig(root) {
  const path = ['mori.config.ts', 'mori.config.mjs', 'mori.config.js'].map((f) => join(root, f)).find(existsSync);
  if (!path) throw new Error(`在 ${root} 里没找到 mori.config.ts。请在站点项目的根目录运行 mori-studio，或用 --root 指定。`);
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, path, root);
  return { path, config: loaded?.config ?? {} };
}

export function listEntries(root) {
  const out = [];
  {
    const dir = dirOf(root, 'post');
    if (existsSync(dir)) for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const id = basename(f, '.json');
      try {
        const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        const kind = kindOf(d);
        out.push({ kind, id, title: d.title ?? id, date: String(d.date ?? '').slice(0, 10), category: d.category, tags: Array.isArray(d.tags) ? d.tags : [], words: wordCount(d), ...stateOf(root, kind, id, d), pinned: !!d.pin });
      } catch (e) {
        out.push({ kind: 'post', id, title: `${id}（JSON 有语法错误）`, date: '', broken: true });
      }
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** 正文字数：中日文按字算，西文按词算；代码块不计。只数 blocks 和 notes，标题、摘要不算 */
export function wordCount(doc) {
  const texts = [];
  const collect = (v) => {
    if (Array.isArray(v)) {
      if (v.length && v.every((x) => x && typeof x === 'object' && 't' in x)) texts.push(v.map((s) => s.t).join(''));
      else v.forEach((x) => (typeof x === 'string' ? texts.push(x) : collect(x)));
    } else if (v && typeof v === 'object') {
      if (v.type === 'code') return;
      for (const [k, x] of Object.entries(v)) {
        if (k === 'text' && typeof x === 'string') texts.push(x);
        else collect(x);
      }
    }
  };
  collect(doc.blocks); collect(doc.notes);
  const all = texts.join('\n');
  return (all.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g)?.length ?? 0) + (all.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0);
}

/** src/content/pages 里的页面数（页面管理做好之前，这里只是数文件） */
export function countPages(root) {
  const dir = join(root, 'src/content/pages');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).length : 0;
}

export const readEntry = (root, kind, id) => JSON.parse(readFileSync(fileOf(root, kind, id), 'utf8'));

export function writeEntry(root, kind, id, data) {
  mkdirSync(dirOf(root, kind), { recursive: true });
  writeFileSync(fileOf(root, kind, id), JSON.stringify(data, null, 2) + '\n');
}

export const entryExists = (root, kind, id) => existsSync(fileOf(root, kind, id));

/** 新建：给一个能通过校验的最小骨架 */
export function skeleton(kind, { title, category }) {
  if (kind === 'page') return { title, excerpt: '', template: 'default', draft: true, blocks: [{ id: 'b01', type: 'p', text: '' }] };
  const base = { title, date: new Date().toISOString().slice(0, 10), category, excerpt: '', draft: true };
  if (kind === 'post') return { kind: 'article', ...base, blocks: [{ id: 'b01', type: 'p', text: '' }] };
  return {
    kind: 'travel',
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
  const stamp = Date.now();
  renameSync(fileOf(root, kind, id), join(trash, `${stamp}-${kind}-${id}.json`));
  if (existsSync(pubFileOf(root, kind, id))) renameSync(pubFileOf(root, kind, id), join(trash, `${stamp}-${kind}-${id}.published.json`));
}

/** 发布：取消草稿标记，正在写的版本成为已发布版本 */
export function publishEntry(root, kind, id) {
  const d = readEntry(root, kind, id);
  delete d.draft;
  writeEntry(root, kind, id, d);
  mkdirSync(pubDirOf(root, kind), { recursive: true });
  writeFileSync(pubFileOf(root, kind, id), JSON.stringify(d, null, 2) + '\n');
  return d;
}

/** 转为草稿：站上立刻撤下（已发布的版本也标成草稿），正在写的内容不动 */
export function unpublishEntry(root, kind, id) {
  const d = readEntry(root, kind, id);
  d.draft = true;
  writeEntry(root, kind, id, d);
  const pf = pubFileOf(root, kind, id);
  if (existsSync(pf)) writeFileSync(pf, JSON.stringify({ ...readJson(pf), draft: true }, null, 2) + '\n');
}

/** 删除草稿：有已发布版本就退回去，丢掉没发布的修改；从没发布过的，整篇移进回收站 */
export function discardDraft(root, kind, id) {
  const pf = pubFileOf(root, kind, id);
  if (existsSync(pf)) { copyFileSync(pf, fileOf(root, kind, id)); return { removed: false }; }
  trashEntry(root, kind, id);
  return { removed: true };
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
const CONFIG_KEYS = new Set(['title', 'description', 'accent', 'accentDark', 'editorNote', 'actionsLayout']);
/** 嵌套在 home / archive / feed 块里的设置：'home.style'、'home.direction'、'archive.direction'、'feed.content' */
const BLOCK_KEYS = { 'home.style': ['quote', 'cover'], 'home.direction': ['h', 'v'], 'archive.direction': ['h', 'v'], 'feed.content': ['excerpt', 'full'], 'comments.avatar': ['cravatar', 'gravatar', 'none'] };
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
 * 改 `home: { … }` / `archive: { … }` / `feed: { … }` 块里的一个取值（只在这个块里找，不会碰到别的块里同名的 key）。
 * key 在块里没有就加进去；整个块都没有就新建一个。value 只能是允许的几个值之一。
 */
function setBlockValue(configPath, dotted, value) {
  const [block, key] = dotted.split('.');
  if (!BLOCK_KEYS[dotted].includes(value)) throw new Error(`${dotted} 只能是 ${BLOCK_KEYS[dotted].join(' / ')}`);
  let src = readFileSync(configPath, 'utf8');
  const open = src.match(new RegExp(`^([ \\t]*)${block}[ \\t]*:[ \\t]*\\{`, 'm'));
  // 评论的块自己带着服务地址等设置，不能凭空新建一个只有头像的 comments
  if (!open && block === 'comments') throw new Error('mori.config.ts 里还没有启用自建评论（comments: { provider: \'mori\', … }），先启用再选头像服务。');
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

/* ───────────── 分类：mori.config.ts 里的 categories 数组 ───────────── */

const q = (v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

/** 从 from（开括号之后）往后找配对的闭括号的位置的下一位；跳过字符串和 // 注释里的括号 */
function closeOf(src, from, open, close) {
  let depth = 1, i = from, quote = '';
  for (; i < src.length && depth > 0; i++) {
    const ch = src[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = ''; }
    else if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; }
    else if (ch === open) depth++;
    else if (ch === close) depth--;
  }
  return i;
}

/** 整个 categories 数组重写一遍（数组外的内容和注释不动）。分类是有序的，顺序就是分类在页面上的先后 */
export function setCategories(configPath, cats) {
  if (!Array.isArray(cats) || !cats.length) throw new Error('至少要有一个分类');
  const seen = new Set();
  for (const c of cats) {
    if (!isId(c.id)) throw new Error(`分类 id “${c.id}” 只能用字母、数字、下划线和连字符`);
    if (seen.has(c.id)) throw new Error(`分类 id “${c.id}” 重复`);
    seen.add(c.id);
    if (!String(c.zh ?? '').trim()) throw new Error(`分类 “${c.id}” 还没有中文名`);
  }
  const src = readFileSync(configPath, 'utf8');
  const open = src.match(/^([ \t]*)categories[ \t]*:[ \t]*\[/m);
  if (!open) throw new Error('mori.config.ts 里没找到 categories: [ … ]，请手动添加。');
  const from = open.index + open[0].length;
  const i = closeOf(src, from, '[', ']');
  const ind = open[1];
  const rows = cats.map((c) => `${ind}  { id: ${q(c.id)}, zh: ${q(c.zh)}, en: ${q(c.en ?? '')}${c.empty ? `, empty: ${q(c.empty)}` : ''} },`);
  writeFileSync(configPath, src.slice(0, from) + '\n' + rows.join('\n') + `\n${ind}]` + src.slice(i));
}

/** 改分类 id 时，用到它的文章一起改；返回改了几篇 */
export function renameCategoryInEntries(root, from, to) {
  let n = 0;
  for (const e of listEntries(root)) {
    if (e.category !== from) continue;
    const d = readEntry(root, e.kind, e.id);
    d.category = to; writeEntry(root, e.kind, e.id, d); n++;
  }
  return n;
}

/* ───────────── 标签：每篇文章的 tags 数组 ───────────── */

/** 改名 / 合并 / 删除标签。to 为 null 是删除；to 已经存在就是合并（同一篇里去重）。返回改了几篇 */
export function renameTag(root, from, to) {
  let n = 0;
  for (const e of listEntries(root)) {
    if (!e.tags.includes(from)) continue;
    const d = readEntry(root, e.kind, e.id);
    const next = d.tags.flatMap((t) => (t === from ? (to ? [to] : []) : [t]));
    d.tags = [...new Set(next)];
    if (!d.tags.length) delete d.tags;
    writeEntry(root, e.kind, e.id, d); n++;
  }
  return n;
}

/* ───────────── 发布目标：mori.config.ts 里的 publish ───────────── */

/** 校验发布设置。返回整理后的对象；不合法就抛错（说明哪里不对） */
export function checkPublish(p) {
  if (p?.target === 'cloudflare-pages') {
    const project = String(p.project ?? '').trim(), branch = String(p.branch ?? '').trim();
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(project)) throw new Error('Cloudflare Pages 项目名只能用字母、数字和连字符（在 Cloudflare 后台的 Pages 项目名）');
    if (branch && !/^[\w./-]+$/.test(branch)) throw new Error('分支名里有不合法的字符');
    return { target: 'cloudflare-pages', project, ...(branch ? { branch } : {}) };
  }
  if (p?.target === 'rsync') {
    const dest = String(p.dest ?? '').trim();
    if (!dest || dest.startsWith('-') || /\s/.test(dest)) throw new Error('服务器路径要写成 用户@主机:/目录/，不能有空格，也不能以 - 开头');
    return { target: 'rsync', dest };
  }
  if (p?.target === 'git') {
    const remote = String(p.remote ?? '').trim(), branch = String(p.branch ?? '').trim(), message = String(p.message ?? '').trim();
    if (remote && !/^[\w.-]+$/.test(remote)) throw new Error('远端名只能用字母、数字、点、下划线和连字符');
    if (branch && (!/^[\w./-]+$/.test(branch) || branch.startsWith('-'))) throw new Error('分支名里有不合法的字符');
    if (message.length > 200 || /\n/.test(message)) throw new Error('提交说明写成一行，不超过 200 字');
    return { target: 'git', ...(remote && remote !== 'origin' ? { remote } : {}), ...(branch ? { branch } : {}), ...(message ? { message } : {}) };
  }
  if (p?.target === 'local') {
    const dest = String(p.dest ?? '').trim();
    if (!/^(\/|~\/|[A-Za-z]:[\\/])/.test(dest)) throw new Error('本地目录要写绝对路径，如 /Users/你/Sites/blog 或 ~/Sites/blog');
    return { target: 'local', dest };
  }
  throw new Error('发布方式只能是 git、cloudflare-pages、rsync 或 local');
}

/** 写入 / 更新 / 删除（null）publish 设置；配置文件里其余内容不动 */
export function setPublish(configPath, p) {
  const src = readFileSync(configPath, 'utf8');
  const open = src.match(/^([ \t]*)publish[ \t]*:[ \t]*\{/m);
  if (p === null) {
    if (!open) return;
    const end = closeOf(src, open.index + open[0].length, '{', '}');
    writeFileSync(configPath, src.slice(0, open.index) + src.slice(end).replace(/^[ \t]*,?[ \t]*\n?/, ''));
    return;
  }
  const v = checkPublish(p);
  const line = `publish: { ${Object.entries(v).map(([k, x]) => `${k}: ${q(x)}`).join(', ')} },`;
  if (open) {
    const end = closeOf(src, open.index + open[0].length, '{', '}');
    writeFileSync(configPath, src.slice(0, open.index) + open[1] + line + src.slice(end).replace(/^[ \t]*,?/, ''));
    return;
  }
  const top = src.match(/(defineMoriConfig\(\{|export default \{)[ \t]*\n/);
  if (!top) throw new Error('没在 mori.config.ts 里找到配置对象的开头，请手动添加 publish。');
  writeFileSync(configPath, src.replace(top[0], `${top[0]}  ${line}\n`));
}

/* ───────────── 页面 ───────────── */

export function listPages(root) {
  const dir = dirOf(root, 'page');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const id = basename(f, '.json');
    try {
      const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      return { id, title: d.title ?? id, template: d.template ?? 'default', ...stateOf(root, 'page', id, d), comments: !!d.comments, words: wordCount(d) };
    } catch { return { id, title: `${id}（JSON 有语法错误）`, template: 'default', draft: false, changed: false, comments: false, words: 0, broken: true }; }
  }).sort((a, b) => a.id.localeCompare(b.id));
}

/** 页面的网址就是文件名，这些名字站点自己用了 */
export const RESERVED_SLUGS = ['posts', 'archive', 'category', 'search', 'travels', 'feed', 'rss', '404', 'sitemap', 'robots', 'favicon', '_astro', 'api'];

/* ───────────── 友人帐：src/content/friends.json ───────────── */

const friendsFile = (root) => join(root, 'src/content/friends.json');

export function readFriends(root) {
  const f = friendsFile(root);
  if (!existsSync(f)) return [];
  const list = JSON.parse(readFileSync(f, 'utf8'));
  return Array.isArray(list) ? list : [];
}

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 24);

/** 整理并校验友人帐：id 缺了就补、重复就加序号；网址必须是 http(s)；名字必填 */
export function checkFriends(list) {
  if (!Array.isArray(list)) throw new Error('友人帐要是一个列表');
  const used = new Set();
  return list.map((raw, i) => {
    const name = String(raw?.name ?? '').trim(), url = String(raw?.url ?? '').trim();
    if (!name) throw new Error(`第 ${i + 1} 位还没有名字`);
    let u;
    try { u = new URL(url); } catch { throw new Error(`「${name}」的网址不对：${url || '（空）'}`); }
    if (!/^https?:$/.test(u.protocol)) throw new Error(`「${name}」的网址要以 http:// 或 https:// 开头`);
    let id = String(raw?.id ?? '').trim() || slug(name) || `f${i + 1}`, k = 2;
    const base = id;
    while (used.has(id)) id = `${base}-${k++}`;
    used.add(id);
    const avatar = String(raw?.avatar ?? '').trim();
    return { id, name, url: u.href, desc: String(raw?.desc ?? '').trim(), ...(avatar ? { avatar } : {}), order: i };
  });
}

export function writeFriends(root, list) {
  const clean = checkFriends(list);
  mkdirSync(join(root, 'src/content'), { recursive: true });
  writeFileSync(friendsFile(root), JSON.stringify(clean, null, 2) + '\n');
  return clean;
}

/* ───────────── 页头入口：mori.config.ts 里的 nav 和 actions ───────────── */

const ICON_NAME = /^[A-Za-z0-9-]+$/;
const HREF = /^(\/|https?:\/\/)/;

/** 把 `key: [ … ]` 整个重写；rows 为 null 是删掉这一项（恢复默认）。rows 是已经写好的一行行源码 */
function writeList(configPath, key, rows) {
  const src = readFileSync(configPath, 'utf8');
  const open = src.match(new RegExp(`^([ \\t]*)${key}[ \\t]*:[ \\t]*\\[`, 'm'));
  if (rows === null) {
    if (!open) return;
    const end = closeOf(src, open.index + open[0].length, '[', ']');
    writeFileSync(configPath, src.slice(0, open.index) + src.slice(end).replace(/^[ \t]*,?[ \t]*\n?/, ''));
    return;
  }
  const body = (ind) => (rows.length ? `[\n${rows.map((r) => `${ind}  ${r},`).join('\n')}\n${ind}]` : '[]');
  if (open) {
    const end = closeOf(src, open.index + open[0].length, '[', ']');
    writeFileSync(configPath, src.slice(0, open.index) + `${open[1]}${key}: ${body(open[1])}` + src.slice(end));
    return;
  }
  const top = src.match(/(defineMoriConfig\(\{|export default \{)[ \t]*\n/);
  if (!top) throw new Error(`没在 mori.config.ts 里找到配置对象的开头，请手动添加 ${key}。`);
  writeFileSync(configPath, src.replace(top[0], `${top[0]}  ${key}: ${body('  ')},\n`));
}

/** 一个带名字、地址、可选图标的链接；入口和右侧操作共用这套校验 */
function checkLink(n) {
  const label = String(n?.label ?? '').trim();
  if (!label) throw new Error('每个入口都要有名字');
  if (!HREF.test(String(n?.href ?? ''))) throw new Error(`「${label}」的地址要以 / 或 http(s):// 开头`);
  if (n.icon != null && n.icon !== '' && !ICON_NAME.test(String(n.icon))) throw new Error(`「${label}」的图标名不对`);
  return `label: ${q(label)}, href: ${q(n.href)}${n.icon ? `, icon: ${q(n.icon)}` : ''}`;
}

/** nav 为 null 是恢复默认（内置入口 + 所有页面）；否则整个数组重写 */
export function setNav(configPath, nav) {
  if (nav === null) return writeList(configPath, 'nav', null);
  if (!Array.isArray(nav) || nav.length > 10) throw new Error('页头入口最多 10 个');
  writeList(configPath, 'nav', nav.map((n) => `{ ${checkLink(n)} }`));
}

/** 页头右侧的操作：昼夜切换、搜索之类的图标钮，也可以是任意链接。null 是恢复默认（只有昼夜切换），[] 是一个都不要 */
export function setActions(configPath, actions) {
  if (actions === null) return writeList(configPath, 'actions', null);
  if (!Array.isArray(actions) || actions.length > 6) throw new Error('右侧操作最多 6 个');
  if (actions.filter((a) => a?.type === 'theme').length > 1) throw new Error('昼夜切换只能有一个');
  writeList(configPath, 'actions', actions.map((a) => {
    if (a?.type === 'theme') return `{ type: 'theme'${a.style === 'icon' ? ", style: 'icon'" : ''} }`;
    if (a?.type === 'link') return `{ type: 'link', ${checkLink(a)} }`;
    throw new Error('不认识的操作类型');
  }));
}

/* ───────────── 文件（src/assets 里的图片）：谁在用它、删除 ───────────── */

/** 每张图片的大小、修改时间，以及被哪些内容引用（文章、页面、友人帐） */
export function assetUsage(root) {
  const names = listAssets(root);
  const texts = [];
  for (const [kind, dir] of [['post', 'posts'], ['page', 'pages']]) {
    const d = join(root, 'src/content', dir);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).filter((f) => f.endsWith('.json'))) {
      const id = basename(f, '.json');
      try { const raw = readFileSync(join(d, f), 'utf8'); const doc = JSON.parse(raw); texts.push({ raw, ref: { kind: kind === 'post' ? kindOf(doc) : 'page', id, title: doc.title ?? id } }); } catch { /* 有语法错误的文件跳过 */ }
    }
  }
  const fr = friendsFile(root);
  if (existsSync(fr)) texts.push({ raw: readFileSync(fr, 'utf8'), ref: { kind: 'friends', id: 'friends', title: '友人帐' } });
  return names.map((name) => {
    const st = statSync(join(root, 'src/assets', name));
    return { name, size: st.size, mtime: Math.round(st.mtimeMs), usedBy: texts.filter((t) => t.raw.includes(`assets/${name}`)).map((t) => t.ref) };
  });
}

/** 删除一张图片：移进 .mori-trash/assets/，不真的删 */
export function trashAsset(root, name) {
  if (basename(name) !== name || !IMAGE_EXT.has(extname(name).toLowerCase())) throw new Error('文件名不合法');
  const from = join(root, 'src/assets', name);
  if (!existsSync(from)) throw new Error('没有这张图片');
  const trash = join(root, '.mori-trash/assets');
  mkdirSync(trash, { recursive: true });
  renameSync(from, join(trash, `${Date.now()}-${name}`));
}
