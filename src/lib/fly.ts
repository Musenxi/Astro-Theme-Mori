/**
 * 小地图的镜头怎么飞：van Wijk & Nuij（2003）的平滑缩放路径，ρ = √2，和 d3.interpolateZoom、网页地图的 flyTo 一样。
 * 两处离得远就先拉远、边移边飞、再拉近，看起来像一次连贯的移动。构建时（MiniMap.astro 预先铺好镜头会经过的图层）
 * 和页面上（travel.ts 播放）用的是同一条路径。
 */

/** 镜头：中心 x、y 和宽度 */
export type Cam = [number, number, number];

/**
 * 从 a 到 b 的路径：at(0..1) 给出那一刻的镜头，pan(0..1) 是那一刻镜头中心走完了多少（0–1，当前位置的标记按它沿路线走，
 * 始终在画面中间附近）；S 是路径的长度（越长飞得越久）
 */
export function zoomPath([x0, y0, w0]: Cam, [x1, y1, w1]: Cam): { S: number; at: (t: number) => Cam; pan: (t: number) => number } {
  const rho = Math.SQRT2, rho2 = 2, rho4 = 4, dx = x1 - x0, dy = y1 - y0, d2 = dx * dx + dy * dy;
  if (d2 < 1e-12) {
    const S = Math.log(w1 / w0) / rho;
    return { S: Math.abs(S), at: (t) => [x0 + t * dx, y0 + t * dy, w0 * Math.exp(rho * t * S)], pan: (t) => t };
  }
  const d1 = Math.sqrt(d2);
  const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1), b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / rho;
  const pan = (t: number) => (w0 / (rho2 * d1)) * (Math.cosh(r0) * Math.tanh(rho * t * S + r0) - Math.sinh(r0));
  return {
    S,
    pan,
    at: (t) => {
      const u = pan(t);
      return [x0 + u * dx, y0 + u * dy, (w0 * Math.cosh(r0)) / Math.cosh(rho * t * S + r0)];
    },
  };
}

/**
 * 一层陆地（取景框 tile：中心、宽度）合不合用这个镜头：0–1。
 * 镜头不比取景宽（宽出一倍就完全不用了，精度不够、也快露出边了），并且镜头还在它画了陆地的范围（取景框外一整圈）里。
 */
export function tileFit(tile: Cam, [cx, cy, cw]: Cam, aspect: number) {
  const [tx, ty, tw] = tile, th = tw * aspect, ch = cw * aspect;
  const edge = Math.min(cx - cw / 2 - (tx - 1.5 * tw), tx + 1.5 * tw - (cx + cw / 2), cy - ch / 2 - (ty - 1.5 * th), ty + 1.5 * th - (cy + ch / 2));
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return clamp(Math.log2((2 * tw) / cw)) * clamp(edge / (tw / 2));
}
