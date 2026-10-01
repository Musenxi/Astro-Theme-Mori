/**
 * Markdown ⇄ MORI 块（纯函数，Node 和浏览器都能用）。
 * mori-md 命令行用它做导入导出；Studio 的 Markdown 写作页用它在文本和块之间转换。
 * 只处理普通文章的块：段落、## / ### 标题、引用、图片、列表、围栏代码；行内的 **粗** *斜* `码` [链接](地址) 和 [^id] 脚注。
 */

/* ───────────── 行内：文字 + 标注 ───────────── */
const INLINE = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\[\^([^\]]+)\])/;

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
    else if (m[7]) spans.push(...parseInline(m[8], [...marks, { type: 'link', href: m[9] }]));
    else if (m[10]) spans.push({ t: '', marks: [...marks, { type: 'fn', ref: m[11] }] });
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
        case 'note': case 'fn': return `${t}[^${m.ref}]`;
        default: return t; // tcy 等只影响排版
      }
    }, s.t))
    .join('');

/** 一个块 → Markdown。游记文字块里的段落（h / quote / list / code）也走这里 */
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

/** 块 + 注释表 → 正文 Markdown（不含 front matter） */
export function blocksToMarkdown(post) {
  const out = post.blocks.map(blockMd);
  const notes = Object.entries(post.notes ?? {}).map(([k, v]) => `[^${k}]: ${inlineMd(v.text)}`);
  return out.filter(Boolean).join('\n\n') + (notes.length ? `\n\n${notes.join('\n')}` : '') + '\n';
}

export function postToMarkdown(post) {
  const fm = ['---', `title: ${post.title}`, ...(post.subtitle ? [`subtitle: ${post.subtitle}`] : []), `date: ${String(post.date).slice(0, 10)}`, `category: ${post.category}`, `excerpt: ${post.excerpt}`, ...(post.cover ? [`cover: ${post.cover}`] : []), '---', ''];
  return fm.join('\n') + '\n' + blocksToMarkdown(post);
}


/* ───────────── 游记 ⇄ Markdown ─────────────
 * 游记在 Markdown 里就是普通的文字：`## 站名` 开一个站点，下面是一段段文字和一行行图片。
 * 图组、双图、自由排布里的图在文本里也只是一行行图片；地图、位置、缩放这些版式信息不出现在文本里，
 * 由 Studio 在保存时对回原来的块（见 studio 的 mdsync）。 */

const IMG = /^!\[([^\]]*)\]\(([^)\s]*)(?:\s+"([^"]*)")?\)\s*$/;

/** 游记里出现在 Markdown 中的内容，按站点顺序摊平：文字段和图片。地图、自由排布里的小段文字不在其中 */
export function travelItems({ stops = [], blocks = [] }) {
  const items = [];
  for (const s of stops) {
    for (const b of blocks.filter((x) => x.stop === s.id)) {
      const at = (o) => ({ stop: s.id, block: b.id, ...o });
      if (b.type === 'text') (b.paras ?? []).forEach((p, k) => { const { id: _id, type, ...rest } = p; items.push(at({ ...rest, kind: type ?? 'p', k })); });
      else if (b.type === 'single') items.push(at({ kind: 'img', k: 0, src: b.src, alt: b.alt, caption: b.caption }));
      else if (['pair', 'strip', 'grid'].includes(b.type)) (b.images ?? []).forEach((im, k) => items.push(at({ kind: 'img', k, src: im.src, alt: im.alt, caption: im.caption })));
      else if (b.type === 'free') (b.items ?? []).forEach((it, k) => { if (it.kind === 'image') items.push(at({ kind: 'img', k, src: it.src, alt: it.alt, caption: it.caption })); });
    }
  }
  return items;
}

