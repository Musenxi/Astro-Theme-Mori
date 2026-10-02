/**
 * 长卷（横滚、地图）相关的纯函数：Astro 的 schema、站点渲染、Studio 都用它，所以是不依赖任何东西的 .mjs。
 *
 * 内容只有一种结构：块的序列。读法（竖向 / 横向 / 混合）和地图是每篇文章自己的设置，
 * 地点是正文里的行内标记 `{ type: 'place', lnglat: [经度, 纬度], en?, date? }`，不绑定标题。
 * 以前的游记（`stops` + 每个块属于一站）读取时用 fromLegacyTravel 转成这种结构。
 */

/** 一列文字里能放的块 */
export const TEXT_BLOCKS = new Set(['p', 'h', 'quote', 'list', 'code']);
/** 只有长卷版式才有的块 */
export const LAYOUT_BLOCKS = new Set(['pair', 'strip', 'grid', 'free', 'map']);
/** 能竖排的文字块 */
export const WRITING_BLOCKS = new Set(['p', 'h', 'quote', 'list']);

export const DEFAULT_READING = { default: 'v', allowed: ['v', 'h', 'mix'], direction: 'ltr' };

export const isLegacyTravel = (d) => d?.kind === 'travel' || (d?.kind === undefined && Array.isArray(d?.stops));

/** 这篇文章要用长卷版式渲染吗：开了地图、设了读法，或者用了长卷才有的块 */
export const usesFlow = (d) => !!d?.map || !!d?.reading || (d?.blocks ?? []).some((b) => LAYOUT_BLOCKS.has(b.type));

/* ───────────── 地点标记 ⇄ Markdown 里的 geo: 地址 ───────────── */

