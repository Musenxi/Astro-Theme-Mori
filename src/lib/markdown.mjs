/**
 * Markdown ⇄ MORI 块（纯函数，Node 和浏览器都能用）。
 * mori-md 命令行用它做导入导出；Studio 的 Markdown 写作页用它在文本和块之间转换。
 * 处理的块：段落、## / ### 标题、引用、图片、列表、围栏代码；行内的 **粗** *斜* `码` [链接](地址)、[^id] 脚注，
 * 和地点 [地名](geo:纬度,经度)（geo URI，可以带 ?en=英文名&date=日期）。
 * 扩展语法：提示框 > [!NOTE]（也认 ::: warning 和 ::: banner {error} 的写法）、公式块 $$…$$、单独一行的知名网站链接（做成卡片）；
 * 行内的 ||剧透||、$公式$、表情 :[包名_表情名]、提及 [名字]{GH@用户名}（存成主页链接）、<网址> 和裸网址。
 * 图组、双图、自由排布里的图在文本里只是一行行图片；地图、位置、缩放、竖排这些版式信息不出现在文本里，由 Studio 保存时对回原来的块。
 */
import { parsePlaceHref, placeHref } from './flow.mjs';
import { cardOf, MENTION } from './sites.mjs';

/* ───────────── 行内：文字 + 标注 ───────────── */
const INLINE = new RegExp([
  /(\*\*([^*]+)\*\*)/, /(\*([^*]+)\*)/, /(`([^`]+)`)/, /(\[([^\]]+)\]\(([^)\s]+)\))/, /(\[\]\((geo:[^)\s]+)\))/, /(\[\^([^\]]+)\])/,
  new RegExp(`(\\[([^\\]]+)\\]\\{(${Object.keys(MENTION).join('|')})@([^}\\s]+)\\})`), // 提及
  /(\|\|([^|\n]+?)\|\|)/, // 剧透
  /(\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d))/, // 公式：$ 里外都不贴空格，后面不跟数字（免得把 $5 和 $10 当成公式）
  /(<(https?:\/\/[^>\s]+)>)/, /(https?:\/\/(?:[\w\-.~:/?#@!$&'*+,;=%]|\([\w\-.~:/?#@!$&'*+,;=%]*\))+)/, // <网址>、裸网址（只认网址里能出现的字符，后面紧跟的中文不算；成对的括号算）
  /((?<![\p{L}\p{N}_])_([^_\n]+)_(?![\p{L}\p{N}_]))/, // _斜体_（前后贴着字母数字的不算，免得把 snake_case 拆开）
  /(:\[([^\]\n]+)\](?![({]))/, // 表情 :[包名_表情名]
].map((r) => r.source).join('|'), 'u');
/** 裸网址末尾的标点不算网址 */
const URL_TAIL = /[.,;:!?'"。，、；：！？”’]+$/;

export function parseInline(text, marks = []) {
  const spans = [];
  const push = (t, ms) => t && spans.push(ms.length ? { t, marks: ms } : { t });
  // 每次调用都要新建正则：递归解析嵌套标注时，共用一个全局正则的 lastIndex 会互相踩
  const re = new RegExp(INLINE.source, 'gu');
  let last = 0, m;
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index), marks);
    if (m[1]) spans.push(...parseInline(m[2], [...marks, { type: 'strong' }]));
    else if (m[3]) spans.push(...parseInline(m[4], [...marks, { type: 'em' }]));
    else if (m[5]) push(m[6], [...marks, { type: 'code' }]);
    else if (m[7]) spans.push(...parseInline(m[8], [...marks, parsePlaceHref(m[9]) ?? { type: 'link', href: m[9] }]));
    else if (m[10]) { const pl = parsePlaceHref(m[11]); if (pl) spans.push({ t: '', marks: [...marks, pl] }); else push(m[0], marks); } // 不写地名的地点：[](geo:…)
    else if (m[12]) spans.push({ t: '', marks: [...marks, { type: 'fn', ref: m[13] }] });
    else if (m[14]) spans.push(...parseInline(m[15], [...marks, { type: 'link', href: MENTION[m[16]](m[17]) }]));
    else if (m[18]) spans.push(...parseInline(m[19], [...marks, { type: 'spoiler' }]));
    else if (m[20]) push(m[21], [...marks, { type: 'math' }]);
    else if (m[22]) push(m[23], [...marks, { type: 'link', href: m[23] }]);
    else if (m[24]) {
      const url = m[24].replace(URL_TAIL, '');
      push(url, [...marks, { type: 'link', href: url }]);
      last = re.lastIndex = m.index + url.length;
      continue;
    }
    else if (m[25]) spans.push(...parseInline(m[26], [...marks, { type: 'em' }]));
    else if (m[27]) push(m[28], [...marks, { type: 'emoji' }]);
    last = m.index + m[0].length;
  }
  push(text.slice(last), marks);
  return spans.length ? spans : [{ t: '' }];
}

/* ───────────── Markdown → JSON ───────────── */
function frontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return [{}, src];
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return [meta, src.slice(m[0].length)];
}

const KINDS = { note: 'note', info: 'note', tip: 'tip', hint: 'tip', success: 'tip', important: 'important', warning: 'warning', warn: 'warning', attention: 'warning', caution: 'caution', danger: 'caution', error: 'caution', alert: 'caution' };
const calloutKind = (k) => KINDS[k.toLowerCase()] ?? 'note';

/** 提示框里的几行 → 一段一段（空行分段）；一段也没有时给一个空段 */
function paragraphs(lines) {
  const out = [];
  let cur = [];
  const flush = () => { if (cur.length) out.push(parseInline(cur.map((s) => s.trim()).reduce((a, s) => (a && /[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(s) ? `${a} ${s}` : a + s), ''))); cur = []; };
  for (const l of lines) (l.trim() ? cur.push(l) : flush());
  flush();
  return out.length ? out : [[{ t: '' }]];
}

/** 一行只有一个网址（裸写、<网址>、[文字](网址)）时返回网址 */
function soleUrl(line) {
  const s = line.trim();
  const m = s.match(/^<(https?:\/\/[^>\s]+)>$/) ?? s.match(/^\[[^\]]*\]\((https?:\/\/[^)\s]+)\)$/) ?? s.match(/^(https?:\/\/\S+)$/);
  return m?.[1] ?? null;
}

/** 正文 Markdown → 块 + 注释表。一级标题不进块，作为 title 返回 */
export function parseBlocks(body) {
  const lines = body.split(/\r?\n/);
  const meta = {};
  const blocks = [], notes = {};
  let n = 0;
  const id = () => `b${String(++n).padStart(2, '0')}`;
  // 中文段落里的硬换行不算空格：直接接起来；含西文时补一个空格
  const join = (ls) => ls.map((s) => s.trim()).reduce((a, s) => (a && /[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(s) ? `${a} ${s}` : a + s), '');

  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fn = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/); // 脚注定义
    if (fn) { notes[fn[1]] = { text: parseInline(fn[2]) }; i++; continue; }

    const fence = line.match(/^```([^\s{]*)\s*(.*)$/);
    if (fence) {
      const code = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) code.push(lines[i]);
      i++;
      blocks.push({ id: id(), type: 'code', ...(fence[1] ? { lang: fence[1] } : {}), ...fenceMeta(fence[2]), code: code.join('\n') });
      continue;
    }

    if (line.trim().startsWith('$$')) { // 公式块：$$ 单独成行，或者整个写在一行里
      const one = line.trim().match(/^\$\$(.+)\$\$$/);
      const tex = [];
      if (one) { tex.push(one[1]); i++; }
      else {
        const first = line.trim().slice(2);
        if (first) tex.push(first);
        for (i++; i < lines.length && !lines[i].trim().endsWith('$$'); i++) tex.push(lines[i]);
        if (i < lines.length) { const tail = lines[i].trim().slice(0, -2); if (tail) tex.push(tail); i++; }
      }
      blocks.push({ id: id(), type: 'math', tex: tex.join('\n').trim() });
      continue;
    }

    const box = line.match(/^:::\s*(\w+)(?:\s*\{(\w+)\})?/); // ::: warning … ::: / ::: banner {error} … :::
    if (box) {
      const body = [];
      for (i++; i < lines.length && !/^:::\s*$/.test(lines[i]); i++) body.push(lines[i]);
      i++;
      blocks.push({ id: id(), type: 'callout', kind: calloutKind(box[2] ?? box[1]), text: paragraphs(body) });
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      // 一级标题当作标题元信息（如果没写 title），其余 ## → 2，### 及更深 → 3
      if (h[1].length === 1) { meta.title ??= h[2].trim(); i++; continue; }
      blocks.push({ id: id(), type: 'h', level: h[1].length === 2 ? 2 : 3, text: parseInline(h[2].trim()) });
      i++; continue;
    }

    const img = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/);
    if (img) {
      blocks.push({ id: id(), type: 'image', src: img[2], alt: img[1], ...(img[3] ? { caption: img[3] } : {}) });
      i++; continue;
    }

    if (line.startsWith('>')) {
      const q = [];
      for (; i < lines.length && lines[i].startsWith('>'); i++) q.push(lines[i].replace(/^>\s?/, ''));
      const alert = q[0]?.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i); // GitHub 的提示框
      if (alert) { blocks.push({ id: id(), type: 'callout', kind: alert[1].toLowerCase(), text: paragraphs(q.slice(1)) }); continue; }
      let cite;
      const last = q[q.length - 1]?.match(/^(?:——|—|--)\s*(.+)$/);
      if (last) { cite = last[1]; q.pop(); }
      blocks.push({ id: id(), type: 'quote', text: parseInline(join(q.filter(Boolean))), ...(cite ? { cite } : {}) });
      continue;
    }

    const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+/);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const items = [];
      for (; i < lines.length && /^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i]); i++) items.push(parseInline(lines[i].replace(/^(\s*)([-*+]|\d+[.)])\s+/, '')));
      blocks.push({ id: id(), type: 'list', ...(ordered ? { ordered: true } : {}), items });
      continue;
    }

    const para = [];
    for (; i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|!\[|\[\^[^\]]+\]:|:::|\s*\$\$)/.test(lines[i]) && !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i]); i++) para.push(lines[i]);
    if (!para.length) para.push(lines[i++]); // 保证至少前进一行
    const url = para.length === 1 && soleUrl(para[0]);
    if (url && cardOf(url)) { blocks.push({ id: id(), type: 'embed', url }); continue; } // 单独一行的知名网站链接：卡片
    blocks.push({ id: id(), type: 'p', text: parseInline(join(para)) });
  }

  return { title: meta.title, blocks, notes };
}

