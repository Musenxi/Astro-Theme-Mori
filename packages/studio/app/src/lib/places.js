/**
 * 正文里的地点（行内标记 place）的修改：编辑坐标、英文名、日期，去掉标记，在文末加一个地点。
 * 地点按出现顺序编号，和 flow.mjs 的 placesOf 一致。
 */
import { inlineOf } from 'astro-mori/flow';
import { nextId } from './layout-ops.js';

const spans = (v) => (typeof v === 'string' ? [{ t: v }] : Array.isArray(v) ? v : []);

/** 一段行内文字里，每个地点（相邻、标记相同的几段文字算一个）调用一次 next(mark)：返回新标记、null（去掉）或 undefined（不动） */
function mapRuns(list, next) {
  let prev = null, cur;
  return list.map((s) => {
    const m = (s.marks ?? []).find((x) => x.type === 'place');
    if (!m) { prev = null; return s; }
    const key = JSON.stringify(m);
    if (key !== prev) { cur = next(m); prev = key; }
    if (cur === undefined) return s;
    const marks = cur === null ? s.marks.filter((x) => x !== m) : s.marks.map((x) => (x === m ? cur : x));
    const { marks: _drop, ...rest } = s;
    return marks.length ? { ...rest, marks } : rest;
  });
}

/** 对正文里的每个地点调用 fn(n, mark)，返回改过的块 */
export function mapPlaces(blocks, fn) {
  let n = 0;
  const next = (m) => fn(n++, m);
  return blocks.map((b) => {
    if (!inlineOf(b).length) return b;
    if (b.type === 'list') return { ...b, items: b.items.map((it) => mapRuns(spans(it), next)) };
    return { ...b, text: mapRuns(spans(b.text), next) };
  });
}

const markOf = (m, patch) => {
  const o = { ...m, ...patch };
  for (const k of ['en', 'date']) if (!o[k]) delete o[k];
  return o;
};

/**
 * 改第 n 个地点的坐标、英文名、日期（文字本身不动）
 * @param {any} doc
 * @param {number} n
 * @param {{ lnglat?: number[], en?: string, date?: string }} patch
 */
export function editPlace(doc, n, patch) {
  return { ...doc, blocks: mapPlaces(doc.blocks, (i, m) => (i === n ? markOf(m, patch) : undefined)) };
}

/** 去掉第 n 个地点的标记，文字留着 */
export function removePlace(doc, n) {
  return { ...doc, blocks: mapPlaces(doc.blocks, (i) => (i === n ? null : undefined)) };
}

/**
 * 文末加一段只有地名的文字，标成地点
 * @param {any} doc
 * @param {{ name: string, lnglat: number[], en?: string, date?: string }} place
 */
export function appendPlace(doc, { name, lnglat, en, date }) {
  const mark = markOf({ type: 'place', lnglat }, { en, date });
  return { ...doc, blocks: [...doc.blocks, { id: nextId(doc.blocks), type: 'p', text: [{ t: name, marks: [mark] }] }] };
}

/**
 * 读 “纬度, 经度”（地图软件里复制出来的写法），返回 [经度, 纬度]；读不懂是 null
 * @param {string | undefined} s
 * @returns {[number, number] | null}
 */
export function parseLatLng(s) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(s ?? '');
  if (!m) return null;
  const lat = +m[1], lng = +m[2];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lng, lat] : null;
}

/**
 * [经度, 纬度] → “纬度, 经度”
 * @param {number[] | undefined} ll
 */
export const formatLatLng = (ll) => (ll ? `${+(+ll[1]).toFixed(6)}, ${+(+ll[0]).toFixed(6)}` : '');
