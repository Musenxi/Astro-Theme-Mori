/**
 * 照片的拍摄信息（看大图时的信息栏）：构建时从原图的 EXIF 里读，写在 img 的 data-exif 上，排版和翻译交给 scripts/lightbox.ts。
 * 有定位的带上经纬度和海拔（位置图由 scripts/lightbox.ts 用街道底图瓦片拼）。另外算红绿蓝三个通道的直方图。
 * 只读 ImageMetadata 上不可枚举的 fsPath（同 cdn.ts）：上传到图床的图，本地原图还在，照样能读。
 */
import { createHash } from 'node:crypto';
import { openSync, readSync, closeSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import exifReader from 'exif-reader';
import { assetPathOf } from './cdn.ts';

export interface Exif {
  camera?: string;
  lens?: string;
  /** 焦距（mm）；有 35mm 等效焦距时 focal35 是等效的 */
  focal?: number;
  focal35?: number;
  aperture?: number;
  /** 快门：1/146、2.5 */
  shutter?: string;
  iso?: number;
  /** 曝光补偿（EV） */
  ev?: number;
  /** 曝光程序、测光模式、白平衡：EXIF 里的编号 */
  program?: number;
  metering?: number;
  wb?: number;
  flash?: boolean;
  /** 拍摄时间（相机的当地时间）：2026/09/26 21:07；tz 是时区 +08:00 */
  time?: string;
  tz?: string;
  /** 原图像素尺寸 */
  size?: [number, number];
  /** 直方图：红、绿、蓝三个通道各 128 格，0–99（三个通道按同一个最高值缩放，两端那一格超出时截断） */
  hist?: [number[], number[], number[]];
  /** 拍摄地点 [经度, 纬度]、海拔（米） */
  gps?: [number, number];
  alt?: number;
}

const cache = new Map<string, Promise<Exif | undefined>>();

/**
 * 持久缓存 src/assets/exif.json（随项目提交，同 cdn.json）：原图路径 → { h: 内容的 sha256, v: 结果 }。
 * 构建机每次都是新克隆的仓库，直方图要把原图全分辨率解码一遍，很慢；哈希对得上就直接用，对不上（图换了）才重算。
 * 原图不在本机时用缓存里的结果。读写失败都不报错，只是少了缓存。
 */
interface Rec { h: string; v: Exif | null }
const STORE = join(process.cwd(), 'src/assets/exif.json');
let store: Record<string, Rec> | undefined;
let dirty = false, timer: ReturnType<typeof setTimeout> | undefined;

function records() {
  if (!store) {
    try { store = JSON.parse(readFileSync(STORE, 'utf8')); } catch { store = {}; }
    if (!store || typeof store !== 'object' || Array.isArray(store)) store = {};
  }
  return store;
}

function flush() {
  timer = undefined;
  if (!dirty || !store) return;
  dirty = false;
  try {
    const sorted = Object.fromEntries(Object.entries(store).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    mkdirSync(dirname(STORE), { recursive: true });
    writeFileSync(STORE, JSON.stringify(sorted, null, 1) + '\n');
  } catch { /* 只是缓存 */ }
}

function remember(key: string, rec: Rec) {
  records()[key] = rec;
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(flush, 300);
  timer.unref?.();
}
process.once('beforeExit', flush);

const hashOf = (file: string) => { try { return createHash('sha256').update(readFileSync(file)).digest('hex'); } catch { return undefined; } };

/** JPEG 开头那一段：APP1（Exif\0\0 打头）和 SOF 里的尺寸。只读前 256KB，这些都在最前面 */
function head(file: string): { app1?: Buffer; size?: [number, number] } {
  const fd = openSync(file, 'r');
  const buf = Buffer.alloc(256 * 1024);
  const n = readSync(fd, buf, 0, buf.length, 0);
  closeSync(fd);
  const out: { app1?: Buffer; size?: [number, number] } = {};
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return out;
  for (let i = 2; i + 4 <= n && buf[i] === 0xff;) {
    const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (marker === 0xda) break; // 图像数据开始了
    if (marker === 0xe1 && !out.app1 && buf.toString('latin1', i + 4, i + 10) === 'Exif\0\0') out.app1 = buf.subarray(i + 4, Math.min(n, i + 2 + len));
    // SOF0–SOF15（C4 DHT、C8、CC DAC 除外）：高、宽
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc && i + 9 <= n) out.size = [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return out;
}

const clean = (s: unknown) => (typeof s === 'string' ? s.replace(/\0/g, '').trim() : '');
const num = (x: unknown) => (typeof x === 'number' && isFinite(x) ? x : Array.isArray(x) && typeof x[0] === 'number' ? x[0] : undefined);
const round = (x: number, d = 1) => +x.toFixed(d);
const pad = (n: number) => String(n).padStart(2, '0');
/** EXIF 里的度分秒 + 参考方向 → 十进制度 */
const dms = (v: unknown, ref: unknown) => (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number') ? (v[0] + v[1] / 60 + v[2] / 3600) * (ref === 'S' || ref === 'W' ? -1 : 1) : undefined);

function format(e: ReturnType<typeof exifReader>, size?: [number, number]): Exif {
  const img = e.Image ?? {}, p = e.Photo ?? {};
  const make = clean(img.Make).replace(/\s+(corporation|corp\.?|co\.,?\s*ltd\.?|imaging)$/i, '');
  const model = clean(img.Model);
  const camera = !model ? make : make && !model.toLowerCase().includes(make.split(/\s/)[0].toLowerCase()) ? `${make} ${model}` : model;
  let lens = clean(p.LensModel);
  // 手机的镜头名是“iPhone 16 Pro back triple camera 2.22mm f/2.2”，和相机、焦距重复，不写
  if (lens && model && lens.toLowerCase().startsWith(model.toLowerCase())) lens = '';

  const out: Exif = {};
  if (camera) out.camera = camera;
  if (lens) out.lens = lens;
  const f = num(p.FocalLength), f35 = num(p.FocalLengthIn35mmFilm);
  if (f && f > 0) out.focal = round(f);
  if (f35 && f35 > 0) out.focal35 = f35;
  const fn = num(p.FNumber);
  if (fn && fn > 0) out.aperture = round(fn);
  const t = num(p.ExposureTime);
  if (t && t > 0) out.shutter = t < 1 ? `1/${Math.round(1 / t)}` : String(round(t));
  const iso = num(p.ISOSpeedRatings) ?? num(p.PhotographicSensitivity);
  if (iso && iso > 0) out.iso = iso;
  const ev = num(p.ExposureBiasValue);
  if (ev !== undefined) out.ev = round(ev);
  const prog = num(p.ExposureProgram), meter = num(p.MeteringMode), wb = num(p.WhiteBalance), flash = num(p.Flash);
  if (prog) out.program = prog;
  if (meter) out.metering = meter;
  if (wb !== undefined) out.wb = wb;
  if (flash !== undefined) out.flash = (flash & 1) === 1;

  // exif-reader 把没有时区的当地时间当成 UTC 解析，所以用 getUTC* 取回原来的数字
  const d = p.DateTimeOriginal ?? img.DateTime;
  if (d instanceof Date && !isNaN(+d)) out.time = `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  const tz = clean(p.OffsetTimeOriginal ?? p.OffsetTime);
  if (out.time && /^[+-]\d\d:\d\d$/.test(tz)) out.tz = tz;

  const g = e.GPSInfo ?? {};
  const lat = dms(g.GPSLatitude, g.GPSLatitudeRef), lng = dms(g.GPSLongitude, g.GPSLongitudeRef);
  if (lat !== undefined && lng !== undefined && (lat || lng)) {
    out.gps = [+lng.toFixed(5), +lat.toFixed(5)];
    const alt = num(g.GPSAltitude);
    if (alt !== undefined) out.alt = Math.round(g.GPSAltitudeRef === 1 ? -alt : alt);
  }

  // 竖拍且像素没转正（方向 5–8）时宽高对调
  if (size) out.size = (num(img.Orientation) ?? 1) >= 5 ? [size[1], size[0]] : size;
  return out;
}

/**
 * 直方图：原图全分辨率逐像素统计 sRGB 编码值，红、绿、蓝各 128 格，三个通道按同一个最高值线性缩放（彼此可比，两端那一格不参与）。
 * 不缩图：缩小时像素被平均，翻拍屏幕、细密纹理这类照片的高光会被抹平。
 */
async function histogram(file: string): Promise<Exif['hist']> {
  try {
    const { default: sharp } = await import('sharp');
    const { data, info } = await sharp(file).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const ch = [new Array(128).fill(0), new Array(128).fill(0), new Array(128).fill(0)], c = info.channels;
    for (let i = 0; i + 2 < data.length; i += c) { ch[0][data[i] >> 1]++; ch[1][data[i + 1] >> 1]++; ch[2][data[i + 2] >> 1]++; }
    // 缩放时不算两端那一格（纯黑、过曝的像素常常一根冲顶，把其余的压扁），两端超出的顶格截断
    const max = Math.max(...ch.flatMap((bins) => bins.slice(1, -1))) || Math.max(...ch.flat());
    return max ? (ch.map((bins) => bins.map((b) => Math.min(99, Math.round((b / max) * 99)))) as [number[], number[], number[]]) : undefined;
  } catch { return undefined; } // 没装 sharp 就不画
}

async function read(file: string): Promise<Exif | undefined> {
  try {
    const { app1, size } = head(file);
    if (!app1) return undefined;
    const out = format(exifReader(app1), size);
    if (!out.camera && !out.lens && !out.aperture && !out.shutter && !out.iso && !out.time) return undefined;
    const hist = await histogram(file);
    if (hist) out.hist = hist;
    return out;
  } catch { return undefined; } // 读不出来就不显示
}

async function cached(file: string): Promise<Exif | undefined> {
  const key = assetPathOf({ fsPath: file }) ?? file;
  const rec = records()[key];
  if (!existsSync(file)) return rec?.v ?? undefined;
  const h = hashOf(file);
  if (!h) return rec?.v ?? undefined;
  if (rec && rec.h === h) return rec.v ?? undefined;
  const v = await read(file);
  // 没装 sharp 时读出来的没有直方图，别存进去
  if (key !== file && (!v || v.hist)) remember(key, { h, v: v ?? null });
  return v;
}

export function exifOf(src: unknown): Promise<Exif | undefined> {
  const file = (src as { fsPath?: string } | null | undefined)?.fsPath;
  if (!file || !/\.jpe?g$/i.test(file)) return Promise.resolve(undefined);
  if (!cache.has(file)) cache.set(file, cached(file));
  return cache.get(file)!;
}
