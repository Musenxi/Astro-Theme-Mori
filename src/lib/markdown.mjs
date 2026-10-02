/**
 * Markdown ⇄ MORI 块（纯函数，Node 和浏览器都能用）。
 * mori-md 命令行用它做导入导出；Studio 的 Markdown 写作页用它在文本和块之间转换。
 * 处理的块：段落、## / ### 标题、引用、图片、列表、围栏代码；行内的 **粗** *斜* `码` [链接](地址)、[^id] 脚注，
 * 和地点 [地名](geo:纬度,经度)（geo URI，可以带 ?en=英文名&date=日期）。
 * 图组、双图、自由排布里的图在文本里只是一行行图片；地图、位置、缩放、竖排这些版式信息不出现在文本里，由 Studio 保存时对回原来的块。
 */
import { parsePlaceHref, placeHref } from './flow.mjs';

/* ───────────── 行内：文字 + 标注 ───────────── */
const INLINE = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\[\]\((geo:[^)\s]+)\))|(\[\^([^\]]+)\])/;

export function parseInline(text, marks = []) {
  const spans = [];
  const push = (t, ms) => t && spans.push(ms.length ? { t, marks: ms } : { t });
  // 每次调用都要新建正则：递归解析嵌套标注时，共用一个全局正则的 lastIndex 会互相踩
  const re = new RegExp(INLINE.source, 'g');
  let last = 0, m;
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index), marks);
    if (m[1]) spans.push(...parseInline(m[2], [...marks, { type: 'strong' }]));
    else if (m[3]) spans.push(...parseInline(m[4], [...marks, { type: 'em' }]));
    else if (m[5]) push(m[6], [...marks, { type: 'code' }]);
    else if (m[7]) spans.push(...parseInline(m[8], [...marks, parsePlaceHref(m[9]) ?? { type: 'link', href: m[9] }]));
    else if (m[10]) { const pl = parsePlaceHref(m[11]); if (pl) spans.push({ t: '', marks: [...marks, pl] }); else push(m[0], marks); } // 不写地名的地点：[](geo:…)
    else if (m[12]) spans.push({ t: '', marks: [...marks, { type: 'fn', ref: m[13] }] });
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

    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const code = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) code.push(lines[i]);
      i++;
      blocks.push({ id: id(), type: 'code', ...(fence[1] ? { lang: fence[1] } : {}), code: code.join('\n') });
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
    for (; i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|!\[|\[\^[^\]]+\]:)/.test(lines[i]) && !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i]); i++) para.push(lines[i]);
    if (!para.length) para.push(lines[i++]); // 保证至少前进一行
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
        case 'link': return `[${t}](${m.href})`;
        case 'place': return `[${t}](${placeHref(m)})`;
        case 'note': case 'fn': return `${t}[^${m.ref}]`;
        default: return t; // tcy 等只影响排版
      }
    }, s.t))
    .join('');

/** 一个文字块或图片 → Markdown；图组、地图这类长卷的块没有对应的写法，返回空 */
export function blockMd(b) {
  switch (b.type) {
    case 'p': return inlineMd(b.text);
    case 'h': return `${'#'.repeat(b.level ?? 2)} ${inlineMd(b.text)}`;
    case 'quote': return `> ${inlineMd(b.text)}${b.cite ? `\n> —— ${b.cite}` : ''}`;
    case 'image': return `![${b.alt ?? ''}](${b.src}${b.caption ? ` "${b.caption}"` : ''})`;
    case 'list': return b.items.map((it, k) => `${b.ordered ? `${k + 1}.` : '-'} ${inlineMd(it)}`).join('\n');
    case 'code': return `\`\`\`${b.lang ?? ''}\n${b.code}\n\`\`\``;
    default: return '';
  }
}

const imgLine = (im) => `![${im.alt ?? ''}](${im.src ?? ''}${im.caption ? ` "${im.caption}"` : ''})`;

/**
 * 块摊平成 Markdown 里的一项一项：文字块一项，图片一项；双图、图组、网格、自由排布里每张图一项；地图和自由排布里的小字不在文本里。
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
      case 'map': break;
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

