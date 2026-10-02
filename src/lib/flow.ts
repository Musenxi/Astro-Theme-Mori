/**
 * 长卷版式（横滚、地图）要用的数据：把文章的块排成“列”，并算出每一列读到哪个地点。
 * 纯逻辑在 flow.mjs（Studio 也用），这里只加类型和站点渲染需要的几个字段。
 */
import type { PostData, PostBlock } from '../schema/schema.ts';
import { columns, placesOf, placeName } from './flow.mjs';

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
}

export type FlowColumn =
  | { kind: 'text'; blocks: PostBlock[]; writing: 'h' | 'v'; y?: number; scale?: number; anchor?: boolean; place: number; places: number[] }
  | { kind: 'block'; block: PostBlock; place: number; places: number[] };

export interface Flow {
  places: FlowPlace[];
  columns: FlowColumn[];
  reading: { default: Reading; allowed: Reading[]; direction: 'ltr' | 'rtl' };
}

export function flowOf(d: Pick<PostData, 'blocks' | 'reading'>): Flow {
  const places: FlowPlace[] = placesOf(d.blocks).map((p: any) => ({ n: p.n, id: `p${p.n + 1}`, name: placeName(p), en: p.en && p.en !== placeName(p) ? p.en : undefined, lnglat: p.lnglat, date: p.date, block: p.block }));
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
  return { places, columns: cols, reading: { default: allowed.includes(def) ? def : allowed[0], allowed, direction: r?.direction ?? 'ltr' } };
}
