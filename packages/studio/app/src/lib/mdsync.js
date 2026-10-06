/**
 * Markdown 写作页和 JSON 文档之间的同步层。
 * JSON 是存储，Markdown 只是它的一种“视图”：文本里只有文字、标题和图片（图组、双图、自由排布里的图也只是一行行图片），
 * 每次编辑把文本解析成块，再对回旧块：没动过的块原样保留（包括 tcy 之类 Markdown 写不出的标注、版式、位置、竖排），
 * 改动不大的块沿用 id（划词引用评论靠 id 定位）。
 */
import { parseBlocks, blocksToMarkdown, mdItems } from 'astro-mori/markdown';
import { normalizeDoc, WRITING_BLOCKS } from 'astro-mori/flow';

const ASSET = '../../assets/';
/** 图片路径在文本里只写文件名，存进 JSON 时补上相对路径 */
const stripAsset = (src) => (typeof src === 'string' && src.startsWith(ASSET) ? src.slice(ASSET.length) : src);
const addAsset = (src) => (typeof src === 'string' && src && !/[/:]/.test(src) ? ASSET + src : src);

const mapImg = (o, fn) => (o.src ? { ...o, src: fn(o.src) } : o);
/** 块里所有图片的路径（单图、图组、自由排布里的图）换一种写法 */
function mapBlockImages(b, fn) {
  if (b.type === 'image') return mapImg(b, fn);
  if (Array.isArray(b.images)) return { ...b, images: b.images.map((im) => mapImg(im, fn)) };
  if (b.type === 'free') return { ...b, items: b.items.map((it) => (it.kind === 'image' ? mapImg(it, fn) : it)) };
  return b;
}

export const toMarkdown = (doc) => {
  const d = normalizeDoc(doc);
  return `# ${d.title ?? ''}\n\n${blocksToMarkdown({ blocks: (d.blocks ?? []).map((b) => mapBlockImages(b, stripAsset)), notes: d.notes })}`;
};

/** 字符二元组的 Dice 系数：两段文字有多像（0–1），中文按字二元组也管用 */
export function similarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; };
  const A = grams(a), B = grams(b);
  let hit = 0;
  for (const [g, n] of A) hit += Math.min(n, B.get(g) ?? 0);
  return (2 * hit) / (a.length - 1 + b.length - 1);
}

/** 旁注和脚注在 Markdown 里都写成 [^id]；按旧文档里这个 id 是旁注还是脚注，还原类型 */
function restoreNoteKinds(blocks, oldBlocks) {
  const kinds = new Map();
  const scan = (v) => { if (Array.isArray(v)) v.forEach(scan); else if (v && typeof v === 'object') { if (v.type === 'note' && v.ref) kinds.set(v.ref, 'note'); Object.values(v).forEach(scan); } };
  scan(oldBlocks);
  const fix = (v) => {
    if (Array.isArray(v)) return v.map(fix);
    if (v && typeof v === 'object') {
      const o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)]));
      return o.type === 'fn' && kinds.get(o.ref) === 'note' ? { ...o, type: 'note' } : o;
    }
    return v;
  };
  return fix(blocks);
}

/** 旁注：正文没变的就原样保留（手写 JSON 里的裸字符串不会被悄悄改成数组），改过的才用新解析出的 */
const noteKey = (n) => blocksToMarkdown({ blocks: [], notes: { x: n } });
function alignNotes(oldNotes = {}, parsed) {
  return Object.fromEntries(Object.entries(parsed).map(([id, n]) => [id, oldNotes[id] && noteKey(oldNotes[id]) === noteKey(n) ? oldNotes[id] : n]));
}

/* ───────────── 对回旧块 ───────────── */

