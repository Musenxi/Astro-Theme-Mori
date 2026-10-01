/**
 * 游记“排版”视图里的操作：都是纯函数，输入 { stops, blocks }，返回新的 { stops, blocks }。
 * 排版视图里块按站点排成一条：[站点1][它的块…][站点2][它的块…]；写回时 blocks 也按这个顺序。
 */

/**
 * 按站点排成一条序列：{ kind: 'stop', stop } 和 { kind: 'block', block } 交替
 * @param {{ stops?: any[], blocks?: any[] }} doc
 * @returns {Array<{ kind: 'stop', stop: any } | { kind: 'block', block: any }>}
 */
export function sequence({ stops = [], blocks = [] }) {
  const seq = [];
  for (const s of stops) {
    seq.push({ kind: 'stop', stop: s });
    for (const b of blocks) if (b.stop === s.id) seq.push({ kind: 'block', block: b });
  }
  return seq;
}

/** 从序列写回 blocks：每个块属于它前面最近的那个站点 */
function fromSequence(seq, rest = []) {
  let cur;
  const blocks = [];
  for (const x of seq) {
    if (x.kind === 'stop') cur = x.stop.id;
    else blocks.push(x.block.stop === cur ? x.block : { ...x.block, stop: cur });
  }
  return [...blocks, ...rest];
}
const orphans = ({ stops = [], blocks = [] }) => blocks.filter((b) => !stops.some((s) => s.id === b.stop));

/** 把块挪到序列里的第 slot 个空位（按“去掉它之后”的序列计；0 会被当成第一个站点之后） */
export function moveBlock(doc, id, slot) {
  const seq = sequence(doc).filter((x) => !(x.kind === 'block' && x.block.id === id));
  const b = doc.blocks.find((x) => x.id === id);
  if (!b) return doc;
  seq.splice(Math.max(1, Math.min(slot, seq.length)), 0, { kind: 'block', block: b });
  return { ...doc, blocks: fromSequence(seq, orphans(doc)) };
}

/** 左右挪一格（跨过站点分界时换到相邻站点） */
export function nudgeBlock(doc, id, dir) {
  const seq = sequence(doc);
  const i = seq.findIndex((x) => x.kind === 'block' && x.block.id === id);
  if (i < 0) return doc;
  // 去掉自己之后，原来的位置是 i；往左一格是 i-1，往右是 i+1
  const slot = i + dir;
  if (slot < 1 || slot > seq.length - 1) return doc;
  return moveBlock(doc, id, slot);
}

export const imagesOf = (b) => {
  if (b.type === 'single') return [{ src: b.src, alt: b.alt ?? '', ...(b.caption ? { caption: b.caption } : {}) }];
  if (b.type === 'free') return (b.items ?? []).filter((it) => it.kind === 'image').map(({ src, alt, caption }) => ({ src, alt: alt ?? '', ...(caption ? { caption } : {}) }));
  return (b.images ?? []).map(({ src, alt, caption }) => ({ src, alt: alt ?? '', ...(caption ? { caption } : {}) }));
};
export const isImageBlock = (b) => ['single', 'pair', 'strip', 'grid', 'free'].includes(b?.type);

/** 自由排布的初始摆法：从左上往右下错开，后放的叠在上面 */
function cascade(images) {
  const n = images.length, w = n <= 2 ? 0.52 : n <= 4 ? 0.4 : 0.3;
  return images.map((im, i) => ({ kind: 'image', ...im, x: +((i * (1 - w)) / Math.max(1, n - 1)).toFixed(3), y: +(((i % 3) * 0.28) + 0.04).toFixed(3), w, z: i + 1 }));
}

/** 把一组图摆成另一种版式，保留块的 id、站点、位置和缩放 */
export function withImages(b, type, images) {
  const { src: _s, alt: _a, caption: _c, layout: _l, images: _i, items: _it, ar: _ar, ...base } = b;
  switch (type) {
    case 'single': return { ...base, type, ...images[0], layout: b.layout === 'inset' ? 'inset' : 'full' };
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
    // 自由排布里的小段文字换版式后没地方放：保留在旁边一个新的竖排文字块里太突兀，直接留在原块里不换
    if (b.type === 'free' && (b.items ?? []).some((it) => it.kind === 'text') && type !== 'free') return b;
    return withImages(b, type, ims);
  }) };
}

export const layoutsFor = (b) => {
  const n = imagesOf(b).length;
  if (n < 2) return [];
  return [...(n === 2 ? ['pair'] : []), 'strip', 'grid', 'free'];
};

function nextId(blocks, prefix) {
  const used = new Set(blocks.flatMap((b) => [b.id, ...(b.paras ?? []).map((p) => p.id)]));
  let n = 0;
  for (const id of used) { const x = new RegExp(`^${prefix}(\\d+)$`).exec(id); if (x) n = Math.max(n, +x[1]); }
  let id; do id = prefix + String(++n).padStart(2, '0'); while (used.has(id));
  return id;
}

