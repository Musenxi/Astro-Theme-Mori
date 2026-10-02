/**
 * “排版”视图里的操作：都是纯函数，输入文档，返回新文档。
 * 视图按横向读法把整篇排成一条：相邻的文字是一列，图片、图组、地图各是一块（见 flow.mjs 的 columns）。
 * 一项的 key 是它第一个块的 id。
 */
import { columns, TEXT_BLOCKS, WRITING_BLOCKS } from 'astro-mori/flow';

const place = (o) => ({ ...(o.y !== undefined ? { y: o.y } : {}), ...(o.scale !== undefined ? { scale: o.scale } : {}) });

/**
 * 排版视图里的项，按顺序。每项：{ key, type, y?, scale?, ... }
 *   文字：type 'text'，writing 'h' | 'v'，blocks（列里的块）
 *   其余：就是那个块本身（加 key）
 */
export function itemsOf(doc) {
  return columns(doc.blocks ?? []).map((c) => (c.kind === 'text'
    ? { key: c.blocks[0].id, type: 'text', writing: c.writing, ...place(c), blocks: c.blocks }
    : { ...c.block, key: c.block.id }));
}

const blocksOfItem = (it) => (it.type === 'text' ? it.blocks : [it]);
const flatten = (its) => its.flatMap((it) => (it.type === 'text' ? it.blocks : [stripKey(it)]));
const stripKey = ({ key: _k, ...b }) => b;

/** 把项挪到第 slot 个空位（按“去掉它之后”的序列计，0 是最前面） */
export function moveItem(doc, key, slot) {
  const its = itemsOf(doc);
  const moving = its.find((x) => x.key === key);
  if (!moving) return doc;
  const rest = its.filter((x) => x !== moving);
  rest.splice(Math.max(0, Math.min(slot, rest.length)), 0, moving);
  return { ...doc, blocks: flatten(rest) };
}

/** 左右挪一格 */
export function nudgeItem(doc, key, dir) {
  const i = itemsOf(doc).findIndex((x) => x.key === key);
  if (i < 0) return doc;
  const slot = i + dir;
  if (slot < 0 || slot > itemsOf(doc).length - 1) return doc;
  return moveItem(doc, key, slot);
}

/**
 * 改一项的位置、缩放、竖排。undefined 表示去掉这个设置。
 * 一列文字里，位置和缩放写在每个块上（删掉第一个块也不丢）；竖排只写在能竖排的块上。
 */
export function setPlace(doc, key, patch) {
  const it = itemsOf(doc).find((x) => x.key === key);
  if (!it) return doc;
  const ids = new Set(blocksOfItem(it).map((b) => b.id));
  return { ...doc, blocks: doc.blocks.map((b) => {
    if (!ids.has(b.id)) return b;
    const o = { ...b };
    for (const k of ['y', 'scale']) if (k in patch) { if (patch[k] === undefined) delete o[k]; else o[k] = patch[k]; }
    if ('writing' in patch && it.type === 'text' && WRITING_BLOCKS.has(b.type)) { if (patch.writing === 'v') o.writing = 'v'; else delete o.writing; }
    return o;
  }) };
}

/** 改一个块自己的字段（图片的版式、图注、地图范围……） */
export function patchBlock(doc, id, patch) {
  return { ...doc, blocks: doc.blocks.map((b) => {
    if (b.id !== id) return b;
    const o = { ...b, ...patch };
    for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
    return o;
  }) };
}

export const imagesOf = (b) => {
  if (b.type === 'image') return [{ src: b.src, alt: b.alt ?? '', ...(b.caption ? { caption: b.caption } : {}) }];
  if (b.type === 'free') return (b.items ?? []).filter((it) => it.kind === 'image').map(({ src, alt, caption }) => ({ src, alt: alt ?? '', ...(caption ? { caption } : {}) }));
  return (b.images ?? []).map(({ src, alt, caption }) => ({ src, alt: alt ?? '', ...(caption ? { caption } : {}) }));
};
export const isImageBlock = (b) => ['image', 'pair', 'strip', 'grid', 'free'].includes(b?.type);

/** 自由排布的初始摆法：从左上往右下错开，后放的叠在上面 */
function cascade(images) {
  const n = images.length, w = n <= 2 ? 0.52 : n <= 4 ? 0.4 : 0.3;
  return images.map((im, i) => ({ kind: 'image', ...im, x: +((i * (1 - w)) / Math.max(1, n - 1)).toFixed(3), y: +(((i % 3) * 0.28) + 0.04).toFixed(3), w, z: i + 1 }));
}

/** 把一组图摆成另一种版式，保留块的 id、位置和缩放 */
export function withImages(b, type, images) {
  const { src: _s, alt: _a, caption: _c, layout: _l, images: _i, items: _it, ar: _ar, ...base } = b;
  switch (type) {
    case 'image': return { ...base, type, ...images[0], layout: b.layout === 'inline' ? 'inline' : 'wide' };
    case 'pair': case 'grid': return { ...base, type, images };
    case 'strip': return { ...base, type, images: images.map((im) => { const old = (b.images ?? []).find((x) => x.src === im.src); return { ...im, scale: old?.scale ?? 1, offset: old?.offset ?? 0 }; }) };
    case 'free': {
      if (b.type === 'free') return b;
      return { ...base, type, ar: 1.6, items: cascade(images) };
    }
  }
  return b;
}

