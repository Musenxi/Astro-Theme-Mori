/**
 * 普通文章 ⇄ 游记：在“信息”里换模版时，把正文换成另一种结构。
 * 能对应的都对应上：段落 ⇄ 文字段（沿用 id，读者的划词批注不丢）、## 标题 ⇄ 站点、图片 ⇄ 单图。
 * 游记特有的设置（站点的经纬度、路线、读法、事实）换成普通文章时留在文件里（主题不读），换回来时按站名还原。
 */

const plain = (text) => (typeof text === 'string' ? text : (text ?? []).map((s) => s.t).join(''));
const TRAVEL_ONLY = ['stops', 'track', 'reading', 'facts'];

export const isTravelDoc = (doc) => doc.kind === 'travel' || (doc.kind === undefined && Array.isArray(doc.stops));

function idMaker(taken) {
  const used = new Set(taken);
  const max = {};
  for (const id of used) { const x = /^([a-z]+)(\d+)$/.exec(id); if (x) max[x[1]] = Math.max(max[x[1]] ?? 0, +x[2]); }
  return {
    has: (id) => used.has(id),
    take: (id) => { used.add(id); return id; },
    next: (p) => { let id; do id = p + String((max[p] = (max[p] ?? 0) + 1)).padStart(2, '0'); while (used.has(id)); used.add(id); return id; },
  };
}

/** 普通文章 → 游记 */
export function toTravel(doc) {
  const kept = doc.stops ?? []; // 以前是游记、换过来又换回去：站点的经纬度、英文名按站名找回来
  const stops = [], blocks = [];
  const ids = idMaker((doc.blocks ?? []).map((b) => b.id));
  let text = null;
  const stop = () => {
    if (!stops.length) stops.push(fromKept(kept[0]?.name ?? '起点', 0));
    return stops.at(-1).id;
  };
  function fromKept(name, i) {
    const k = kept.find((s) => s.name === name) ?? (i === 0 && !name ? kept[0] : undefined);
    const used = new Set(stops.map((s) => s.id));
    let id = k && !used.has(k.id) ? k.id : null;
    if (!id) { let n = stops.length + 1; while (used.has('s' + n) || kept.some((s) => s.id === 's' + n && s.name !== name)) n++; id = 's' + n; }
    return { ...(k ?? { lnglat: [0, 0] }), id, name };
  }
  const para = (id, spans, writing = 'h') => {
    const s = stop();
    if (!text || text.stop !== s || (text.writing ?? 'h') !== writing) {
      text = { id: ids.next('t'), type: 'text', stop: s, ...(writing === 'v' ? { writing: 'v' } : {}), paras: [] };
      blocks.push(text);
    }
    text.paras.push({ id: id && !text.paras.some((p) => p.id === id) ? id : ids.next(`${text.id}p`), text: spans });
  };
  for (const b of doc.blocks ?? []) {
    switch (b.type) {
      case 'h':
        if (b.level === 2) { stops.push(fromKept(plain(b.text), stops.length)); text = null; }
        else para(b.id, b.text);
        break;
      case 'p': para(b.id, b.text); break;
      case 'quote': para(b.id, b.text, b.writing === 'v' ? 'v' : 'h'); break;
      case 'list': b.items.forEach((it, k) => para(k === 0 ? b.id : null, it)); break;
      case 'code': para(b.id, [{ t: b.code }]); break;
      case 'image':
        text = null;
        blocks.push({ id: ids.next('s'), type: 'single', stop: stop(), src: b.src, alt: b.alt ?? '', ...(b.caption ? { caption: b.caption } : {}), layout: b.layout === 'inline' ? 'inset' : 'full' });
        break;
    }
  }
  if (!blocks.length) blocks.push({ id: ids.next('t'), type: 'text', stop: stop(), paras: [{ id: ids.next('b'), text: '' }] });
  stop();
  const { kind: _k, ...rest } = doc;
  return {
    kind: 'travel', ...rest,
    facts: doc.facts ?? [],
    stops,
    reading: doc.reading ?? { default: 'v', allowed: ['v', 'h', 'mix'], direction: 'ltr' },
    blocks,
  };
}

/** 游记 → 普通文章。地图块没有对应的东西，丢掉；自由排布里的小段文字变成段落 */
export function toArticle(doc) {
  const out = [];
  const ids = idMaker([...(doc.blocks ?? []).map((b) => b.id), ...(doc.blocks ?? []).flatMap((b) => (b.paras ?? []).map((p) => p.id))]);
  const img = (im, layout = 'wide') => out.push({ id: ids.next('b'), type: 'image', src: im.src, alt: im.alt ?? '', ...(im.caption ? { caption: im.caption } : {}), layout });
  (doc.stops ?? []).forEach((s, si) => {
    const own = (doc.blocks ?? []).filter((b) => b.stop === s.id);
    // 第一站如果是换模版时自动补的“起点”（正文开头、第一个小标题之前的部分），不必变成小标题
    if (!(si === 0 && ['', '起点'].includes(s.name ?? ''))) out.push({ id: ids.next('b'), type: 'h', level: 2, text: [{ t: s.name ?? '' }] });
    for (const b of own) {
      switch (b.type) {
        case 'text':
          for (const p of b.paras ?? []) out.push(b.writing === 'v' ? { id: p.id, type: 'quote', writing: 'v', text: p.text } : { id: p.id, type: 'p', text: p.text });
          break;
        case 'single': img(b, b.layout === 'inset' ? 'inline' : 'wide'); break;
        case 'pair': case 'strip': case 'grid': b.images.forEach((im) => img(im, 'inline')); break;
        case 'free':
          for (const it of b.items ?? []) {
            if (it.kind === 'image') img(it, 'inline');
            else out.push({ id: ids.next('b'), type: 'p', text: it.text });
          }
          break;
      }
    }
  });
  if (!out.length) out.push({ id: 'b01', type: 'p', text: '' });
  const { kind: _k, ...rest } = doc;
  const keep = Object.fromEntries(TRAVEL_ONLY.filter((k) => k in rest).map((k) => [k, rest[k]]));
  for (const k of TRAVEL_ONLY) delete rest[k];
  return { kind: 'article', ...rest, ...keep, blocks: out };
}