/** 和同一站里紧挨着的下一个图片块合并：两张是双图，更多是网格 */
export function mergeWithNext(doc, id) {
  const seq = sequence(doc);
  const i = seq.findIndex((x) => x.kind === 'block' && x.block.id === id);
  const a = seq[i]?.block, b = seq[i + 1]?.kind === 'block' ? seq[i + 1].block : null;
  if (!isImageBlock(a) || !isImageBlock(b)) return doc;
  if (a.type === 'free' && a.items.some((it) => it.kind === 'text')) return doc;
  const ims = [...imagesOf(a), ...imagesOf(b)];
  const type = a.type !== 'single' && a.type !== 'pair' ? a.type : ims.length === 2 ? 'pair' : 'grid';
  const merged = a.type === 'free' ? { ...a, items: [...a.items, ...cascade(imagesOf(b)).map((it, k) => ({ ...it, z: a.items.length + k + 1 }))] } : withImages(a, type, ims);
  return { ...doc, blocks: doc.blocks.filter((x) => x.id !== b.id).map((x) => (x.id === a.id ? merged : x)) };
}
export const canMergeNext = (doc, id) => {
  const seq = sequence(doc);
  const i = seq.findIndex((x) => x.kind === 'block' && x.block.id === id);
  const a = seq[i]?.block, n = seq[i + 1];
  return isImageBlock(a) && n?.kind === 'block' && isImageBlock(n.block) && !(a.type === 'free' && a.items.some((it) => it.kind === 'text'));
};

/** 拆成一张张单图（第一张沿用原块的 id 和位置） */
export function split(doc, id) {
  const b = doc.blocks.find((x) => x.id === id);
  if (!b || !isImageBlock(b) || b.type === 'single') return doc;
  const ims = imagesOf(b);
  let blocks = doc.blocks;
  const pieces = ims.map((im, k) => {
    if (k === 0) return withImages(b, 'single', [im]);
    const nid = nextId(blocks, 's');
    const piece = { id: nid, type: 'single', stop: b.stop, ...im, layout: 'full' };
    blocks = [...blocks, piece];
    return piece;
  });
  const texts = b.type === 'free' ? b.items.filter((it) => it.kind === 'text') : [];
  if (texts.length) {
    const tid = nextId(blocks, 't');
    pieces.push({ id: tid, type: 'text', stop: b.stop, writing: 'v', paras: texts.map((t, k) => ({ id: `${tid}p${k + 1}`, text: t.text })) });
  }
  return { ...doc, blocks: doc.blocks.flatMap((x) => (x.id === id ? pieces : [x])) };
}

/** 在某个块后面（或某一站最后）插一个新块 */
export function insertAfter(doc, afterId, stopId, block) {
  const b = { ...block, id: nextId(doc.blocks, block.type === 'map' ? 'm' : block.type === 'text' ? 't' : 's'), stop: stopId };
  if (block.type === 'text' && !block.paras?.length) b.paras = [{ id: `${b.id}p1`, text: '' }];
  const seq = sequence(doc);
  let at = afterId ? seq.findIndex((x) => x.kind === 'block' && x.block.id === afterId) + 1 : -1;
  if (at <= 0) { // 放在这一站的最后
    const si = seq.findIndex((x) => x.kind === 'stop' && x.stop.id === stopId);
    at = si + 1;
    while (at < seq.length && seq[at].kind === 'block') at++;
  }
  seq.splice(at, 0, { kind: 'block', block: b });
  return { doc: { ...doc, blocks: fromSequence(seq, orphans(doc)) }, id: b.id };
}

export function removeBlock(doc, id) {
  return { ...doc, blocks: doc.blocks.filter((b) => b.id !== id) };
}

export function addStop(doc, name = '新的一站') {
  const used = new Set(doc.stops.map((s) => s.id));
  let n = doc.stops.length + 1;
  while (used.has('s' + n)) n++;
  const stop = { id: 's' + n, name, lnglat: [0, 0] };
  return { doc: { ...doc, stops: [...doc.stops, stop] }, id: stop.id };
}

/** 删站点：它的块并到前一站（第一站就并到后一站）。只剩一站时不删 */
export function removeStop(doc, id) {
  if (doc.stops.length < 2) return doc;
  const i = doc.stops.findIndex((s) => s.id === id);
  const into = doc.stops[i === 0 ? 1 : i - 1].id;
  const moved = { ...doc, blocks: doc.blocks.map((b) => (b.stop === id ? { ...b, stop: into } : b)), stops: doc.stops.filter((s) => s.id !== id) };
  return { ...moved, blocks: fromSequence(sequence(moved), orphans(moved)) };
}

/** 站点整组左右挪（连同它的块） */
export function moveStop(doc, id, dir) {
  const i = doc.stops.findIndex((s) => s.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= doc.stops.length) return doc;
  const stops = [...doc.stops];
  [stops[i], stops[j]] = [stops[j], stops[i]];
  const next = { ...doc, stops };
  return { ...next, blocks: fromSequence(sequence(next), orphans(next)) };
}
