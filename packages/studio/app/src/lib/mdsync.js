/**
 * Markdown 写作页和 JSON 文档之间的同步层。
 * JSON 是存储，Markdown 只是它的一种“视图”：每次编辑把文本解析成块，再对齐回旧块，
 * 让没动过的块原样保留（包括 tcy 之类 Markdown 表达不了的标注），改动不大的块沿用 id（划词引用评论靠 id 定位）。
 */
import { parseBlocks, blocksToMarkdown, parseTravel, travelToMarkdown, travelItems, travelParaMd } from 'astro-mori/markdown';

const ASSET = '../../assets/';
/** 图片路径在文本里只写文件名，存进 JSON 时补上相对路径 */
const stripAsset = (src) => (typeof src === 'string' && src.startsWith(ASSET) ? src.slice(ASSET.length) : src);
const addAsset = (src) => (typeof src === 'string' && src && !/[/:]/.test(src) ? ASSET + src : src);
const mapImages = (blocks, fn) => blocks.map((b) => (b.type === 'image' && b.src ? { ...b, src: fn(b.src) } : b));

/** 游记的图藏在图组、自由排布的条目里：文本里只写文件名 */
const stripTravelAsset = (b) => {
  if (b.type === 'single' && b.src) return { ...b, src: stripAsset(b.src) };
  if (Array.isArray(b.images)) return { ...b, images: b.images.map((im) => (im.src ? { ...im, src: stripAsset(im.src) } : im)) };
  if (b.type === 'free') return { ...b, items: b.items.map((it) => (it.kind === 'image' && it.src ? { ...it, src: stripAsset(it.src) } : it)) };
  return b;
};
const isTravel = (doc) => doc.kind === 'travel' || (doc.kind === undefined && Array.isArray(doc.stops));
export const toMarkdown = (doc) => `# ${doc.title ?? ''}\n\n${isTravel(doc)
  ? travelToMarkdown({ stops: doc.stops, blocks: doc.blocks.map(stripTravelAsset), notes: doc.notes })
  : blocksToMarkdown({ blocks: mapImages(doc.blocks, stripAsset), notes: doc.notes })}`;

const one = (b) => blocksToMarkdown({ blocks: [b], notes: {} }).trim();

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

const CARRY = ['writing', 'layout']; // Markdown 里写不出来、但属于块本身的设置

