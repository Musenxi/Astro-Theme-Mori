/**
 * 走路、骑车、开车的路线按真实道路画：构建时去 OSRM（routing.openstreetmap.de，OpenStreetMap 数据，不要 key）查两处之间的路。
 * 查到的存进 node_modules/.cache/mori/routes.json，坐标和交通方式不变就一直用；查不到（离线、限流、两处之间没有路）
 * 就不给，路线退回直线（flow.mjs 的 tripOf），一天后再试。不让构建失败。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { PostData } from '../schema/schema.ts';
import { distanceKm, legKey, placesOf, ROAD_TRANSPORTS } from './flow.mjs';

type LngLat = [number, number];
const FILE = join(process.cwd(), 'node_modules/.cache/mori/routes.json');
const RETRY = 24 * 3600 * 1000;
/** 两处隔得比这还远就不查了（多半是写错了交通方式，查起来也慢） */
const MAX_KM = 1500;
const PROFILE: Record<string, string> = { walk: 'foot', bike: 'bike', car: 'car' };

let cache: Record<string, { at: number; line?: LngLat[] }> | null = null;
const load = () => {
  if (cache) return cache;
  try { cache = JSON.parse(readFileSync(FILE, 'utf8')); } catch { cache = {}; }
  return cache!;
};
const save = () => { try { mkdirSync(dirname(FILE), { recursive: true }); writeFileSync(FILE, JSON.stringify(cache)); } catch { /* 只是缓存 */ } };

/** 折线化简（Douglas–Peucker，容差按度，约 15 米）：OSRM 给的点很密，地图上用不着 */
function simplify(pts: LngLat[], tol = 0.00015): LngLat[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const [ax, ay] = pts[i], [bx, by] = pts[j], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-12;
    let far = -1, at = 0;
    for (let k = i + 1; k < j; k++) {
      const d = Math.abs(dy * (pts[k][0] - ax) - dx * (pts[k][1] - ay)) / len;
      if (d > far) { far = d; at = k; }
    }
    if (far > tol) { keep[at] = 1; stack.push([i, at], [at, j]); }
  }
  return pts.filter((_, k) => keep[k]).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);
}

async function query(by: string, a: LngLat, b: LngLat): Promise<LngLat[] | undefined> {
  const url = `https://routing.openstreetmap.de/routed-${PROFILE[by]}/route/v1/driving/${a.join(',')};${b.join(',')}?overview=full&geometries=geojson`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mori (blog build)' }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`${r.status}`);
  const d = await r.json();
  const line = d?.routes?.[0]?.geometry?.coordinates as LngLat[] | undefined;
  return line && line.length > 1 ? simplify(line) : undefined;
}

const pending = new Map<string, Promise<void>>();

/** 一篇文章里走路、骑车、开车那几段的道路路线：legKey → 折线（查不到的不在里面）。给 flowOf 用 */
export async function routedOf(d: Pick<PostData, 'blocks'>): Promise<Record<string, LngLat[]>> {
  const places = placesOf(d.blocks) as Array<{ lnglat: LngLat; by?: string }>;
  const c = load(), out: Record<string, LngLat[]> = {};
  let dirty = false;
  // 一段一段按顺序查（公共服务，别并发）；同一段别的页面正在查就等它
  for (let i = 1; i < places.length; i++) {
    const { by, lnglat: b } = places[i], a = places[i - 1].lnglat;
    if (!by || !ROAD_TRANSPORTS.includes(by) || distanceKm(a, b) > MAX_KM) continue;
    const key = legKey(by, a, b);
    const hit = c[key];
    if (!hit || (!hit.line && Date.now() - hit.at > RETRY)) {
      if (!pending.has(key)) {
        pending.set(key, query(by, a, b).then((line) => { c[key] = { at: Date.now(), ...(line ? { line } : {}) }; }, () => { c[key] = { at: Date.now() }; }));
      }
      await pending.get(key);
      dirty = true;
    }
    if (c[key]?.line) out[key] = c[key].line!;
  }
  if (dirty) save();
  return out;
}
