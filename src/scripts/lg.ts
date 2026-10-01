/**
 * 液态玻璃（做法参考 kube.io/blog/liquid-glass-css-svg）：折射位移贴图和边缘高光，页头的胶囊和悬浮搜索框共用。
 */
/*    玻璃边缘是一个凸的 squircle 斜面（离边 x∈[0,1] 处高度 (1-(1-x)^4)^(1/4)），
   垂直入射的光线在斜面上按斯涅尔定律折射（空气 1 → 玻璃 1.5），落到背景平面上的横向偏移就是该处的位移量。
   位移只和“离边多远”有关，所以只算一条半径上的 127 个采样，再按胶囊的形状绕一圈贴出来。 */
const LG = (() => {
  const N = 127, ETA = 1 / 1.5, T = 1, GAP = 0.4;
  const f = (x: number) => Math.pow(1 - Math.pow(1 - x, 4), 0.25);
  const prof: number[] = [];
  for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N, dx = 0.001;
    const slope = (T * (f(Math.min(1, x + dx)) - f(Math.max(0, x - dx)))) / (Math.min(1, x + dx) - Math.max(0, x - dx));
    const L = Math.hypot(slope, 1), nu = -slope / L, nz = 1 / L, c = nz;
    const k = ETA * c - Math.sqrt(1 - ETA * ETA * (1 - c * c));
    const tu = k * nu, tz = -ETA + k * nz;
    prof.push((tu / -tz) * (T * f(x) + GAP));
  }
  return { N, prof, max: Math.max(...prof) };
})();

/** 到圆角矩形边的距离和向外的法线（有向距离场）；r 是圆角半径，胶囊就是 min(w,h)/2 */
function lgSdf(x: number, y: number, w: number, h: number, r: number) {
  const ax = w / 2 - r, ay = h / 2 - r;
  const px = x + 0.5 - w / 2, py = y + 0.5 - h / 2, qx = Math.abs(px) - ax, qy = Math.abs(py) - ay;
  const sdf = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  let nx = 0, ny = 0;
  if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy); nx = (Math.sign(px) * qx) / l; ny = (Math.sign(py) * qy) / l; }
  else if (qx > qy) nx = Math.sign(px); else ny = Math.sign(py);
  return { d: -sdf, nx, ny };
}
const LG_BEZEL = (h: number) => Math.min(h * 0.42, 20), LG_POWER = 1.7;

/** 位移贴图：R/G 编码每个像素“去哪里取背景”（向里取），128 为不动 */
function lgMap(w: number, h: number, r: number) {
  const bz = LG_BEZEL(h), c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!, img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const { d: dist, nx, ny } = lgSdf(x, y, w, h, r), u = dist / bz;
    const m = u >= 1 || u < 0 ? 0 : LG.prof[Math.min(LG.N - 1, Math.floor(u * LG.N))] / LG.max;
    const i = (y * w + x) * 4;
    d[i] = 128 - nx * m * 127; d[i + 1] = 128 - ny * m * 127; d[i + 2] = 128; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

/** 高光：一圈贴着边的亮线，强度取决于边的朝向和固定光源方向（左上），左上和右下两端最亮、直边中段最淡 */
export function lgSpec(w: number, h: number, r = Math.min(w, h) / 2) {
  const S = 2, W = w * S, H = h * S, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, img = g.createImageData(W, H), d = img.data, lx = -Math.SQRT1_2, ly = -Math.SQRT1_2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const { d: dist, nx, ny } = lgSdf(x, y, W, H, r * S), px = dist / S;
    if (px < 0) continue;
    const a = Math.min(1, Math.abs(nx * lx + ny * ly) ** 2.4 * (Math.exp(-px / 0.9) + 0.22 * Math.exp(-px / 5)));
    const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

/** 一个元素的折射滤镜（SVG <filter>），r 是它的圆角半径，不给就当胶囊 */
export function lgFilter(id: string, el: HTMLElement, r?: number) {
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (!w || !h) return '';
  const box = `x="0" y="0" width="${w}" height="${h}"`, scale = ((2 * LG.max * LG_BEZEL(h) * LG_POWER * 255) / 254).toFixed(1);
  return `<filter id="${id}" ${box} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
    <feImage href="${lgMap(w, h, r ?? Math.min(w, h) / 2)}" ${box} preserveAspectRatio="none" result="m"/>
    <feDisplacementMap in="SourceGraphic" in2="m" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
}

// backdrop-filter:url() 只有 Chromium 支持；其他浏览器退回轻模糊 + 高光，边缘不弯
export const refractOk = !!(navigator as any).userAgentData && CSS.supports('backdrop-filter', 'url(#a)');
