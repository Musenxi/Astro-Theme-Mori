/**
 * 排版视图里直接改字用的纯函数：输入文档，返回新文档（和光标该去的地方）。
 *
 * 一处能打字的地方叫一个“单元”（unit）：段落、标题、引用、代码块各是一个，列表里每一项一个。
 * 单元的名字是块的 id，列表项是 `块 id/第几项`。光标是 { unit, off }，off 是单元里第几个字。
 * 文字是 spans（[{ t, marks? }]），t 为空、带标注的是“原子”（比如没有字的旁注记号）：不占字数，跟着它前面的字走。
 */
import { TEXT_BLOCKS } from 'astro-mori/flow';
import { nextId } from './layout-ops.js';

/* ───────────── spans ───────────── */

export const asSpans = (v) => (typeof v === 'string' ? (v ? [{ t: v }] : []) : Array.isArray(v) ? v : []);
/** 存回去时：没有任何标注的一整段存成字符串（和 Markdown 解析出来的一样） */
export const compact = (spans) => (!spans.length ? '' : spans.length === 1 && !spans[0].marks?.length ? spans[0].t : spans);
export const lengthOf = (spans) => spans.reduce((n, s) => n + s.t.length, 0);
const same = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/** 相邻、标注一样的字并起来；空的标注数组去掉 */
export function merge(spans) {
  const out = [];
  for (const raw of spans) {
    const s = raw.marks?.length ? { t: raw.t, marks: raw.marks } : { t: raw.t };
    if (s.t === '' && !s.marks) continue;
    const last = out.at(-1);
    if (last && s.t !== '' && last.t !== '' && same(last.marks, s.marks)) last.t += s.t;
    else out.push(s);
  }
  return out;
}

/** 在第 k 个字处切开；正好在 k 处的原子归左边 */
export function splitSpans(spans, k) {
  const left = [], right = [];
  let pos = 0;
  for (const s of spans) {
    const end = pos + s.t.length;
    if (s.t === '') (pos <= k ? left : right).push(s);
    else if (end <= k) left.push(s);
    else if (pos >= k) right.push(s);
    else { left.push({ ...s, t: s.t.slice(0, k - pos) }); right.push({ ...s, t: s.t.slice(k - pos) }); }
    pos = end;
  }
  return [left, right];
}

/** 加 / 去掉一种标注：选中的字都已经有了就去掉，否则都加上（on 给了就照它） */
export function toggleMark(spans, a, b, type, on) {
  if (b <= a) return spans;
  const [x, rest] = splitSpans(spans, a);
  const [mid, z] = splitSpans(rest, b - a);
  const has = on === undefined ? mid.filter((s) => s.t).every((s) => (s.marks ?? []).some((m) => m.type === type)) : !on;
  const next = mid.map((s) => {
    if (!s.t) return s;
    const others = (s.marks ?? []).filter((m) => m.type !== type);
    return { ...s, marks: has ? others : [...others, { type }] };
  });
  return merge([...x, ...next, ...z]);
}

/** 这段选中的字是不是都有某种标注（工具条上的按钮亮不亮） */
export function hasMark(spans, a, b, type) {
  const [, rest] = splitSpans(spans, a);
  const [mid] = splitSpans(rest, Math.max(b - a, 1));
  const txt = mid.filter((s) => s.t);
  return txt.length > 0 && txt.every((s) => (s.marks ?? []).some((m) => m.type === type));
}

/* ───────────── 单元 ───────────── */

/** 一篇里所有能打字的单元，按顺序 */
export function unitsOf(blocks) {
  const out = [];
  for (const b of blocks ?? []) {
    if (!TEXT_BLOCKS.has(b.type)) continue;
    if (b.type === 'list') (b.items ?? []).forEach((_, i) => out.push({ unit: `${b.id}/${i}`, id: b.id, item: i }));
    else out.push({ unit: b.id, id: b.id });
  }
  return out;
}

const parse = (unit) => { const [id, i] = unit.split('/'); return { id, item: i === undefined ? undefined : +i }; };
const isPlain = (b) => b?.type === 'code';
const blockOf = (doc, unit) => doc.blocks.find((b) => b.id === parse(unit).id);

/** 单元里的字：代码块是字符串，其余是 spans */
export function getUnit(doc, unit) {
  const b = blockOf(doc, unit), { item } = parse(unit);
  if (!b) return [];
  if (isPlain(b)) return b.code ?? '';
  return asSpans(item === undefined ? b.text : b.items?.[item]);
}

/** 单元在块里存的原样（字符串或 spans），用来比较改没改 */
export function rawUnit(doc, unit) {
  const b = blockOf(doc, unit), { item } = parse(unit);
  if (!b) return undefined;
  return isPlain(b) ? b.code ?? '' : item === undefined ? b.text : b.items?.[item];
}

