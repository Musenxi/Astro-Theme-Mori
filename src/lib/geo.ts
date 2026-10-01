const dms = (v: number, pos: string, neg: string) => {
  // 先换成整分再拆度和分，否则 16.9999° 会写成 16°60′
  const total = Math.round(Math.abs(v) * 60), d = Math.floor(total / 60), m = total % 60;
  return `${d}°${String(m).padStart(2, '0')}′${v >= 0 ? pos : neg}`;
};

/** 64°09′N 21°56′W —— 站点坐标的写法（lnglat 是 GeoJSON 顺序：经度在前） */
export const coord = ([lng, lat]: [number, number]) => `${dms(lat, 'N', 'S')} ${dms(lng, 'E', 'W')}`;
