/**
 * 剪影地图（spec §3.2）：构建时用 d3-geo + Natural Earth（world-atlas，公有领域）生成 SVG 的几何，页面上不加载任何地图 JS。
 * 包含：陆地轮廓、路线、站点、站点标签（自动避让）、比例尺、纬线（北极圈 / 回归线 / 赤道，在画面里才画）。
 */
import { geoMercator, geoNaturalEarth1, geoConicConformal, geoPath, geoDistance } from 'd3-geo';
import { line, curveCatmullRom } from 'd3-shape';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import { t } from './i18n.ts';

export const W = 1000, H = 720;
export type LngLat = [number, number];

export interface MapStop {
  id: string;
  name: string;
  en?: string;
}
export interface MapResult {
  land: string;
  route: string;
  stops: Array<{ id: string; name: string; en?: string; x: number; y: number; /** 沿路线走了多远（0–1），进场动画按它排先后 */ t: number; label: { x: number; y: number; anchor: 'start' | 'end' } }>;
  scale: { px: number; label: string };
  parallels: Array<{ d: string; label: string; y: number }>;
}

const topoCache = new Map<string, Topology>();
async function landTopology(res: '10m' | '50m' | '110m') {
  if (!topoCache.has(res)) {
    const mod = res === '10m' ? await import('world-atlas/land-10m.json') : res === '50m' ? await import('world-atlas/land-50m.json') : await import('world-atlas/land-110m.json');
    topoCache.set(res, (mod.default ?? mod) as unknown as Topology);
  }
  return topoCache.get(res)!;
}

/**
 * d3 在 clipExtent 下，遇到覆盖整个画面的环会补一个和裁剪框一样大的矩形子路径，把海面也填成了陆地。
 * 陆地路径里凡是和裁剪框重合的矩形子路径都去掉。
 */
function withoutClipRect(d: string) {
  const rect = `M-60,-60L${W + 60},-60L${W + 60},${H + 60}L-60,${H + 60}Z`;
  return d.split(/(?=M)/).filter((sub) => sub !== rect).join('');
}

const PARALLELS = (): Array<[number, string]> => [
  [66.5626, t('map.arctic')], [23.4366, t('map.tropicN')], [0, t('map.equator')], [-23.4366, t('map.tropicS')], [-66.5626, t('map.antarctic')],
];
const NICE_KM = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];

/**
 * @param stops    要显示的站点（route 范围是全部站点，stop 范围只有一个）
 * @param track    可选的轨迹点；不给就按站点顺序连线
 * @param minSpan  取景范围的最小度数（只有一个站点、或站点挤在一起时，不能无限放大）
 */