/** 游记里的一项（段落 / 小标题 / 引用 / 列表 / 代码）→ Markdown。小标题固定写三个 #：两个 # 是“新的一站” */
export const travelParaMd = (it) => blockMd(it.kind === 'h' ? { type: 'h', level: 3, text: it.text } : { ...it, type: it.kind });

const imgLine = (it) => `![${it.alt ?? ''}](${it.src ?? ''}${it.caption ? ` "${it.caption}"` : ''})`;

/** 站点 + 块 + 旁注 → 正文 Markdown（不含 # 标题） */
export function travelToMarkdown({ stops = [], blocks = [], notes = {} }) {
  const items = travelItems({ stops, blocks });
  const parts = [];
  for (const s of stops) {
    parts.push(`## ${s.name ?? ''}`.trimEnd());
    for (const it of items.filter((x) => x.stop === s.id)) parts.push(it.kind === 'img' ? imgLine(it) : travelParaMd(it));
  }
  const defs = Object.entries(notes).map(([k, v]) => `[^${k}]: ${inlineMd(v.text)}`);
  return parts.join('\n\n') + (defs.length ? `\n\n${defs.join('\n')}` : '') + '\n';
}

/** Markdown → { title, stops: [{ name }], items, notes }。item 的 stop 是 stops 里的序号；第一个站点之前的内容归到第一站。
 * 文字项的 kind 和文章里的块一致：p 段落 / h 小标题（###）/ quote 引用 / list 列表 / code 代码；图片是 img */
export function parseTravel(body) {
  const lines = body.split(/\r?\n/);
  const stops = [], items = [], notes = {};
  let title, cur = 0;
  const join = (ls) => ls.map((s) => s.trim()).reduce((a, s) => (a && /[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(s) ? `${a} ${s}` : a + s), '');
  const LI = /^(\s*)([-*+]|\d+[.)])\s+/;
  const isStart = (l) => /^(#{1,4}(\s|$)|!\[|\[\^[^\]]+\]:|```|>)/.test(l) || LI.test(l);

  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fn = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
    if (fn) { notes[fn[1]] = { text: parseInline(fn[2]) }; i++; continue; }

    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const code = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) code.push(lines[i]);
      i++;
      items.push({ kind: 'code', stop: cur, ...(fence[1] ? { lang: fence[1] } : {}), code: code.join('\n') });
      continue;
    }

    const h = line.match(/^(#{1,4})(?:\s+(.*?))?\s*$/);
    if (h) {
      const text = (h[2] ?? '').trim();
      if (h[1] === '#') title ??= text;
      else if (h[1] === '##') { stops.push({ name: text }); cur = stops.length - 1; }
      else items.push({ kind: 'h', stop: cur, text: parseInline(text) });
      i++; continue;
    }

    const im = line.match(IMG);
    if (im) { items.push({ kind: 'img', stop: cur, src: im[2], alt: im[1], ...(im[3] ? { caption: im[3] } : {}) }); i++; continue; }

    if (line.startsWith('>')) {
      const q = [];
      for (; i < lines.length && lines[i].startsWith('>'); i++) q.push(lines[i].replace(/^>\s?/, ''));
      const last = q[q.length - 1]?.match(/^(?:——|—|--)\s*(.+)$/);
      if (last) q.pop();
      items.push({ kind: 'quote', stop: cur, text: parseInline(join(q.filter(Boolean))), ...(last ? { cite: last[1] } : {}) });
      continue;
    }

    const li = line.match(LI);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const list = [];
      for (; i < lines.length && LI.test(lines[i]); i++) list.push(parseInline(lines[i].replace(LI, '')));
      items.push({ kind: 'list', stop: cur, ordered, items: list });
      continue;
    }

    const para = [];
    for (; i < lines.length && lines[i].trim() && !isStart(lines[i]); i++) para.push(lines[i]);
    if (!para.length) para.push(lines[i++]);
    items.push({ kind: 'p', stop: cur, text: parseInline(join(para)) });
  }
  return { title, stops, items, notes };
}
