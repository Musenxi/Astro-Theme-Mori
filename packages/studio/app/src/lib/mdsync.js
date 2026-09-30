/**
 * Markdown 写作页和 JSON 文档之间的同步层。
 * JSON 是存储，Markdown 只是它的一种“视图”：每次编辑把文本解析成块，再对齐回旧块，
 * 让没动过的块原样保留（包括 tcy 之类 Markdown 表达不了的标注），改动不大的块沿用 id（划词批注靠 id 定位）。
 */
import { parseBlocks, blocksToMarkdown, parseTravel, travelToMarkdown, travelBlockToMarkdown } from 'astro-mori/markdown';

const ASSET = '../../assets/';
/** 图片路径在文本里只写文件名，存进 JSON 时补上相对路径 */
const stripAsset = (src) => (typeof src === 'string' && src.startsWith(ASSET) ? src.slice(ASSET.length) : src);
const addAsset = (src) => (typeof src === 'string' && src && !/[/:]/.test(src) ? ASSET + src : src);
const mapImages = (blocks, fn) => blocks.map((b) => (b.type === 'image' && b.src ? { ...b, src: fn(b.src) } : b));

const isTravel = (doc) => doc.kind === 'travel' || (doc.kind === undefined && Array.isArray(doc.stops));
/** 游记的图藏在图组、自由排布的条目里：统一改写路径 */
const mapTravelImages = (blocks, fn) => blocks.map((b) => {
  if (b.type === 'single' && b.src) return { ...b, src: fn(b.src) };
  if (Array.isArray(b.images)) return { ...b, images: b.images.map((im) => (im.src ? { ...im, src: fn(im.src) } : im)) };
  if (b.type === 'free') return { ...b, items: b.items.map((it) => (it.kind === 'image' && it.src ? { ...it, src: fn(it.src) } : it)) };
  return b;
});

export const toMarkdown = (doc) => `# ${doc.title ?? ''}\n\n${isTravel(doc)
  ? travelToMarkdown({ stops: doc.stops, blocks: mapTravelImages(doc.blocks, stripAsset), notes: doc.notes })
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

/* ───────────── 游记 ───────────── */
const TRAVEL_PREFIX = { text: 't', single: 's', pair: 'p', strip: 'st', grid: 'g', free: 'f', map: 'm' };
const TRAVEL_CARRY = ['y', 'scale', 'head']; // 横滚的位置、缩放这些参数，文本里不写，跟着块走

/** 新解析出的站点对回旧站点：先按站名，再按位置；对上的沿用 id 和文本里没写的经纬度 */
function alignStops(oldStops, parsed) {
  const taken = new Set(), out = new Array(parsed.length).fill(null);
  parsed.forEach((p, i) => { const k = oldStops.findIndex((o, q) => !taken.has(q) && o.name === p.name); if (k >= 0) { taken.add(k); out[i] = oldStops[k]; } });
  parsed.forEach((p, i) => { if (!out[i] && oldStops[i] && !taken.has(i)) { taken.add(i); out[i] = oldStops[i]; } });
  const used = new Set(out.filter(Boolean).map((o) => o.id));
  let n = 0;
  return parsed.map((p, i) => {
    const o = out[i];
    let id = o?.id;
    if (!id) { do id = 's' + ++n; while (used.has(id)); used.add(id); }
    const lnglat = p.lnglat ?? o?.lnglat ?? [0, 0];
    return { id, name: p.name, ...(p.en ? { en: p.en } : {}), lnglat, ...(p.date ? { date: p.date } : {}) };
  });
}

/** 文字块的段落 id：先按原文对上，再按位置且相近的沿用，其余取 “块id + p + 序号” */
function alignParas(oldParas = [], paras, blockId) {
  const used = new Set(), keyOf = (p) => blocksToMarkdown({ blocks: [{ type: 'p', text: p.text }], notes: {} }).trim();
  const ok = oldParas.map(keyOf);
  const pick = paras.map((p) => { const k = ok.findIndex((x, q) => !used.has(q) && x === keyOf(p)); if (k >= 0) used.add(k); return k; });
  paras.forEach((p, i) => { if (pick[i] < 0 && oldParas[i] && !used.has(i) && similarity(ok[i], keyOf(p)) >= 0.4) { pick[i] = i; used.add(i); } });
  const ids = new Set(pick.filter((k) => k >= 0).map((k) => oldParas[k].id));
  let n = 0;
  return paras.map((p, i) => {
    let id = pick[i] >= 0 ? oldParas[pick[i]].id : null;
    if (!id) { do id = `${blockId}p${++n}`; while (ids.has(id)); ids.add(id); }
    return { id, text: p.text };
  });
}

export function fromTravelMarkdown(text, doc) {
  const parsed = parseTravel(text);
  const stops = alignStops(doc.stops ?? [], parsed.stops);
  const fallback = stops.length ? stops : [{ id: doc.stops?.[0]?.id ?? 's1', name: doc.stops?.[0]?.name ?? '', lnglat: doc.stops?.[0]?.lnglat ?? [0, 0] }];
  const fresh = mapTravelImages(restoreNoteKinds(parsed.blocks, doc.blocks), addAsset).map((b) => ({ ...b, stop: fallback[b.stop]?.id ?? fallback[0].id }));
  const key = (b) => `${b.stop}\n${travelBlockToMarkdown(b)}`;
  // Markdown 里块是按站点归在一起的：旧块也先按同样的顺序排好再对齐，否则挪了位置的块会被当成新块
  const grouped = [...(doc.stops ?? []).flatMap((s) => doc.blocks.filter((b) => b.stop === s.id)), ...doc.blocks.filter((b) => !(doc.stops ?? []).some((s) => s.id === b.stop))];
  const blocks = alignBlocks(grouped, fresh, { key, carry: TRAVEL_CARRY, prefix: (b) => TRAVEL_PREFIX[b.type] ?? 'b' }).map((b) => {
    if (b.type !== 'text') return b;
    const old = doc.blocks.find((o) => o.id === b.id && o.type === 'text');
    return { ...b, paras: alignParas(old?.paras, b.paras, b.id) };
  });
  const notes = alignNotes(doc.notes, restoreNoteKinds(parsed.notes, doc.blocks));
  return { ...doc, title: parsed.title ?? doc.title, stops: fallback, blocks, notes: Object.keys(notes).length ? notes : undefined };
}