export function markdownToPost(src, { category = 'essays' } = {}) {
  const [meta, body] = frontmatter(src);
  const parsed = parseBlocks(body);
  meta.title ??= parsed.title;
  const { blocks, notes } = parsed;
  const firstP = blocks.find((b) => b.type === 'p');
  const plain = (spans) => spans.map((s) => s.t).join('');
  return {
    title: meta.title ?? '未命名',
    ...(meta.subtitle ? { subtitle: meta.subtitle } : {}),
    date: (meta.date ?? new Date().toISOString().slice(0, 10)).slice(0, 10),
    category: meta.category ?? category,
    excerpt: meta.excerpt ?? meta.description ?? (firstP ? plain(firstP.text).slice(0, 40) : ''),
    ...(meta.cover ? { cover: meta.cover } : {}),
    ...(meta.draft === 'true' ? { draft: true } : {}),
    ...(Object.keys(notes).length ? { notes } : {}),
    blocks,
  };
}

/* ───────────── JSON → Markdown ───────────── */
export const inlineMd = (spans) =>
  (typeof spans === 'string' ? [{ t: spans }] : spans) // 手写的 JSON 里，文字可以是裸字符串
    .map((s) => (s.marks ?? []).reduceRight((t, m) => {
      switch (m.type) {
        case 'strong': return `**${t}**`;
        case 'em': return `*${t}*`;
        case 'code': return `\`${t}\``;
        case 'link': return t === m.href && /^https?:\/\//.test(t) ? `<${t}>` : `[${t}](${m.href})`;
        case 'spoiler': return `||${t}||`;
        case 'math': return `$${t}$`;
        case 'emoji': return `:[${t}]`;
        case 'place': return `[${t}](${placeHref(m)})`;
        case 'note': case 'fn': return `${t}[^${m.ref}]`;
        default: return t; // tcy 等只影响排版
      }
    }, s.t))
    .join('');