/** 把新解析出的块对齐到旧块：完全相同的原样保留；改得不多的沿用 id 和块设置；其余是新块，取新 id */
export function alignBlocks(oldBlocks, newBlocks, { key = one, carry = CARRY, prefix = () => 'b' } = {}) {
  const ok = oldBlocks.map(key), nk = newBlocks.map(key);
  const n = ok.length, m = nk.length;
  // 最长公共子序列：找出没动过的块
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = ok[i] === nk[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = new Array(m).fill(null), pairs = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (ok[i] === nk[j]) { out[j] = oldBlocks[i]; pairs.push([i, j]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  // 相邻“没动过”的块之间：按顺序找改动不大的配对
  const bounds = [[-1, -1], ...pairs, [n, m]];
  for (let k = 0; k < bounds.length - 1; k++) {
    let p = bounds[k][0] + 1;
    for (let j = bounds[k][1] + 1; j < bounds[k + 1][1]; j++) {
      let best = -1, bestSim = 0.4;
      for (let q = p; q < bounds[k + 1][0]; q++) {
        if (oldBlocks[q].type !== newBlocks[j].type) continue;
        const s = similarity(ok[q], nk[j]);
        if (s >= bestSim) { best = q; bestSim = s; }
      }
      if (best >= 0) {
        const carried = Object.fromEntries(carry.filter((c) => c in oldBlocks[best] && !(c in newBlocks[j])).map((c) => [c, oldBlocks[best][c]]));
        out[j] = { ...newBlocks[j], ...carried, id: oldBlocks[best].id };
        p = best + 1;
      }
    }
  }
  // 新块：同一前缀里，取没被用过的最大序号 + 1
  const used = new Set([...out.filter(Boolean).map((b) => b.id)]);
  const max = {};
  for (const b of oldBlocks) { const x = /^([a-z]+)(\d+)$/.exec(b.id); if (x) max[x[1]] = Math.max(max[x[1]] ?? 0, +x[2]); }
  return out.map((b, j) => {
    if (b) return b;
    const p = prefix(newBlocks[j]);
    let id; do id = p + String((max[p] = (max[p] ?? 0) + 1)).padStart(2, '0'); while (used.has(id));
    used.add(id);
    return { ...newBlocks[j], id };
  });
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

/** 文本 → 新文档（标题、块、注释）。其余元信息不动。文本里没有一级标题就保留原标题 */
export function fromMarkdown(text, doc) {
  if (isTravel(doc)) return fromTravelMarkdown(text, doc);
  const parsed = parseBlocks(text);
  const blocks = alignBlocks(doc.blocks, mapImages(restoreNoteKinds(parsed.blocks, doc.blocks), addAsset));
  const notes = alignNotes(doc.notes, restoreNoteKinds(parsed.notes, doc.blocks));
  return { ...doc, title: parsed.title ?? doc.title, blocks: blocks.length ? blocks : [{ id: 'b01', type: 'p', text: '' }], notes: Object.keys(notes).length ? notes : undefined };
}

/* ───────────── 游记 ─────────────
 * 文本里只有站名、文字段和图片。保存时把每段文字、每张图对回原来的块：
 * 没动的原样保留，改过的沿用块和段落 id，版式（图组、自由排布、竖排）、位置、缩放、地图都跟着块走。 */

/** 一项的 Markdown 写法（文字项：段落 / 小标题 / 引用 / 列表 / 代码） */
const itemMd = (it) => travelParaMd(it).trim();
const itemKey = (it) => (it.kind === 'img' ? `i:${stripAsset(it.src ?? '')}` : `${it.kind}:${itemMd(it)}`);
/** 新写出来的一项 → 文字块里的段落（不含 id）。普通段落不写 type */
const paraFrom = (n) => {
  switch (n.kind) {
    case 'h': return { type: 'h', text: n.text };
    case 'quote': return { type: 'quote', text: n.text, ...(n.cite ? { cite: n.cite } : {}) };
    case 'list': return { type: 'list', ordered: !!n.ordered, items: n.items };
    case 'code': return { type: 'code', ...(n.lang ? { lang: n.lang } : {}), code: n.code };
    default: return { text: n.text };
  }
};

/** 新旧内容项一一对应：先找没动过的（最长公共子序列），再在空档里按顺序找改动不大的文字 */
function matchItems(oldItems, newItems) {
  const ok = oldItems.map(itemKey), nk = newItems.map(itemKey), n = ok.length, m = nk.length;
  // 改得不多的文字按 Markdown 写法比像不像，不看类型：把段落改成引用、加个小标题符号，还是原来那一段
  const bare = (it) => (it.kind === 'img' ? '' : itemMd(it).replace(/^(#{1,4} |> ?|[-*+] |\d+[.)] )/gm, ''));
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

/** 新解析出的站点对回旧站点：先按站名，再按位置；对上的沿用 id 和文本里没写的英文名、日期、经纬度 */
function alignStops(oldStops, parsed) {
  const taken = new Set(), out = new Array(parsed.length).fill(null);
  parsed.forEach((p, i) => { const k = oldStops.findIndex((o, q) => !taken.has(q) && o.name === p.name); if (k >= 0) { taken.add(k); out[i] = oldStops[k]; } });
  parsed.forEach((p, i) => { if (!out[i] && oldStops[i] && !taken.has(i)) { taken.add(i); out[i] = { ...oldStops[i], name: p.name }; } });
  const used = new Set(out.filter(Boolean).map((o) => o.id));
  let n = 0;
  return parsed.map((p, i) => {
    if (out[i]) return { ...out[i], name: p.name };
    let id; do id = 's' + ++n; while (used.has(id));
    used.add(id);
    return { id, name: p.name, lnglat: [0, 0] };
  });
}

const patchImage = (im, n) => {
  const o = { ...im };
  if ((n.alt ?? '') !== (im.alt ?? '')) o.alt = n.alt ?? '';
  if ((n.caption ?? '') !== (im.caption ?? '')) { if (n.caption) o.caption = n.caption; else delete o.caption; }
  return o;
};

export function fromTravelMarkdown(text, doc) {
  const parsed = parseTravel(text);
  const stops = alignStops(doc.stops ?? [], parsed.stops);
  const first = doc.stops?.[0];
  const list = stops.length ? stops : [first ?? { id: 's1', name: '', lnglat: [0, 0] }];
  const stopIds = new Set(list.map((s) => s.id));
  const oldItems = travelItems(doc);
  const newItems = parsed.items.map((it) => ({
    ...it, stopId: list[it.stop]?.id ?? list[0].id,
    ...(it.kind === 'img' ? { src: addAsset(it.src) } : restoreNoteKinds(it, doc.blocks)),
  }));
  const match = matchItems(oldItems, newItems);
  const oldBlock = new Map(doc.blocks.map((b) => [b.id, b]));

  // 一：按新文本的顺序，把每一项归进块。对上旧项的进旧块；新写的文字接在前一项所在的文字块后面，否则自成一块
  const entries = [], byOld = new Map(), entryOf = new Array(newItems.length);
  newItems.forEach((n, i) => {
    const o = match[i];
    let e;
    if (o >= 0) {
      const bid = oldItems[o].block;
      e = byOld.get(bid);
      if (!e) { e = { old: oldBlock.get(bid), type: oldBlock.get(bid).type, stop: n.stopId, slots: [] }; byOld.set(bid, e); entries.push(e); }
      e.slots.push({ o: oldItems[o], n });
    } else {
      const prev = i > 0 && newItems[i - 1].stopId === n.stopId ? entryOf[i - 1] : null;
      if (n.kind !== 'img' && prev?.type === 'text') { e = prev; e.slots.push({ n }); }
      else { e = { old: null, type: n.kind !== 'img' ? 'text' : 'single', stop: n.stopId, slots: [{ n }] }; entries.push(e); }
    }
    entryOf[i] = e;
  });

  // 二：文本里没有内容的旧块（地图，只剩小段文字的自由排布……）跟在它原来前一个块的后面
  const canonical = (doc.stops ?? []).flatMap((s) => doc.blocks.filter((b) => b.stop === s.id));
  const hasItems = new Set(oldItems.map((it) => it.block));
  const placed = new Map(byOld);
  const stopOrder = new Map(list.map((s, i) => [s.id, i]));
  canonical.forEach((b, ci) => {
    if (byOld.has(b.id) || !stopIds.has(b.stop)) return;
    // 文本里的内容被删光了：整块删掉；只有自由排布里的小段文字不在文本里，留着
    if (hasItems.has(b.id) && !(b.type === 'free' && b.items.some((it) => it.kind === 'text'))) return;
    const e = { old: b, type: b.type, stop: b.stop, slots: [] };
    let at = -1;
    for (let k = ci - 1; k >= 0 && at < 0; k--) { const p = placed.get(canonical[k].id); if (p) at = entries.indexOf(p) + 1; }
    if (at < 0) { at = entries.findIndex((x) => x.stop === b.stop); }
    if (at < 0) { let last = -1; entries.forEach((x, k) => { if (stopOrder.get(x.stop) < stopOrder.get(b.stop)) last = k; }); at = last + 1; }
    entries.splice(at, 0, e);
    placed.set(b.id, e);
  });

  // 三：按归好的项重建块
  const used = new Set(doc.blocks.flatMap((b) => [b.id, ...(b.paras ?? []).map((p) => p.id)]));
  const max = {};
  for (const b of doc.blocks) { const x = /^([a-z]+)(\d+)$/.exec(b.id); if (x) max[x[1]] = Math.max(max[x[1]] ?? 0, +x[2]); }
  const newId = (p) => { let id; do id = p + String((max[p] = (max[p] ?? 0) + 1)).padStart(2, '0'); while (used.has(id)); used.add(id); return id; };
  const newParaId = (bid) => { let k = 0, id; do id = `${bid}p${++k}`; while (used.has(id)); used.add(id); return id; };

  const blocks = entries.map((e) => {
    const { old, stop, slots } = e;
    if (!old) {
      if (e.type === 'single') { const n = slots[0].n; return { id: newId('s'), type: 'single', stop, src: n.src, alt: n.alt ?? '', ...(n.caption ? { caption: n.caption } : {}), layout: 'full' }; }
      const id = newId('t');
      return { id, type: 'text', stop, paras: slots.map((s) => ({ id: newParaId(id), ...paraFrom(s.n) })) };
    }
    if (!slots.length) return old.type === 'free' && hasItems.has(old.id) ? { ...old, stop, items: old.items.filter((it) => it.kind === 'text') } : { ...old, stop };
    switch (old.type) {
      case 'text': return { ...old, stop, paras: slots.map((s) => {
        if (!s.o) return { id: newParaId(old.id), ...paraFrom(s.n) };
        const op = old.paras[s.o.k];
        // 没动的段落原样保留（tcy 这类 Markdown 写不出的标注）；改过的沿用 id，内容和类型以新写的为准
        return itemKey(s.o) === itemKey(s.n) ? op : { id: op.id, ...paraFrom(s.n) };
      }) };
      case 'single': return { ...old, ...patchImage(old, slots[0].n), stop };
      case 'free': {
        const alive = new Map(slots.map((s) => [s.o.k, s.n]));
        const items = old.items.flatMap((it, k) => (it.kind !== 'image' ? [it] : alive.has(k) ? [patchImage(it, alive.get(k))] : []));
        return items.length ? { ...old, stop, items } : null;
      }
      default: { // pair / strip / grid
        const images = slots.map((s) => patchImage(old.images[s.o.k], s.n));
        if ((old.type === 'pair' && images.length === 2) || (old.type !== 'pair' && images.length >= 2)) return { ...old, stop, images };
        // 删得只剩一张：退成单图
        const { images: _drop, ...rest } = old;
        return { ...rest, type: 'single', stop, layout: 'full', src: images[0].src, alt: images[0].alt ?? '', ...(images[0].caption ? { caption: images[0].caption } : {}) };
      }
    }
  }).filter(Boolean);
  const orphans = doc.blocks.filter((b) => !(doc.stops ?? []).some((s) => s.id === b.stop)); // 不属于任何站点的旧块：原样留着，别悄悄丢

  const notes = alignNotes(doc.notes, restoreNoteKinds(parsed.notes, doc.blocks));
  return { ...doc, title: parsed.title ?? doc.title, stops: list, blocks: [...blocks, ...orphans], notes: Object.keys(notes).length ? notes : undefined };
}