const itemKey = (it) => (it.kind === 'img' ? `i:${stripAsset(it.src ?? '')}` : `${it.kind}:${it.md}`);
/** 比像不像时只看文字：不看类型（把段落改成引用、加个小标题符号），也不看链接地址、粗斜体和脚注标记（给一个词加上地点，还是原来那一段） */
const bare = (it) => (it.kind === 'img' ? '' : it.md.replace(/^(#{1,4} |> ?|[-*+] |\d+[.)] )/gm, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[\^[^\]]+\]|\*\*|[*`]/g, ''));

/** 新旧内容项一一对应：先找没动过的（最长公共子序列），再在空档里按顺序找改动不大的文字 */
function matchItems(oldItems, newItems) {
  const ok = oldItems.map(itemKey), nk = newItems.map(itemKey), n = ok.length, m = nk.length;
  const ot = oldItems.map(bare), nt = newItems.map(bare);
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = ok[i] === nk[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const match = new Array(m).fill(-1), pairs = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (ok[i] === nk[j]) { match[j] = i; pairs.push([i, j]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  const bounds = [[-1, -1], ...pairs, [n, m]];
  for (let k = 0; k < bounds.length - 1; k++) {
    let p = bounds[k][0] + 1;
    for (let j = bounds[k][1] + 1; j < bounds[k + 1][1]; j++) {
      if (newItems[j].kind === 'img') continue;
      let best = -1, bestSim = 0.4;
      for (let q = p; q < bounds[k + 1][0]; q++) {
        if (oldItems[q].kind === 'img') continue;
        const sim = similarity(ot[q], nt[j]);
        if (sim >= bestSim) { best = q; bestSim = sim; }
      }
      if (best >= 0) { match[j] = best; p = best + 1; }
    }
  }
  return match;
}

const patchImage = (im, n) => {
  const o = { ...im };
  if ((n.alt ?? '') !== (im.alt ?? '')) o.alt = n.alt ?? '';
  if ((n.caption ?? '') !== (im.caption ?? '')) { if (n.caption) o.caption = n.caption; else delete o.caption; }
  return o;
};

/** 版式和位置：Markdown 里写不出来，但属于块本身，改了文字也要带过去 */
function carry(old, nb) {
  const out = {};
  for (const axis of ['h', 'v']) {
    const o = { ...(old[axis] ?? {}) };
    if (!WRITING_BLOCKS.has(nb.type)) delete o.writing;
    if (Object.keys(o).length) out[axis] = o;
  }
  if (old.type === 'image' && nb.type === 'image' && old.layout) out.layout = old.layout;
  return out;
}

/** 文本 → 新文档（标题、块、注释）。其余元信息不动。文本里没有一级标题就保留原标题 */
export function fromMarkdown(text, doc) {
  const base = normalizeDoc(doc);
  const oldBlocks = base.blocks ?? [];
  const parsed = parseBlocks(text);
  const newBlocks = restoreNoteKinds(parsed.blocks, oldBlocks).map((b) => mapBlockImages(b, addAsset));
  const oldItems = mdItems(oldBlocks.map((b) => mapBlockImages(b, stripAsset)));
  const newItems = mdItems(newBlocks.map((b, i) => ({ ...b, id: String(i) })));
  const match = matchItems(oldItems, newItems);
  const oldBlock = new Map(oldBlocks.map((b) => [b.id, b]));

  // 一：按新文本的顺序，把每一项归进块。对上旧项的进旧块（图组、自由排布里的几张图归进同一个块）；其余是新块
  const entries = [], byOld = new Map();
  newItems.forEach((n, j) => {
    const o = match[j] >= 0 ? oldItems[match[j]] : null;
    const old = o ? oldBlock.get(o.block) : null;
    if (!old) { entries.push({ old: null, nb: newBlocks[+n.block], slots: [] }); return; }
    const multi = ['pair', 'strip', 'grid', 'free'].includes(old.type);
    let e = multi ? byOld.get(old.id) : null;
    if (!e) { e = { old, nb: newBlocks[+n.block], slots: [] }; entries.push(e); if (multi) byOld.set(old.id, e); }
    e.slots.push({ o, n });
  });

  // 二：文本里没有内容的旧块（地图，只剩小段文字的自由排布……）跟在它原来前一个块的后面
  const hasItems = new Set(oldItems.map((it) => it.block));
  const placed = new Map(entries.filter((e) => e.old).map((e) => [e.old.id, e]));
  oldBlocks.forEach((b, i) => {
    if (placed.has(b.id)) return;
    // 文本里的内容被删光了：整块删掉；只有自由排布里的小段文字不在文本里，留着
    if (hasItems.has(b.id) && !(b.type === 'free' && b.items.some((it) => it.kind === 'text'))) return;
    if (!hasItems.has(b.id) && !['map', 'free'].includes(b.type)) return; // 空的文字块之类：没有内容，不留
    const e = { old: b, nb: null, slots: [] };
    let at = 0;
    for (let k = i - 1; k >= 0; k--) { const p = placed.get(oldBlocks[k].id); if (p) { at = entries.indexOf(p) + 1; break; } }
    entries.splice(at, 0, e);
    placed.set(b.id, e);
  });

  // 三：按归好的项重建块；新块取新 id（同一个前缀里没被用过的最大序号 + 1）
  const used = new Set(oldBlocks.map((b) => b.id));
  const max = {};
  for (const id of used) { const x = /^([a-z]+)(\d+)$/.exec(id); if (x) max[x[1]] = Math.max(max[x[1]] ?? 0, +x[2]); }
  const newId = () => { let id; do id = 'b' + String((max.b = (max.b ?? 0) + 1)).padStart(2, '0'); while (used.has(id)); used.add(id); return id; };

  const blocks = entries.map((e) => {
    const { old, nb, slots } = e;
    if (!old) return { ...nb, id: newId() };
    if (!slots.length) return old.type === 'free' && hasItems.has(old.id) ? { ...old, items: old.items.filter((it) => it.kind === 'text') } : old;
    switch (old.type) {
      case 'image': return { ...old, ...patchImage(old, slots[0].n) };
      case 'free': {
        const alive = new Map(slots.map((s) => [s.o.k, s.n]));
        const items = old.items.flatMap((it, k) => (it.kind !== 'image' ? [it] : alive.has(k) ? [patchImage(it, alive.get(k))] : []));
        return items.length ? { ...old, items } : null;
      }
      case 'pair': case 'strip': case 'grid': {
        const images = slots.map((s) => patchImage(old.images[s.o.k], s.n));
        if ((old.type === 'pair' && images.length === 2) || (old.type !== 'pair' && images.length >= 2)) return { ...old, images };
        // 删得只剩一张：退成单图
        const { images: _drop, type: _t, ...rest } = old;
        return { ...rest, type: 'image', src: images[0].src, alt: images[0].alt ?? '', ...(images[0].caption ? { caption: images[0].caption } : {}) };
      }
      default: // 文字块：没动的原样保留；改过的沿用 id，内容和类型以新写的为准
        return slots[0].o && itemKey(slots[0].o) === itemKey(slots[0].n) ? old : { ...nb, ...carry(old, nb), id: old.id };
    }
  }).filter(Boolean);

  const notes = alignNotes(base.notes, restoreNoteKinds(parsed.notes, oldBlocks));
  return { ...base, title: parsed.title ?? base.title, blocks: blocks.length ? blocks : [{ id: 'b01', type: 'p', text: '' }], notes: Object.keys(notes).length ? notes : undefined };
}