/** 代码围栏后面的说明：```ts filename="a.ts" {1,3-5}（filename 也可以写成 title） */
function fenceMeta(meta) {
  const name = meta.match(/(?:filename|title)="([^"]*)"/)?.[1];
  const lines = meta.match(/\{([\d,\s-]+)\}/)?.[1].replace(/\s/g, '');
  return { ...(name ? { filename: name } : {}), ...(lines ? { highlight: lines } : {}) };
}

/** 一个文字块或图片 → Markdown；图组、地图这类长卷的块没有对应的写法，返回空 */
export function blockMd(b) {
  switch (b.type) {
    case 'p': return inlineMd(b.text);
    case 'h': return `${'#'.repeat(b.level ?? 2)} ${inlineMd(b.text)}`;
    case 'quote': return `> ${inlineMd(b.text)}${b.cite ? `\n> —— ${b.cite}` : ''}`;
    case 'image': return `![${b.alt ?? ''}](${b.src}${b.caption ? ` "${b.caption}"` : ''})`;
    case 'list': return b.items.map((it, k) => `${b.ordered ? `${k + 1}.` : '-'} ${inlineMd(it)}`).join('\n');
    case 'callout': return [`> [!${(b.kind ?? 'note').toUpperCase()}]`, ...b.text.map(inlineMd).flatMap((t, k) => (k ? ['>', `> ${t}`] : [`> ${t}`]))].join('\n');
    case 'math': return `$$\n${b.tex}\n$$`;
    case 'embed': return b.url;
    case 'code': return `\`\`\`${[b.lang ?? '', b.filename ? `filename="${b.filename}"` : '', b.highlight ? `{${b.highlight}}` : ''].filter(Boolean).join(' ')}\n${b.code}\n\`\`\``;
    default: return '';
  }
}

