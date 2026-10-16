/**
 * 地图（pages/map.astro 和游记里点开的悬浮地图）的数据，构建时收齐。分三层：
 * photos 全站文章里带定位的照片（EXIF 见 exif.ts）；places 开了地图的文章正文里标的地点；routes 这些文章的路线，一段一条，带交通方式。
 * 游记里的悬浮地图只要这一篇的：postAtlas。
 */
import { getImage } from 'astro:assets';
import { getEntries, type Entry } from './entries.ts';
import { remoteOf } from './cdn.ts';
import { liveOf } from './live.ts';
import { exifOf, type Exif } from './exif.ts';
import { flowOf, type Flow, type Transport } from './flow.ts';

export type LngLat = [number, number];

export interface AtlasPhoto {
  /** [经度, 纬度] */
  at: LngLat;
  /** 地图上的缩略图（约 240px 宽） */
  thumb: string;
  /** 卡片和灯箱用的图：默认地址、srcset、原图尺寸 */
  src: string;
  srcset: string;
  w: number;
  h: number;
  alt: string;
  caption?: string;
  /** 灯箱信息栏用的（同 img 的 data-exif） */
  exif: Exif;
  live?: { video: string; time?: number };
  /** 出自哪篇 */
  entry: { title: string; href: string };
}

/** 正文里标的一个地点：名字、位置、是那篇的第几个地点（正文里是 #place-<n>）、出自哪篇 */
export interface AtlasPlace { at: LngLat; name: string; n: number; date?: string; entry: { title: string; href: string } }
/** 路线的一段：从上一处到第 to 个地点，by 是交通方式（none 的不收） */
export interface AtlasRoute { line: LngLat[]; to: number; by?: Transport; entry: { title: string; href: string } }

export interface Atlas { photos: AtlasPhoto[]; places: AtlasPlace[]; routes: AtlasRoute[] }

interface Pic { src: unknown; alt?: string; caption?: string }

/** 一篇文章里所有的图（块、图组、自由排布里的图，加上封面），按出现的顺序 */
function picturesOf(data: unknown): Pic[] {
  const out: Pic[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    if (o.src && typeof o.src === 'object' && (o.src as { fsPath?: string }).fsPath) out.push(o as unknown as Pic);
    for (const [k, v] of Object.entries(o)) if (k !== 'src') walk(v);
  };
  const d = data as { cover?: unknown; blocks?: unknown; title?: string };
  if (d.cover) out.push({ src: d.cover, alt: d.title });
  walk(d.blocks);
  return out;
}

async function sizes(src: unknown) {
  const remote = remoteOf(src);
  if (remote) return { thumb: remote.url(480), src: remote.url(960), srcset: remote.srcset, w: remote.width, h: remote.height };
  const meta = src as { width: number; height: number };
  const [thumb, ...set] = await Promise.all([240, 480, 960, 1600].map((width) => getImage({ src: src as never, width, format: 'webp' })));
  return {
    thumb: thumb.src,
    src: set[1].src,
    srcset: set.map((im, i) => `${im.src} ${[480, 960, 1600][i]}w`).join(', '),
    w: meta.width,
    h: meta.height,
  };
}

/** 一篇文章里带定位的照片；seen 是已经收过的图（同一张图被几篇引用时只算一次） */
async function photosOf(e: Entry, seen = new Set<string>()): Promise<AtlasPhoto[]> {
  const out: AtlasPhoto[] = [];
  for (const pic of picturesOf(e.data)) {
    const file = (pic.src as { fsPath: string }).fsPath;
    if (seen.has(file)) continue;
    const exif = await exifOf(pic.src);
    if (!exif?.gps) continue;
    seen.add(file);
    out.push({
      at: exif.gps,
      ...(await sizes(pic.src)),
      alt: pic.alt ?? '',
      caption: pic.caption,
      exif,
      live: liveOf(pic.src),
      entry: { title: e.data.title, href: e.href },
    });
  }
  return out;
}

/** 一篇开了地图的文章的地点和路线（交通方式是 none 的那段不画） */
function trailOf(e: Entry, f: Flow): Pick<Atlas, 'places' | 'routes'> {
  const entry = { title: e.data.title, href: e.href };
  return {
    places: f.places.map((p) => ({ at: p.lnglat, name: p.name, n: p.n, ...(p.date ? { date: p.date } : {}), entry })),
    routes: f.trip.legs.filter((l) => l.by !== 'none').map((l) => ({ line: l.line, to: l.to, ...(l.by ? { by: l.by } : {}), entry })),
  };
}

let memo: Promise<Atlas> | undefined;
export function getAtlas(): Promise<Atlas> {
  return (memo ??= (async () => {
    const photos: AtlasPhoto[] = [], places: AtlasPlace[] = [], routes: AtlasRoute[] = [];
    const seen = new Set<string>();
    // 旧的在前：同一张图被几篇引用时，算在最早那篇
    for (const e of (await getEntries()).reverse()) {
      photos.push(...(await photosOf(e, seen)));
      if (!e.data.map) continue;
      const t = trailOf(e, flowOf(e.data));
      places.push(...t.places);
      routes.push(...t.routes);
    }
    return { photos, places, routes };
  })());
}

/** 一篇文章自己的地图数据（游记里的悬浮地图；隐藏的文章也有） */
export async function postAtlas(e: Entry, f: Flow): Promise<Atlas> {
  return { photos: await photosOf(e), ...trailOf(e, f) };
}
