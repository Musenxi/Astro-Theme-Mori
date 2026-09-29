/**
 * 路线的数据处理（spec §3.2：路线来源 = 手动点选 / 导入 GPX / 从照片 EXIF 的 GPS 自动生成）：
 * GPX 解析、轨迹简化、照片按位置和日期聚类成站点建议。全是纯函数，方便测试。
 */
import exifReader from 'exif-reader';

/** GPX → [[经度, 纬度], ...]（所有轨迹段和路线点按顺序拼起来；只要有效的点） */
export function parseGpx(xml) {
  const pts = [];
  // 轨迹点 <trkpt lat lon>；没有轨迹就用路线点 <rtept>，再没有才用航点 <wpt>
  for (const tag of ['trkpt', 'rtept', 'wpt']) {
    for (const m of xml.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))) {
      const lat = +/lat\s*=\s*["']([-\d.eE+]+)["']/.exec(m[1])?.[1], lon = +/lon\s*=\s*["']([-\d.eE+]+)["']/.exec(m[1])?.[1];
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) pts.push([lon, lat]);
    }
    if (pts.length) break;
  }
  return pts;
}

/** Douglas–Peucker 简化。tol 单位是度（0.0005 约 50 米）；结果最多 max 个点，超了就放宽容差再来 */
export function simplify(points, tol = 0.0005, max = 600) {
  const rdp = (pts, t) => {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let dmax = 0, idx = -1;
      const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      for (let i = a + 1; i < b; i++) {
        const [px, py] = pts[i];
        const u = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
        const d = Math.hypot(px - (ax + u * dx), py - (ay + u * dy));
        if (d > dmax) { dmax = d; idx = i; }
      }
      if (dmax > t && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  };
  let out = rdp(points, tol), t = tol;
  while (out.length > max) out = rdp(points, (t *= 1.6));
  return out.map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);
}

/** EXIF 里的度分秒 + 参考方向 → 十进制度 */
const dms = (v, ref) => (Array.isArray(v) && v.length === 3 ? (v[0] + v[1] / 60 + v[2] / 3600) * (ref === 'S' || ref === 'W' ? -1 : 1) : null);

/** 从图片的 EXIF 数据块里取位置和拍摄时间（没有就是 null） */
export function readExif(buffer) {
  if (!buffer) return { lnglat: null, time: null };
  try {
    const e = exifReader(buffer);
    const g = e.GPSInfo ?? e.gps ?? {};
    const lat = dms(g.GPSLatitude, g.GPSLatitudeRef), lng = dms(g.GPSLongitude, g.GPSLongitudeRef);
    const t = e.Photo?.DateTimeOriginal ?? e.Image?.DateTime ?? e.exif?.DateTimeOriginal ?? null;
    return { lnglat: lat != null && lng != null ? [+lng.toFixed(5), +lat.toFixed(5)] : null, time: t instanceof Date ? t.getTime() : null };
  } catch { return { lnglat: null, time: null }; }
}

const km = ([x1, y1], [x2, y2]) => {
  const r = Math.PI / 180, a = Math.sin(((y2 - y1) * r) / 2) ** 2 + Math.cos(y1 * r) * Math.cos(y2 * r) * Math.sin(((x2 - x1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
};

/**
 * 照片 → 站点建议：按拍摄时间排序（没有时间的按文件名），离当前这一站超过 radiusKm、或隔了超过 gapHours 小时，就开新的一站。
 * 站点位置取这一站所有照片的平均位置。返回 [{ lnglat, date: 'MM.DD', count, photos }]
 */
export function clusterStops(photos, { radiusKm = 3, gapHours = 30 } = {}) {
  const geo = photos.filter((p) => p.lnglat).sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity) || a.name.localeCompare(b.name));
  const stops = [];
  for (const p of geo) {
    const cur = stops[stops.length - 1];
    const near = cur && km(cur.center, p.lnglat) <= radiusKm;
    const soon = cur && (p.time == null || cur.last == null || (p.time - cur.last) / 36e5 <= gapHours);
    if (cur && near && soon) {
      cur.photos.push(p.name);
      cur.sum[0] += p.lnglat[0]; cur.sum[1] += p.lnglat[1];
      cur.center = [cur.sum[0] / cur.photos.length, cur.sum[1] / cur.photos.length];
      cur.last = p.time ?? cur.last;
    } else stops.push({ center: [...p.lnglat], sum: [...p.lnglat], photos: [p.name], first: p.time, last: p.time });
  }
  const pad = (n) => String(n).padStart(2, '0');
  return stops.map((s) => {
    const d = s.first != null ? new Date(s.first) : null;
    return { lnglat: [+s.center[0].toFixed(5), +s.center[1].toFixed(5)], date: d ? `${pad(d.getMonth() + 1)}.${pad(d.getDate())}` : undefined, count: s.photos.length, photos: s.photos };
  });
}