export const valueLen = (v) => (typeof v === 'string' ? v.length : lengthOf(v));

export function setUnit(doc, unit, value) {
  const { id, item } = parse(unit);
  return { ...doc, blocks: doc.blocks.map((b) => {
    if (b.id !== id) return b;
    if (isPlain(b)) return { ...b, code: typeof value === 'string' ? value : value.map((s) => s.t).join('') };
    const v = compact(typeof value === 'string' ? asSpans(value) : merge(value));
    if (item === undefined) return { ...b, text: v };
    return { ...b, items: b.items.map((x, k) => (k === item ? v : x)) };
  }) };
}

/** 新段落跟着哪一列：带上它的横滚 / 竖滚设置，才不会自己另起一列 */
const placement = (b) => (b && (b.type === 'p' || b.type === 'quote') ? { ...(b.h ? { h: b.h } : {}), ...(b.v ? { v: b.v } : {}) } : {});

/** 回车：在光标处拆成两段（代码块里是换行；列表里空的一项回车是结束列表） */
export function splitUnit(doc, unit, off) {
  const b = blockOf(doc, unit), { id, item } = parse(unit);
  if (!b) return { doc, caret: { unit, off } };
  const value = getUnit(doc, unit);
  if (isPlain(b)) return { doc: setUnit(doc, unit, value.slice(0, off) + '\n' + value.slice(off)), caret: { unit, off: off + 1 } };
  const [l, r] = splitSpans(value, off);
  const at = doc.blocks.indexOf(b);
  const nid = nextId(doc.blocks);

  if (item !== undefined) {
    if (!lengthOf(value)) {
      // 空的一项：去掉它，在列表后面接一段（列表变空就整个去掉）
      const items = b.items.filter((_, k) => k !== item);
      const head = items.slice(0, item), tail = items.slice(item);
      const p = { id: nid, type: 'p', text: '' };
      const pieces = [...(head.length ? [{ ...b, items: head }] : []), p, ...(tail.length ? [{ ...b, id: nextId([...doc.blocks, p]), items: tail }] : [])];
      return { doc: { ...doc, blocks: [...doc.blocks.slice(0, at), ...pieces, ...doc.blocks.slice(at + 1)] }, caret: { unit: nid, off: 0 } };
    }
    const items = [...b.items.slice(0, item), compact(l), compact(r), ...b.items.slice(item + 1)];
    return { doc: { ...doc, blocks: doc.blocks.map((x) => (x === b ? { ...b, items } : x)) }, caret: { unit: `${id}/${item + 1}`, off: 0 } };
  }

  // 在一段的开头回车：前面插一段空的，这一段（和它的 id、引用评论）不动
  if (off === 0 && lengthOf(value) > 0) {
    const p = { id: nid, type: b.type === 'h' ? 'p' : b.type, text: '', ...(b.type === 'h' ? placement(doc.blocks[at - 1]) : placement(b)) };
    if (p.type === 'quote') p.type = 'p';
    return { doc: { ...doc, blocks: [...doc.blocks.slice(0, at), p, ...doc.blocks.slice(at)] }, caret: { unit, off: 0 } };
  }
  // 后半段成新的一段：标题、引用后面接的是正文
  const p = { id: nid, type: 'p', text: compact(r), ...(b.type === 'h' ? placement(doc.blocks[at + 1]) : placement(b)) };
  const blocks = [...doc.blocks.slice(0, at), { ...b, text: compact(l) }, p, ...doc.blocks.slice(at + 1)];
  return { doc: { ...doc, blocks }, caret: { unit: nid, off: 0 } };
}

/** 去掉一个单元（列表项去掉后列表空了，整个列表也去掉） */
function dropUnit(doc, unit) {
  const { id, item } = parse(unit);
  if (item === undefined) return { ...doc, blocks: doc.blocks.filter((b) => b.id !== id) };
  return { ...doc, blocks: doc.blocks.flatMap((b) => {
    if (b.id !== id) return [b];
    const items = b.items.filter((_, k) => k !== item);
    return items.length ? [{ ...b, items }] : [];
  }) };
}

const join = (a, b) => (typeof a === 'string' || typeof b === 'string'
  ? (typeof a === 'string' ? a : a.map((s) => s.t).join('')) + (typeof b === 'string' ? b : b.map((s) => s.t).join(''))
  : merge([...a, ...b]));

/** 两个单元挨着吗（中间没有图片之类的块） */
function adjacent(doc, a, b) {
  const ia = doc.blocks.findIndex((x) => x.id === parse(a).id), ib = doc.blocks.findIndex((x) => x.id === parse(b).id);
  return ia >= 0 && ib >= 0 && (ib === ia || ib === ia + 1);
}