async function compute(stops: Array<MapStop & { lnglat: LngLat }>, track: LngLat[] | undefined, { minSpan = 3, padX = 80, padY = 80 } = {}): Promise<MapResult> {
  const pts: LngLat[] = [...stops.map((s) => s.lnglat), ...(track ?? [])];
  let [w, e, s, n] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  // 至少有 minSpan 度宽，高度按画面比例；范围太小就以中心为准往外撑
  const need = (span: number, min: number) => Math.max(min, span);
  const cx = (w + e) / 2, cy = (s + n) / 2;
  const spanX = need(e - w, minSpan), spanY = need(n - s, minSpan * (H / W));
  [w, e, s, n] = [cx - spanX / 2, cx + spanX / 2, cy - spanY / 2, cy + spanY / 2];

  // 纬线离画面很近（比如冰岛之于北极圈）就把它纳进取景，画面里才有这条参照线
  if (Math.max(spanX, spanY) <= 25) {
    const reach = Math.max(1, spanY * 0.4);
    for (const [lat] of PARALLELS()) {
      if (lat > n && lat - n <= reach) n = lat + 0.1;
      else if (lat < s && s - lat <= reach) s = lat - 0.1;
    }
  }

  const span = Math.max(spanX, spanY);
  const midLat = (s + n) / 2;
  // 世界尺度用 Natural Earth；中高纬度的区域用兰勃特等角圆锥（纬线是弧线，像地图集里那样）；低纬度用墨卡托
  const projection = span > 60 || spanY > 45
    ? geoNaturalEarth1()
    : Math.abs(midLat) >= 20 && Math.abs(midLat) <= 75
      ? geoConicConformal().rotate([-(w + e) / 2, 0]).center([0, midLat]).parallels([s + (n - s) / 6, n - (n - s) / 6])
      : geoMercator();
  // 用画面四边（沿纬线 / 经线加密）拟合，圆锥投影下边是弧线，只用四个角会取景不准
  const ring: LngLat[] = [];
  const seg = (a: LngLat, b: LngLat) => { for (let i = 0; i < 24; i++) ring.push([a[0] + ((b[0] - a[0]) * i) / 24, a[1] + ((b[1] - a[1]) * i) / 24]); };
  // d3 的球面多边形外环要顺时针，写反了会被当成“除这块以外的整个地球”
  seg([w, s], [w, n]); seg([w, n], [e, n]); seg([e, n], [e, s]); seg([e, s], [w, s]);
  projection.fitExtent([[padX, padY], [W - padX, H - padY]], { type: 'Polygon', coordinates: [[...ring, ring[0]]] } as any);
  projection.clipExtent([[-60, -60], [W + 60, H + 60]]);

  const res = span <= 12 ? '10m' : span <= 70 ? '50m' : '110m';
  const topo = await landTopology(res);
  const land = feature(topo, topo.objects.land as any);
  const path = geoPath(projection).digits(1);

  const xy = (p: LngLat) => projection(p)!;
  const routePts = (track && track.length > 1 ? track : stops.map((x) => x.lnglat)).map(xy);
  const routeD = routePts.length > 1 ? line().curve(curveCatmullRom.alpha(0.5))(routePts)! : '';

  // 站点沿路线的位置：按折线累计长度
  const stopXY = stops.map((st) => xy(st.lnglat));
  const cum = [0];
  for (let i = 1; i < routePts.length; i++) cum.push(cum[i - 1] + Math.hypot(routePts[i][0] - routePts[i - 1][0], routePts[i][1] - routePts[i - 1][1]));
  const total = cum[cum.length - 1] || 1;
  const along = (p: [number, number]) => {
    let best = Infinity, at = 0;
    routePts.forEach((q, i) => { const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2; if (d < best) { best = d; at = cum[i]; } });
    return at / total;
  };

  // 标签避让：候选位置依次试，选和已放的标签、站点圆点重叠最少的
  const boxes: Array<[number, number, number, number]> = stopXY.map(([x, y]) => [x - 10, y - 10, x + 10, y + 10]);
  const overlap = (a: number[], b: number[]) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  // 路线本身也要避开：沿折线每隔几个像素取一个点，标签框里的点越多，惩罚越大
  const routeSamples: Array<[number, number]> = [];
  for (let i = 1; i < routePts.length; i++) {
    const [ax, ay] = routePts[i - 1], [bx, by] = routePts[i], steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 6));
    for (let k = 0; k <= steps; k++) routeSamples.push([ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps]);
  }
  const onRoute = (box: number[]) => routeSamples.reduce((n, [x, y]) => n + (x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3] ? 1 : 0), 0);
  const CAND: Array<[number, number, 'start' | 'end']> = [[16, 30, 'start'], [16, -14, 'start'], [-16, 30, 'end'], [-16, -14, 'end'], [-16, 6, 'end'], [16, 6, 'start'], [-4, -42, 'end'], [4, 52, 'start']];
  const placed = stops.map((st, i) => {
    const [px, py] = stopXY[i];
    const wd = Math.max(st.name.length * 22, (st.en?.length ?? 0) * 9.5) + 6;
    let best = CAND[0], bs = Infinity;
    for (const c of CAND) {
      const x = px + c[0], y = py + c[1];
      const box = c[2] === 'start' ? [x, y - 22, x + wd, y + 24] : [x - wd, y - 22, x, y + 24];
      let score = boxes.reduce((sum, b) => sum + overlap(box, b), 0) + onRoute(box) * 60;
      if (box[0] < 8 || box[2] > W - 8 || box[1] < 40 || box[3] > H - 40) score += 1e5; // 别出画面，也别压到底部比例尺 / 顶部纬线文字
      if (score < bs) { bs = score; best = c; }
    }
    const x = px + best[0], y = py + best[1];
    boxes.push(best[2] === 'start' ? [x, y - 22, x + wd, y + 24] : [x - wd, y - 22, x, y + 24]);
    return { x, y, anchor: best[2] };
  });

  // 比例尺：画面中心 1px 对应多少公里
  const [mx, my] = [W / 2, H / 2];
  const a = projection.invert!([mx, my])!, b = projection.invert!([mx + 1, my])!;
  const kmPerPx = geoDistance(a, b) * 6371;
  const nice = [...NICE_KM].reverse().find((k) => k / kmPerPx <= 200 && k / kmPerPx >= 50) ?? NICE_KM[0];

  // 纬线（只画在画面里的）：沿纬线取样，标签放在靠右边缘处，圆锥投影下纬线是弧线，各处 y 不同
  const parallels: MapResult['parallels'] = [];
  for (const [lat, label] of PARALLELS()) {
    const samples = Array.from({ length: 121 }, (_, i) => xy([cx - 90 + (i * 180) / 120, lat] as LngLat));
    const right = samples.filter(([x]) => x >= 0 && x <= W).reduce<[number, number] | null>((b, q) => (!b || Math.abs(q[0] - (W - 15)) < Math.abs(b[0] - (W - 15)) ? q : b), null);
    if (!right || !(right[1] > 30 && right[1] < H - 30)) continue;
    const coordinates: LngLat[] = Array.from({ length: 181 }, (_, i) => [-180 + i * 2, lat] as LngLat);
    parallels.push({ d: path({ type: 'LineString', coordinates })!, label, y: right[1] });
  }

  return {
    land: withoutClipRect(path(land as any) ?? ''),
    route: routeD,
    stops: stops.map((st, i) => ({ id: st.id, name: st.name, en: st.en, x: +stopXY[i][0].toFixed(1), y: +stopXY[i][1].toFixed(1), t: +along(stopXY[i]).toFixed(4), label: { x: +placed[i].x.toFixed(1), y: +placed[i].y.toFixed(1), anchor: placed[i].anchor } })),
    scale: { px: +(nice / kmPerPx).toFixed(1), label: `${nice} KM` },
    parallels,
  };
}

/** 同一篇里封面、地图块、角落小地图用同样的参数，几何只算一次 */
const memo = new Map<string, Promise<MapResult>>();
export function buildMap(stops: Array<MapStop & { lnglat: LngLat }>, track?: LngLat[], opts?: { minSpan?: number; padX?: number; padY?: number }) {
  const key = JSON.stringify([stops.map((x) => [x.id, x.lnglat]), track, opts]);
  if (!memo.has(key)) memo.set(key, compute(stops, track, opts));
  return memo.get(key)!;
}