const imgLine = (im) => `![${im.alt ?? ''}](${im.src ?? ''}${im.caption ? ` "${im.caption}"` : ''})`;

/**
 * 块摊平成 Markdown 里的一项一项：文字块一项，图片一项；双图、图组、网格、自由排布里每张图一项；地图、幕间和自由排布里的小字不在文本里。
 * 项：{ block（块 id）, k（是这个块里的第几项）, kind（p / h / quote / list / code / img）, md, 以及图的 src / alt / caption }
 */
export function mdItems(blocks) {
  const items = [];
  for (const b of blocks ?? []) {
    const img = (im, k) => items.push({ block: b.id, k, kind: 'img', md: imgLine(im), src: im.src, alt: im.alt, caption: im.caption });
    switch (b.type) {
      case 'image': img(b, 0); break;
      case 'pair': case 'strip': case 'grid': (b.images ?? []).forEach(img); break;
      case 'free': (b.items ?? []).forEach((it, k) => { if (it.kind === 'image') img(it, k); }); break;
      case 'map': case 'interlude': break;
      default: { const md = blockMd(b); if (md) items.push({ block: b.id, k: 0, kind: b.type, md }); }
    }
  }
  return items;
}

/** 块 + 注释表 → 正文 Markdown（不含 front matter） */
export function blocksToMarkdown(post) {
  const out = mdItems(post.blocks).map((it) => it.md);
  const notes = Object.entries(post.notes ?? {}).map(([k, v]) => `[^${k}]: ${inlineMd(v.text)}`);
  return out.join('\n\n') + (notes.length ? `\n\n${notes.join('\n')}` : '') + '\n';
}

export function postToMarkdown(post) {
  const fm = ['---', `title: ${post.title}`, ...(post.subtitle ? [`subtitle: ${post.subtitle}`] : []), `date: ${String(post.date).slice(0, 10)}`, `category: ${post.category}`, `excerpt: ${post.excerpt}`, ...(post.cover ? [`cover: ${post.cover}`] : []), '---', ''];
  return fm.join('\n') + '\n' + blocksToMarkdown(post);
}

