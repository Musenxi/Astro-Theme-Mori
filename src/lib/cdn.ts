/**
 * 图床清单 src/assets/cdn.json（Studio 同步图床时写的）：图片在 src/assets 下的路径 → 外链和几种宽度。
 * 构建时，有记录的图直接用图床外链，不再由 Astro 压缩，也不放进构建产物；没有记录的照旧用本地的图。开发预览里全用本地的图。
 * 只用 ImageMetadata 上不可枚举的 fsPath 找路径：碰别的属性 Astro 会把原图复制进构建产物。
 */
interface Rec { width: number; height: number; src: string; widths: number[]; live?: string; time?: number }
interface Manifest { base: string; images: Record<string, Rec>; videos?: Record<string, { sha: string; src: string }> }

const files = import.meta.glob<Manifest>('/src/assets/cdn.json', { eager: true, import: 'default' });
const manifest: Manifest | undefined = files['/src/assets/cdn.json'];

/** 图片在 src/assets 下的路径（不是本地图片就是 undefined） */
export function assetPathOf(src: unknown) {
  const fsPath = (src as { fsPath?: string } | null | undefined)?.fsPath;
  const at = fsPath?.lastIndexOf('/src/assets/') ?? -1;
  return fsPath && at >= 0 ? fsPath.slice(at + '/src/assets/'.length) : undefined;
}

export interface Remote {
  width: number;
  height: number;
  /** 某个宽度的外链（不给就是最大的那张） */
  url: (w?: number) => string;
  srcset: string;
  live?: string;
  time?: number;
}

/**
 * 开发预览（astro dev，Studio 里的预览也是它）一律用本地的图：图床常设了防盗链，本机地址取不到；预览也不该花图床的流量。
 * 只有构建出来的站点用图床
 */
const useCdn = !import.meta.env.DEV;

export function remoteOf(src: unknown): Remote | undefined {
  if (!useCdn) return undefined;
  const path = assetPathOf(src);
  const r = path && manifest?.images[path];
  if (!r) return undefined;
  const abs = (key: string) => `${manifest!.base}/${key}`;
  const url = (w?: number) => {
    if (!r.widths.length) return abs(r.src);
    const pick = w ? r.widths.find((x) => x >= w) ?? r.widths.at(-1)! : r.widths.at(-1)!;
    return abs(r.src.replace('{w}', String(pick)));
  };
  return {
    width: r.width,
    height: r.height,
    url,
    srcset: r.widths.map((w) => `${abs(r.src.replace('{w}', String(w)))} ${w}w`).join(', '),
    live: r.live && abs(r.live),
    time: r.time,
  };
}

/** 内容里视频的写法（../../assets/<路径>）→ 在 src/assets 下的路径；外链返回 undefined */
export const videoPathOf = (src: string) => { const at = src.indexOf('assets/'); return /^[a-z]+:/i.test(src) || at < 0 ? undefined : src.slice(at + 'assets/'.length); };

/** 视频的地址：构建时传到图床的用外链；其余（和开发预览里的全部）由 pages/live/[...path].ts 提供；本来就是外链的原样 */
export function videoUrl(src: string) {
  const path = videoPathOf(src);
  if (!path) return src;
  const r = useCdn ? manifest?.videos?.[path] : undefined;
  return r ? `${manifest!.base}/${r.src}` : `${import.meta.env.BASE_URL.replace(/\/$/, '')}/live/${path}`;
}
/** 这个视频（在 src/assets 下的路径）构建时用图床 */
export const videoOnCdn = (path: string) => useCdn && !!manifest?.videos?.[path];