const num = (n) => String(+(+n).toFixed(6));
/** 地址里只转义会破坏 Markdown 链接的字符，中文和带音标的字母保持可读 */
const escHref = (s) => s.replace(/[%&=?()\s#]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
const unesc = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

/** 地点标记 → `geo:纬度,经度?en=…&date=…`（geo URI，RFC 5870） */
export function placeHref(m) {
  const q = [m.en ? `en=${escHref(m.en)}` : '', m.date ? `date=${escHref(m.date)}` : '', m.region ? `region=${m.region}` : ''].filter(Boolean).join('&');
  return `geo:${num(m.lnglat[1])},${num(m.lnglat[0])}${q ? `?${q}` : ''}`;
}

/**
 * `geo:…` → 地点标记；不是地点就返回 null
 * @param {string | undefined} href
 * @returns {{ type: 'place', lnglat: [number, number], en?: string, date?: string, region?: 'new' | 'same' } | null}
 */
export function parsePlaceHref(href) {
  const m = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:\?(.*))?$/.exec(href ?? '');
  if (!m) return null;
  const lat = +m[1], lng = +m[2];
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const q = Object.fromEntries((m[3] ?? '').split('&').filter(Boolean).map((kv) => { const i = kv.indexOf('='); return i < 0 ? [kv, ''] : [kv.slice(0, i), unesc(kv.slice(i + 1))]; }));
  return { type: 'place', lnglat: [lng, lat], ...(q.en ? { en: q.en } : {}), ...(q.date ? { date: q.date } : {}), ...(q.region === 'new' || q.region === 'same' ? { region: q.region } : {}) };
}

/* ───────────── 正文里的地点 ───────────── */

const spansOf = (v) => (typeof v === 'string' ? [{ t: v }] : Array.isArray(v) ? v : []);

/** 一个块里所有能放行内文字的位置 */
export function inlineOf(b) {
  switch (b.type) {
    case 'p': case 'h': case 'quote': return [spansOf(b.text)];
    case 'list': return (b.items ?? []).map(spansOf);
    default: return [];
  }
}

/** 一段行内文字里的地点：相邻、标记相同的几段文字算同一个地点（中间可能被粗体之类拆开） */
function placesInSpans(spans) {
  const out = [];
  let prev = null;
  for (const s of spans) {
    const m = (s.marks ?? []).find((x) => x.type === 'place');
    if (!m) { prev = null; continue; }
    const key = JSON.stringify(m);
    if (prev === key) out[out.length - 1].label += s.t;
    else out.push({ label: s.t, mark: m });
    prev = key;
  }
  return out;
}

/**
 * 正文里的地点，按出现顺序。每个：{ n（第几个，从 0 起）, block（块 id）, label（文字）, lnglat, en?, date? }
 * 地图、行程表、“当前位置”都按这个顺序。
 */
export function placesOf(blocks) {
  const out = [];
  for (const b of blocks ?? []) {
    for (const spans of inlineOf(b)) {
      for (const { label, mark } of placesInSpans(spans)) out.push({ n: out.length, block: b.id, label, lnglat: mark.lnglat, ...(mark.en ? { en: mark.en } : {}), ...(mark.date ? { date: mark.date } : {}), ...(mark.region ? { region: mark.region } : {}) });
    }
  }
  return out;
}

/* ───────────── 地图的区域 ───────────── */

const RAD = Math.PI / 180;
/** 两点之间的大圆距离（公里） */
export function distanceKm(a, b) {
  const dLat = (b[1] - a[1]) * RAD, dLng = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 自动分区的两个界限：和上一处隔了多远、这一区一共铺开多大（度） */
const AUTO_KM = 150, AUTO_SPAN = 3;

/**
 * 把按顺序的地点分成“区域”：相邻的地点同属一个小区域，左下角的地图和插入的地图块只画这一区。
 * 自动：和上一处隔得远（>150 公里），或者这一区铺得太大（>3 度），就另起一区。
 * 作者可以改：地点标记上 `region: 'new'` 从这里另起一区，`'same'` 接上一处（不管多远）。
 * 区域之间的大转移不单独出图：左下角的小地图从这一区飞到下一区（见 travel.ts）。
 * @param {Array<{ n: number, lnglat: [number, number], region?: 'new' | 'same' }>} places
 * @returns {{ regions: Array<{ k: number, places: number[] }>, regionOf: number[] }}
 */
export function regionsOf(places) {
  const regions = [], regionOf = [];
  let box = null;
  places.forEach((p, i) => {
    const [x, y] = p.lnglat;
    let split = i === 0;
    if (!split) {
      const prev = places[i - 1];
      if (p.region === 'new') split = true;
      else if (p.region !== 'same') {
        const nb = [Math.min(box[0], x), Math.max(box[1], x), Math.min(box[2], y), Math.max(box[3], y)];
        const spanX = (nb[1] - nb[0]) * Math.cos(((nb[2] + nb[3]) / 2) * RAD), spanY = nb[3] - nb[2];
        split = distanceKm(prev.lnglat, p.lnglat) > AUTO_KM || Math.max(spanX, spanY) > AUTO_SPAN;
      }
    }
    if (split) { regions.push({ k: regions.length, places: [] }); box = [x, x, y, y]; }
    else box = [Math.min(box[0], x), Math.max(box[1], x), Math.min(box[2], y), Math.max(box[3], y)];
    regions.at(-1).places.push(i);
    regionOf.push(regions.length - 1);
  });
  return { regions, regionOf };
}

/** 轨迹上离 p 最近的点的序号（从 from 往后找） */
function nearestOnTrack(track, p, from = 0) {
  let best = Infinity, at = from;
  const k = Math.cos(p[1] * RAD);
  for (let i = from; i < track.length; i++) {
    const dx = (track[i][0] - p[0]) * k, dy = track[i][1] - p[1], d = dx * dx + dy * dy;
    if (d < best) { best = d; at = i; }
  }
  return at;
}

/** 地点离轨迹多远以内算在轨迹上（公里） */
const ON_TRACK_KM = 50;

/** 轨迹上从 a 走到 b 的那一段（两头接上 a、b 本身）；轨迹没有这一段（没给、有一处不在轨迹上、两点对不上先后）返回 null */
export function trackBetween(track, a, b) {
  if (!track || track.length < 2) return null;
  const i = nearestOnTrack(track, a), j = nearestOnTrack(track, b, i);
  if (j <= i || distanceKm(a, track[i]) > ON_TRACK_KM || distanceKm(b, track[j]) > ON_TRACK_KM) return null;
  return [a, ...track.slice(i + 1, j), b];
}

/** 没有轨迹的大转移：画一条弯弓形的弧（朝行进方向的左边鼓出去），一眼能看出是“去了那里”而不是一条精确的路 */
export function arcBetween(a, b, bow = 0.16, n = 28) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  return Array.from({ length: n + 1 }, (_, i) => {
    if (i === 0) return [a[0], a[1]];
    if (i === n) return [b[0], b[1]];
    const t = i / n, lift = Math.sin(Math.PI * t) * len * bow;
    return [a[0] + dx * t + nx * lift, a[1] + dy * t + ny * lift];
  });
}

/**
 * 整趟行程的路线（一条折线），左下角小地图沿它往前画。相邻两处之间：轨迹里有这一段就用轨迹，
 * 没有的话同一区里直接连，跨区的大转移画一段弧。
 * @param {Array<{ lnglat: [number, number] }>} places
 * @param {number[]} regionOf
 * @param {Array<[number, number]> | undefined} track
 * @returns {{ line: Array<[number, number]>, at: number[] }} at[地点序号] = 这个地点在折线里是第几个点
 */
export function tripOf(places, regionOf, track) {
  const line = [], at = [];
  places.forEach((p, i) => {
    if (i === 0) line.push(p.lnglat);
    else {
      const a = places[i - 1].lnglat, b = p.lnglat;
      const seg = trackBetween(track, a, b) ?? (regionOf[i] === regionOf[i - 1] ? [a, b] : arcBetween(a, b));
      line.push(...seg.slice(1));
    }
    at.push(line.length - 1);
  });
  return { line, at };
}

/** 地点的名字：就是标记住的文字。去掉两端空白 */
export const placeName = (p) => p.label.trim() || p.en || '';

/** 只有地点、没有字的段落（不写地名的地点：读到这里时地图跟着变，页面上看不见） */
export const isPlaceOnly = (b) => {
  if (b.type !== 'p') return false;
  const s = spansOf(b.text);
  return s.some((x) => (x.marks ?? []).some((m) => m.type === 'place')) && s.every((x) => !x.t.trim());
};

/* ───────────── 把块排成“列” ───────────── */

/**
 * 横滚时，相邻的文字块排成一列文字；图片、地图各自一块。
 * 二级标题另起一列；竖排和横排不混在一列里（h / list 没有竖排设置，跟着所在的列走）。
 * 一列的上下位置和缩放取列里第一个设了的块（Studio 会写在列里每个块上，删掉第一个块也不丢）。
 * @returns {Array<{ kind: 'text', blocks: any[], writing: 'h' | 'v', y?: number, scale?: number, anchor?: boolean } | { kind: 'block', block: any }>}
 */
export function columns(blocks) {
  const out = [];
  let cur = null;
  for (const b of blocks ?? []) {
    if (!TEXT_BLOCKS.has(b.type)) { cur = null; out.push({ kind: 'block', block: b }); continue; }
    // 段落和引用不写 writing 就是横排；标题和列表不写就跟着所在的列走；代码块永远横排，跟着走
    const w = b.type === 'p' || b.type === 'quote' ? (b.writing === 'v' ? 'v' : 'h') : WRITING_BLOCKS.has(b.type) && b.writing ? (b.writing === 'v' ? 'v' : 'h') : undefined;
    const split = !cur || (b.type === 'h' && b.level !== 3) || (w !== undefined && cur.writing !== undefined && w !== cur.writing);
    if (split) { cur = { kind: 'text', blocks: [], writing: w }; out.push(cur); }
    cur.writing ??= w;
    cur.blocks.push(b);
  }
  for (const c of out) {
    if (c.kind !== 'text') continue;
    c.writing = c.writing === 'v' ? 'v' : 'h';
    if (c.blocks.every(isPlaceOnly)) c.anchor = true; // 整列都是看不见的地点：只当一个锚点
    const y = c.blocks.find((b) => b.y !== undefined)?.y, scale = c.blocks.find((b) => b.scale !== undefined)?.scale;
    if (y !== undefined) c.y = y;
    if (scale !== undefined) c.scale = scale;
  }
  return out;
}

/** 一列（或一块）里的所有块 */
export const blocksOf = (col) => (col.kind === 'text' ? col.blocks : [col.block]);

/* ───────────── 老游记 → 现在的结构 ───────────── */

const located = (s) => Array.isArray(s.lnglat) && (s.lnglat[0] !== 0 || s.lnglat[1] !== 0);

/**
 * 老游记（`stops` + 每个块有 `stop`）→ 现在的结构：
 *   站点 → 二级标题，站名上标着地点（没填经纬度的站只有标题）
 *   文字块 → 一个个段落 / 标题 / 引用 / 列表 / 代码块（沿用段落 id，读者的引用评论不丢），竖排和位置抄到每个块上
 *   单图 → 图片；双图、图组、网格、自由排布、地图原样（地图的“只看这一站”改叫“只看这一处附近”）
 *   读法、事实、轨迹、旁注原样；地图开着
 * 同一份内容转换结果每次都一样（标题 id 由站点 id 定）。
 */
export function fromLegacyTravel(doc) {
  const { kind: _k, stops = [], blocks = [], reading, ...rest } = doc;
  const taken = new Set(blocks.flatMap((b) => [b.id, ...(b.paras ?? []).map((p) => p.id)]));
  const headId = (s) => { let id = `h-${s.id}`; while (taken.has(id)) id += '_'; taken.add(id); return id; };
  const pos = (b) => ({ ...(b.y !== undefined ? { y: b.y } : {}), ...(b.scale !== undefined ? { scale: b.scale } : {}) });

  const convert = (b) => {
    switch (b.type) {
      case 'text': return (b.paras ?? []).map((p) => {
        const type = p.type ?? 'p';
        const v = b.writing === 'v' && WRITING_BLOCKS.has(type) ? { writing: 'v' } : {};
        const body = type === 'h' ? { level: 3, text: p.text }
          : type === 'quote' ? { text: p.text, ...(p.cite ? { cite: p.cite } : {}) }
          : type === 'list' ? { ordered: !!p.ordered, items: p.items }
          : type === 'code' ? { ...(p.lang ? { lang: p.lang } : {}), code: p.code }
          : { text: p.text };
        return { id: p.id, type, ...body, ...v, ...pos(b) };
      });
      case 'single': return [{ id: b.id, type: 'image', src: b.src, alt: b.alt ?? '', ...(b.caption ? { caption: b.caption } : {}), layout: b.layout === 'inset' ? 'inline' : 'wide', ...pos(b) }];
      case 'map': return [{ id: b.id, type: 'map', scope: b.scope === 'stop' ? 'near' : 'route', ...pos(b) }];
      default: { const { stop: _s, ...r } = b; return [r]; }
    }
  };

  const out = [];
  for (const s of stops) {
    const mark = located(s) ? [{ type: 'place', lnglat: s.lnglat, ...(s.en ? { en: s.en } : {}), ...(s.date ? { date: s.date } : {}) }] : undefined;
    out.push({ id: headId(s), type: 'h', level: 2, text: [{ t: s.name ?? '', ...(mark ? { marks: mark } : {}) }] });
    for (const b of blocks) if (b.stop === s.id) out.push(...convert(b));
  }
  for (const b of blocks) if (!stops.some((s) => s.id === b.stop)) out.push(...convert(b)); // 不属于任何站点的块：留着，别悄悄丢
  return { ...rest, map: true, reading: reading ?? DEFAULT_READING, blocks: out };
}

/** 读取时统一成现在的结构：老游记转换，其余原样 */
export const normalizeDoc = (d) => (isLegacyTravel(d) ? fromLegacyTravel(d) : d);
