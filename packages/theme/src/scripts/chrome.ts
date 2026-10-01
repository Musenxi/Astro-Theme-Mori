/**
 * 页头的行为：昼夜切换、向下滚时收起 / 向上滚时出现、栏目里的选中透镜、液态玻璃的边缘折射。
 * 页头跨页保留（transition:persist），所以事件只绑一次；每次换页后（astro:page-load）再同步“当前栏目”。
 * 折射的做法见 spec §4（参考 kube.io/blog/liquid-glass-css-svg）。
 */
import { t } from './i18n.ts';
const root = document.documentElement;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
};

/* ───────────── 昼夜 ───────────── */
const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
const syncTheme = () => { $('#theme').textContent = isDark() ? t('js.theme.toLight') : t('js.theme.toDark'); };
$('#theme').addEventListener('click', () => {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  store.set('mori-theme', root.dataset.theme);
  syncTheme();
});
document.addEventListener('astro:after-swap', syncTheme);

/* ───────────── 向下滚时收起，向上滚时出现 ───────────── */
const site = $('#site');
let lastY = scrollY;
addEventListener('scroll', () => {
  const y = scrollY;
  if (y > lastY + 4 && y > 160) site.classList.add('hide');
  else if (y < lastY - 4 || y <= 160) site.classList.remove('hide');
  lastY = y;
}, { passive: true });

/* ───────────── 选中透镜 ───────────── */
// 透镜停在当前栏目；悬停时弹到悬停的那一项，离开后回来。当前页不在导航里（如首页）时透镜不显示
const nav = $('#lg-nav');
const lens = $('#lg-lens');
const links = () => [...nav.querySelectorAll<HTMLAnchorElement>('a')];

/** 当前栏目：地址落在某个导航项之下（/posts/xxx/ 属于 /posts/） */
function markCurrent() {
  const path = location.pathname;
  for (const a of links()) {
    const base = new URL(a.href).pathname;
    if (path === base || (base !== '/' && path.startsWith(base))) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function lgLens(a?: HTMLElement | null) {
  const target = a ?? nav.querySelector<HTMLElement>('a[aria-current]');
  if (!target) { lens.classList.remove('on'); return; }
  const snap = !lens.classList.contains('on');
  if (snap) lens.classList.add('snap');
  lens.style.setProperty('--x', target.offsetLeft + 'px');
  lens.style.setProperty('--w', target.offsetWidth + 'px');
  if (snap) { void lens.offsetWidth; lens.classList.remove('snap'); }
  lens.classList.add('on');
}
nav.addEventListener('pointerover', (e) => { const a = (e.target as Element).closest('a'); if (a) lgLens(a); });
nav.addEventListener('pointerleave', () => lgLens());
nav.addEventListener('focusin', (e) => lgLens((e.target as Element).closest('a')));
nav.addEventListener('focusout', () => lgLens());

// 页头跨页保留，但换页时它会被重新插入文档，进行到一半的透镜滑动因此被取消、直接跳到终点。换页前记下透镜当前的位置，换页后从那里接着滑
let lensAt: { x: number; w: number } | null = null;
document.addEventListener('astro:before-swap', () => {
  if (!lens.classList.contains('on')) { lensAt = null; return; }
  const l = lens.getBoundingClientRect(), n = nav.getBoundingClientRect();
  lensAt = { x: l.left - n.left - nav.clientLeft, w: l.width };
});
document.addEventListener('astro:after-swap', () => {
  if (!lensAt || !lens.classList.contains('on')) return;
  lens.classList.add('snap');
  lens.style.setProperty('--x', lensAt.x + 'px');
  lens.style.setProperty('--w', lensAt.w + 'px');
  void lens.offsetWidth;
  lens.classList.remove('snap');
  lensAt = null;
});

/* ───────────── 液态玻璃的物理 ─────────────
   玻璃边缘是一个凸的 squircle 斜面（离边 x∈[0,1] 处高度 (1-(1-x)^4)^(1/4)），
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

/** 到胶囊边的距离和向外的法线（圆角矩形的有向距离场） */
function lgSdf(x: number, y: number, w: number, h: number) {
  const r = Math.min(w, h) / 2, ax = w / 2 - r, ay = h / 2 - r;
  const px = x + 0.5 - w / 2, py = y + 0.5 - h / 2, qx = Math.abs(px) - ax, qy = Math.abs(py) - ay;
  const sdf = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  let nx = 0, ny = 0;
  if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy); nx = (Math.sign(px) * qx) / l; ny = (Math.sign(py) * qy) / l; }
  else if (qx > qy) nx = Math.sign(px); else ny = Math.sign(py);
  return { d: -sdf, nx, ny };
}
const LG_BEZEL = (h: number) => Math.min(h * 0.42, 20), LG_POWER = 1.7;

/** 位移贴图：R/G 编码每个像素“去哪里取背景”（向里取），128 为不动 */
function lgMap(w: number, h: number) {
  const bz = LG_BEZEL(h), c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!, img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const { d: dist, nx, ny } = lgSdf(x, y, w, h), u = dist / bz;
    const m = u >= 1 || u < 0 ? 0 : LG.prof[Math.min(LG.N - 1, Math.floor(u * LG.N))] / LG.max;
    const i = (y * w + x) * 4;
    d[i] = 128 - nx * m * 127; d[i + 1] = 128 - ny * m * 127; d[i + 2] = 128; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

/** 高光：一圈贴着边的亮线，强度取决于边的朝向和固定光源方向（左上），左上和右下两端最亮、直边中段最淡 */
function lgSpec(w: number, h: number) {
  const S = 2, W = w * S, H = h * S, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, img = g.createImageData(W, H), d = img.data, lx = -Math.SQRT1_2, ly = -Math.SQRT1_2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const { d: dist, nx, ny } = lgSdf(x, y, W, H), px = dist / S;
    if (px < 0) continue;
    const a = Math.min(1, Math.abs(nx * lx + ny * ly) ** 2.4 * (Math.exp(-px / 0.9) + 0.22 * Math.exp(-px / 5)));
    const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

function lgFilter(id: string, el: HTMLElement) {
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (!w || !h) return '';
  const box = `x="0" y="0" width="${w}" height="${h}"`, scale = ((2 * LG.max * LG_BEZEL(h) * LG_POWER * 255) / 254).toFixed(1);
  return `<filter id="${id}" ${box} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
    <feImage href="${lgMap(w, h)}" ${box} preserveAspectRatio="none" result="m"/>
    <feDisplacementMap in="SourceGraphic" in2="m" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
}

const glassEls = [nav, $('#theme')];
function lgRefract() {
  for (const el of glassEls) {
    if (el.offsetWidth) el.style.setProperty('--lg-spec', `url(${lgSpec(Math.round(el.offsetWidth), Math.round(el.offsetHeight))})`);
  }
  if (!root.classList.contains('lg-refract')) return;
  $('#lg-defs').innerHTML = lgFilter('lg-f-nav', nav) + lgFilter('lg-f-btn', $('#theme'));
}

// backdrop-filter:url() 只有 Chromium 支持；其他浏览器退回轻模糊 + 高光，边缘不弯
if ((navigator as any).userAgentData && CSS.supports('backdrop-filter', 'url(#a)')) root.classList.add('lg-refract');

const refresh = () => { lgRefract(); lgLens(); };
addEventListener('resize', refresh);
document.fonts?.ready.then(refresh);
document.addEventListener('astro:page-load', () => { markCurrent(); syncTheme(); refresh(); });
markCurrent(); syncTheme(); refresh();

export {}; // 这是一个模块（让顶层的 const / function 不进全局作用域）
