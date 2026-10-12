/**
 * 地图页（pages/map.astro）的数据：构建时把全站文章里带定位的照片收齐（EXIF 见 exif.ts）。
 * 分三层，地图页按层画：photos 照片（现在有）、places 地点、routes 路线（留给游记：游记的地点、路线以后从 flow 接进来，
 * 页面那边已经会画这两层，接上数据就行）。
 */
import { getImage } from 'astro:assets';
import { getEntries } from './entries.ts';
import { remoteOf } from './cdn.ts';
import { liveOf } from './live.ts';
import { exifOf, type Exif } from './exif.ts';

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

/** 游记的一站：名字、位置、出自哪篇（以后接） */
export interface AtlasPlace { at: LngLat; name: string; entry: { title: string; href: string } }
/** 游记的一条路线（以后接） */
export interface AtlasRoute { line: LngLat[]; entry: { title: string; href: string } }

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

let memo: Promise<Atlas> | undefined;
export function getAtlas(): Promise<Atlas> {
  return (memo ??= (async () => {
    const photos: AtlasPhoto[] = [];
    const seen = new Set<string>();
    // 旧的在前：同一张图被几篇引用时，算在最早那篇
    for (const e of (await getEntries()).reverse()) {
      for (const pic of picturesOf(e.data)) {
        const file = (pic.src as { fsPath: string }).fsPath;
        if (seen.has(file)) continue;
        const exif = await exifOf(pic.src);
        if (!exif?.gps) continue;
        seen.add(file);
        photos.push({
          at: exif.gps,
          ...(await sizes(pic.src)),
          alt: pic.alt ?? '',
          caption: pic.caption,
          exif,
          live: liveOf(pic.src),
          entry: { title: e.data.title, href: e.href },
        });
      }
    }
    return { photos, places: [], routes: [] };
  })());
}
