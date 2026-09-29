const dms = (v: number, pos: string, neg: string) => {
  const a = Math.abs(v), d = Math.floor(a), m = Math.round((a - d) * 60);
  return `${d}°${String(m).padStart(2, '0')}′${v >= 0 ? pos : neg}`;
};

/** 64°09′N 21°56′W —— 站点坐标的写法（lnglat 是 GeoJSON 顺序：经度在前） */
export const coord = ([lng, lat]: [number, number]) => `${dms(lat, 'N', 'S')} ${dms(lng, 'E', 'W')}`;
