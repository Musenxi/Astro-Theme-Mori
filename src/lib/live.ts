/**
 * 实况照片：src/assets 里和图片同名的 .mp4（Studio 导入 iPhone 的 HEIC + MOV 时转出来的）。
 * 视频地址：构建时上传到图床的用图床外链（见 cdn.ts）；没上传的（和开发预览里的全部）由 pages/live/[...path].ts 提供，地址是 /live/<路径>.mp4。
 * 时间点是 Studio 转码时写在 mp4 注释里的（mori-photo-time=1.4667）；没有就交给播放器自己估。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assetPathOf, remoteOf } from './cdn.ts';

const ASSETS = join(process.cwd(), 'src/assets');
const times = new Map<string, number | undefined>();

function photoTime(file: string) {
  if (!times.has(file)) {
    let t: number | undefined;
    try {
      const m = /mori-photo-time=([\d.]+)/.exec(readFileSync(file).toString('latin1'));
      if (m) t = +m[1];
    } catch { /* 读不到就不写 */ }
    times.set(file, t);
  }
  return times.get(file);
}

const videoOf = (path: string) => path.replace(/\.[^./]+$/, '.mp4');

export function liveOf(src: unknown): { video: string; time?: number } | undefined {
  const remote = remoteOf(src);
  if (remote?.live) return { video: remote.live, time: remote.time };
  const path = assetPathOf(src);
  if (!path) return undefined;
  const file = join(ASSETS, videoOf(path));
  if (!existsSync(file)) return undefined;
  return { video: `${import.meta.env.BASE_URL.replace(/\/$/, '')}/live/${videoOf(path)}`, time: photoTime(file) };
}

/** 要由站点自己提供的视频：本地有、还没上传到图床的（路径相对 src/assets） */
export function localVideos() {
  const out: string[] = [];
  const walk = (dir: string, pre: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) walk(join(dir, e.name), `${pre}${e.name}/`);
      else if (e.name.endsWith('.mp4')) out.push(pre + e.name);
    }
  };
  if (existsSync(ASSETS)) walk(ASSETS, '');
  return out.filter((v) => !remoteOfAny(v));
}

/** 这个视频对应的图片（任意扩展名）已经把视频传到图床了 */
const remoteOfAny = (video: string) => ['.jpg', '.jpeg', '.png', '.webp', '.avif'].some((ext) => remoteOf({ fsPath: `/src/assets/${video.replace(/\.mp4$/, ext)}` })?.live);
