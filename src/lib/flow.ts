/**
 * 长卷版式（横滚、地图）要用的数据：把文章的块排成“列”，并算出每一列读到哪个地点。
 * 纯逻辑在 flow.mjs（Studio 也用），这里只加类型和站点渲染需要的几个字段。
 */
import type { PostData, PostBlock } from '../schema/schema.ts';
import { columns, placesOf, placeName, regionsOf, tripOf } from './flow.mjs';

export type Reading = 'v' | 'h' | 'mix';

export interface FlowPlace {
  /** 第几个地点（从 0 起），正文里对应的标记是 #place-<n> */
  n: number;
  /** 地图用的编号 */
  id: string;
  name: string;
  en?: string;
  lnglat: [number, number];
  date?: string;
  /** 所在的块 id */
  block: string;
  /** 所属的区域（第几个，从 0 起） */
  region: number;
}

/** 地图的一个区域：挨在一起的几个地点 */
export interface FlowRegion { k: number; places: number[]; /** 区域里的路线（整趟路线里对应的一段） */ line: Array<[number, number]> }

export type FlowColumn =
  | { kind: 'text'; blocks: PostBlock[]; writing: 'h' | 'v'; y?: number; scale?: number; anchor?: boolean; place: number; places: number[] }
  | { kind: 'block'; block: PostBlock; place: number; places: number[] };

export interface Flow {
  places: FlowPlace[];
  regions: FlowRegion[];
  /** 整趟路线（经纬度折线），at[地点序号] = 这个地点是折线的第几个点 */
  trip: { line: Array<[number, number]>; at: number[] };
  columns: FlowColumn[];
  reading: { default: Reading; allowed: Reading[]; direction: 'ltr' | 'rtl' };
}

export function flowOf(d: Pick<PostData, 'blocks' | 'reading'> & { track?: PostData['track'] }): Flow {
  const raw = placesOf(d.blocks) as any[];
  const rg = regionsOf(raw);
  const places: FlowPlace[] = raw.map((p: any) => ({ n: p.n, id: `p${p.n + 1}`, name: placeName(p), en: p.en && p.en !== placeName(p) ? p.en : undefined, lnglat: p.lnglat, date: p.date, block: p.block, region: rg.regionOf[p.n] }));
  let cur = -1;
  const cols: FlowColumn[] = (columns(d.blocks) as any[]).map((c) => {
    const ids = new Set<string>((c.kind === 'text' ? c.blocks : [c.block]).map((b: PostBlock) => b.id));
    const inside = places.filter((p) => ids.has(p.block)).map((p) => p.n);
    // 一列读到哪个地点：列里出现的第一个地点；没有就沿用上一列的
    if (inside.length) cur = inside[0];
    return { ...c, place: cur, places: inside } as FlowColumn;
  });
  const r = d.reading;
  const allowed = (r?.allowed?.length ? r.allowed : ['v']) as Reading[];
  const def = (r?.default ?? 'v') as Reading;
  const trip = tripOf(raw, rg.regionOf, d.track);
  const regions = rg.regions.map((g: { k: number; places: number[] }) => ({ ...g, line: trip.line.slice(trip.at[g.places[0]], trip.at[g.places.at(-1)!] + 1) }));
  return { places, regions, trip, columns: cols, reading: { default: allowed.includes(def) ? def : allowed[0], allowed, direction: r?.direction ?? 'ltr' } };
}