/** 换版式。能换成什么取决于图的张数：双图正好两张，图组、网格、自由排布至少两张 */
export function setLayout(doc, id, type) {
  return { ...doc, blocks: doc.blocks.map((b) => {
    if (b.id !== id) return b;
    const ims = imagesOf(b);
    if (type === 'pair' && ims.length !== 2) return b;
    if (['strip', 'grid', 'free'].includes(type) && ims.length < 2) return b;
    // 自由排布里的小段文字换版式后没地方放：留在原块里不换
    if (b.type === 'free' && (b.items ?? []).some((it) => it.kind === 'text') && type !== 'free') return b;
    return withImages(b, type, ims);
  }) };
}

export const layoutsFor = (b) => {
  const n = imagesOf(b).length;
  if (n < 2) return [];
  return [...(n === 2 ? ['pair'] : []), 'strip', 'grid', 'free'];
};

/** 新块的 id：b 加没被用过的最大序号 + 1 */
export function nextId(blocks, prefix = 'b') {
  const used = new Set(blocks.map((b) => b.id));
  let n = 0;
  for (const id of used) { const x = new RegExp(`^${prefix}(\\d+)$`).exec(id); if (x) n = Math.max(n, +x[1]); }
  let id; do id = prefix + String(++n).padStart(2, '0'); while (used.has(id));
  return id;
}

/** 和紧挨着的下一项（也是图片）合并：两张是双图，更多是网格 */
export function mergeWithNext(doc, key) {
  const its = itemsOf(doc);
  const i = its.findIndex((x) => x.key === key);
  const a = its[i], b = its[i + 1];
  if (!canMerge(a, b)) return doc;
  const ims = [...imagesOf(a), ...imagesOf(b)];
  const type = a.type !== 'image' && a.type !== 'pair' ? a.type : ims.length === 2 ? 'pair' : 'grid';
  const merged = a.type === 'free' ? { ...a, items: [...a.items, ...cascade(imagesOf(b)).map((it, k) => ({ ...it, z: a.items.length + k + 1 }))] } : withImages(a, type, ims);
  return { ...doc, blocks: doc.blocks.filter((x) => x.id !== b.key).map((x) => (x.id === a.key ? merged : x)) };
}
const canMerge = (a, b) => isImageBlock(a) && isImageBlock(b) && !(a.type === 'free' && a.items.some((it) => it.kind === 'text'));
export const canMergeNext = (doc, key) => {
  const its = itemsOf(doc);
  const i = its.findIndex((x) => x.key === key);
  return i >= 0 && canMerge(its[i], its[i + 1]);
};

/** 拆成一张张单图（第一张沿用原块的 id 和位置） */
export function split(doc, key) {
  const b = doc.blocks.find((x) => x.id === key);
  if (!b || !isImageBlock(b) || b.type === 'image') return doc;
  let blocks = doc.blocks;
  const pieces = imagesOf(b).map((im, k) => {
    if (k === 0) return withImages(b, 'image', [im]);
    const piece = { id: nextId(blocks), type: 'image', ...im, layout: 'wide' };
    blocks = [...blocks, piece];
    return piece;
  });
  // 自由排布里的小段竖排文字：拆出来变成竖排的段落
  const texts = b.type === 'free' ? b.items.filter((it) => it.kind === 'text') : [];
  for (const t of texts) { const p = { id: nextId([...blocks, ...pieces]), type: 'p', text: t.text, writing: 'v' }; pieces.push(p); blocks = [...blocks, p]; }
  return { ...doc, blocks: doc.blocks.flatMap((x) => (x.id === key ? pieces : [x])) };
}

/** 在某项后面（没给就是最后）插一个新块 */
export function insertAfter(doc, afterKey, block) {
  const b = { ...block, id: nextId(doc.blocks) };
  const its = itemsOf(doc);
  const it = its.find((x) => x.key === afterKey);
  const last = it ? blocksOfItem(it).at(-1).id : null;
  const at = last ? doc.blocks.findIndex((x) => x.id === last) + 1 : doc.blocks.length;
  return { doc: { ...doc, blocks: [...doc.blocks.slice(0, at), b, ...doc.blocks.slice(at)] }, id: b.id };
}

/** 删掉一项（一列文字是它所有的块） */
export function removeItem(doc, key) {
  const it = itemsOf(doc).find((x) => x.key === key);
  if (!it) return doc;
  const ids = new Set(blocksOfItem(it).map((b) => b.id));
  return { ...doc, blocks: doc.blocks.filter((b) => !ids.has(b.id)) };
}

export { TEXT_BLOCKS };
