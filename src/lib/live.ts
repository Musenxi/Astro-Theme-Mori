/**
 * 实况照片：src/assets 里和图片同名的 .mp4（Studio 导入 iPhone 的 HEIC + MOV 时转出来的）。
 * 按图片的源文件路径（ImageMetadata 上不可枚举的 fsPath）找到它，返回视频的网址和静态照片在视频里的时间点。
 * 时间点是 Studio 转码时写在 mp4 注释里的（mori-photo-time=1.4667）；没有就交给播放器自己估。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const videos = import.meta.glob<string>('/src/assets/**/*.mp4', { query: '?url', import: 'default', eager: true });
const byStem = new Map(Object.entries(videos).map(([path, url]) => [path.slice(0, -'.mp4'.length), { path, url }]));
const times = new Map<string, number | undefined>();

function photoTime(path: string) {
  if (!times.has(path)) {
    let t: number | undefined;
    try {
      const m = /mori-photo-time=([\d.]+)/.exec(readFileSync(join(process.cwd(), path)).toString('latin1'));
      if (m) t = +m[1];
    } catch { /* 读不到就不写 */ }
    times.set(path, t);
  }
  return times.get(path);
}

export function liveOf(src: unknown): { video: string; time?: number } | undefined {
  const fsPath = (src as { fsPath?: string } | null | undefined)?.fsPath;
  const at = fsPath?.lastIndexOf('/src/assets/') ?? -1;
  if (!fsPath || at < 0) return undefined;
  const hit = byStem.get(fsPath.slice(at).replace(/\.[^./]+$/, ''));
  return hit && { video: hit.url, time: photoTime(hit.path) };
}
