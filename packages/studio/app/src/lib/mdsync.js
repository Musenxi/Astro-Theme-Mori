/**
 * Markdown 写作页和 JSON 文档之间的同步层。
 * JSON 是存储，Markdown 只是它的一种“视图”：每次编辑把文本解析成块，再对齐回旧块，
 * 让没动过的块原样保留（包括 tcy 之类 Markdown 表达不了的标注），改动不大的块沿用 id（划词批注靠 id 定位）。
 */
import { parseBlocks, blocksToMarkdown } from 'astro-mori/markdown';

const ASSET = '../../assets/';
/** 图片路径在文本里只写文件名，存进 JSON 时补上相对路径 */
const stripAsset = (src) => (typeof src === 'string' && src.startsWith(ASSET) ? src.slice(ASSET.length) : src);
const addAsset = (src) => (typeof src === 'string' && src && !/[/:]/.test(src) ? ASSET + src : src);
const mapImages = (blocks, fn) => blocks.map((b) => (b.type === 'image' && b.src ? { ...b, src: fn(b.src) } : b));

export const toMarkdown = (doc) => `# ${doc.title ?? ''}\n\n${blocksToMarkdown({ blocks: mapImages(doc.blocks, stripAsset), notes: doc.notes })}`;

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
export function alignBlocks(oldBlocks, newBlocks) {
  const ok = oldBlocks.map(one), nk = newBlocks.map(one);
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
        const carried = Object.fromEntries(CARRY.filter((c) => c in oldBlocks[best] && !(c in newBlocks[j])).map((c) => [c, oldBlocks[best][c]]));
        out[j] = { ...newBlocks[j], ...carried, id: oldBlocks[best].id };
        p = best + 1;
      }
    }
  }
  // 新块：取没被用过的最大序号 + 1
  const used = new Set([...out.filter(Boolean).map((b) => b.id)]);
  let max = 0;
  for (const b of oldBlocks) { const x = /^b(\d+)$/.exec(b.id); if (x) max = Math.max(max, +x[1]); }
  return out.map((b, j) => {
    if (b) return b;
    let id; do id = 'b' + String(++max).padStart(2, '0'); while (used.has(id));
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
  const parsed = parseBlocks(text);
  const blocks = alignBlocks(doc.blocks, mapImages(restoreNoteKinds(parsed.blocks, doc.blocks), addAsset));
  const notes = alignNotes(doc.notes, restoreNoteKinds(parsed.notes, doc.blocks));
  return { ...doc, title: parsed.title ?? doc.title, blocks: blocks.length ? blocks : [{ id: 'b01', type: 'p', text: '' }], notes: Object.keys(notes).length ? notes : undefined };
}