/**
 * 在单元开头按退格：并进前一个单元（前一个是什么类型，并起来就是什么类型）。
 * 前面挨着的不是文字：这一段是空的就去掉它，否则什么也不做（返回 null）。
 */
export function mergeBack(doc, unit) {
  const us = unitsOf(doc.blocks);
  const i = us.findIndex((u) => u.unit === unit);
  const prev = us[i - 1];
  const value = getUnit(doc, unit);
  if (!prev || !adjacent(doc, prev.unit, unit)) {
    if (valueLen(value) > 0) return null;
    const next = dropUnit(doc, unit);
    const after = us[i + 1] && adjacent(doc, unit, us[i + 1].unit) ? us[i + 1].unit : null;
    return { doc: next, caret: after ? { unit: shift(us[i + 1], parse(unit)), off: 0 } : null };
  }
  const pv = getUnit(doc, prev.unit);
  let next = setUnit(doc, prev.unit, join(pv, value));
  next = dropUnit(next, unit);
  return { doc: next, caret: { unit: prev.unit, off: valueLen(pv) } };
}

/** 去掉同一列表里前面的一项以后，后面项的序号要减一 */
const shift = (u, gone) => (u.item !== undefined && u.id === gone.id && gone.item !== undefined && u.item > gone.item ? `${u.id}/${u.item - 1}` : u.unit);

/** 在单元末尾按删除键：把下一个单元并进来 */
export function mergeForward(doc, unit) {
  const us = unitsOf(doc.blocks);
  const i = us.findIndex((u) => u.unit === unit);
  const next = us[i + 1];
  if (!next || !adjacent(doc, unit, next.unit)) return null;
  const r = mergeBack(doc, next.unit);
  return r && { ...r, caret: { unit, off: valueLen(getUnit(doc, unit)) } };
}

/** 删掉从 a 到 b 的字（可以跨单元：a 的前半和 b 的后半并成一段，中间的整段去掉） */
export function deleteRange(doc, a, b) {
  const us = unitsOf(doc.blocks).map((u) => u.unit);
  let [s, e] = [a, b];
  if (us.indexOf(s.unit) > us.indexOf(e.unit) || (s.unit === e.unit && s.off > e.off)) [s, e] = [e, s];
  const va = getUnit(doc, s.unit), vb = getUnit(doc, e.unit);
  const head = typeof va === 'string' ? va.slice(0, s.off) : splitSpans(va, s.off)[0];
  const tail = typeof vb === 'string' ? vb.slice(e.off) : splitSpans(vb, e.off)[1];
  let next = setUnit(doc, s.unit, join(head, tail));
  if (s.unit !== e.unit) {
    // 中间的单元和 e 去掉：从后往前删，列表项的序号才不会错
    const gone = us.slice(us.indexOf(s.unit) + 1, us.indexOf(e.unit) + 1).reverse();
    for (const u of gone) next = dropUnit(next, u);
  }
  return { doc: next, caret: { unit: s.unit, off: s.off } };
}

/** 粘贴 / 打字：在光标处插入纯文字，换行拆成几段 */
export function insertText(doc, at, text) {
  const b = blockOf(doc, at.unit);
  if (!b) return { doc, caret: at };
  const clean = text.replace(/\r\n?/g, '\n');
  if (isPlain(b)) {
    const v = getUnit(doc, at.unit);
    return { doc: setUnit(doc, at.unit, v.slice(0, at.off) + clean + v.slice(at.off)), caret: { unit: at.unit, off: at.off + clean.length } };
  }
  const lines = clean.split(/\n+/);
  let d = doc, caret = at;
  lines.forEach((line, k) => {
    if (k > 0) ({ doc: d, caret } = splitUnit(d, caret.unit, caret.off));
    if (!line) return;
    const [l, r] = splitSpans(getUnit(d, caret.unit), caret.off);
    d = setUnit(d, caret.unit, [...l, { t: line }, ...r]);
    caret = { unit: caret.unit, off: caret.off + line.length };
  });
  return { doc: d, caret };
}

/** 段落样式：正文 / 大标题 / 小标题 / 引用之间换（列表和代码块不换） */
export const STYLES = ['p', 'h2', 'h3', 'quote'];
export const styleOf = (b) => (b?.type === 'h' ? (b.level === 3 ? 'h3' : 'h2') : b?.type);
export function setStyle(doc, id, style) {
  return { ...doc, blocks: doc.blocks.map((b) => {
    if (b.id !== id || !['p', 'h', 'quote'].includes(b.type) || styleOf(b) === style) return b;
    const { level: _l, cite: _c, ...rest } = b;
    if (style === 'h2' || style === 'h3') return { ...rest, type: 'h', level: style === 'h2' ? 2 : 3 };
    return { ...rest, type: style };
  }) };
}
