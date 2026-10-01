/**
 * 页头的行为：昼夜切换、向下滚时收起 / 向上滚时出现、栏目里的选中透镜、液态玻璃的边缘折射。
 * 页头跨页保留（transition:persist），所以事件只绑一次；每次换页后（astro:page-load）再同步“当前栏目”。
 * 折射的做法见 spec §4（参考 kube.io/blog/liquid-glass-css-svg）。
 */
import { t } from './i18n.ts';
import { lgFilter, lgSpec, refractOk } from './lg.ts';

const root = document.documentElement;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
};

/* ───────────── 昼夜 ───────────── */
const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
const themeBtn = document.querySelector<HTMLElement>('#theme'); // 右侧的操作里没有昼夜切换时页头里没有这颗钮
const syncTheme = () => {
  if (!themeBtn) return;
  if (themeBtn.dataset.mode === 'icon') {
    for (const s of themeBtn.querySelectorAll<HTMLElement>('[data-when]')) {
      const off = (s.dataset.when === 'dark') !== isDark();
      s.classList.toggle('hidden', off);
      s.classList.toggle('grid', !off);
    }
    return;
  }
  themeBtn.textContent = isDark() ? t('js.theme.toLight') : t('js.theme.toDark');
};
const flipTheme = () => {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  store.set('mori-theme', root.dataset.theme);
  syncTheme();
};
themeBtn?.addEventListener('click', () => {
  // 整页交叉淡入：页头、正文、页脚在同一刻、用同一条曲线变色（各元素自己过渡的话，写了 transition 的和没写的会错开）
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return flipTheme();
  root.classList.add('vt-theme');
  document.startViewTransition(flipTheme).finished.finally(() => root.classList.remove('vt-theme'));
});
document.addEventListener('astro:after-swap', syncTheme);

/* ───────────── 向下滚时收起，向上滚时出现 ───────────── */
const site = $('#site');
let lastY = scrollY;
addEventListener('scroll', () => {
  const y = scrollY;
  // 封面版首页：刊名缩进页头的这一段里页头不收起（cover.ts 设 data-site-keep）
  const keep = Math.max(160, Number(root.dataset.siteKeep) || 0);
  if (y > lastY + 4 && y > keep) site.classList.add('hide');
  else if (y < lastY - 4 || y <= keep) site.classList.remove('hide');
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

// 换页时才给页头起过渡名（vt-chrome.css），过渡结束就去掉：平时带着名字，玻璃的背景模糊会失效
// 换页会把 <html> 的 class 换成新页面的，所以换完页（after-swap）过渡还没结束就再加回去
let vtSite = false;
document.addEventListener('astro:before-preparation', () => { vtSite = true; root.classList.add('vt-site'); });
document.addEventListener('astro:before-swap', (e) => {
  e.viewTransition.finished.catch(() => {}).finally(() => { vtSite = false; root.classList.remove('vt-site'); });
});
document.addEventListener('astro:after-swap', () => { if (vtSite) root.classList.add('vt-site'); });

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

// 右侧的操作：合并时是 #lg-actions 一个胶囊，分开时是它里面每个操作各一个；一个都没有时不存在
const actionBoxes = [...document.querySelectorAll<HTMLElement>('#lg-actions.lg-btn, #lg-actions > .lg-btn')];
const glassEls = [nav, ...actionBoxes];
function lgRefract() {
  for (const el of glassEls) {
    if (el.offsetWidth) el.style.setProperty('--lg-spec', `url(${lgSpec(Math.round(el.offsetWidth), Math.round(el.offsetHeight))})`);
  }
  if (!root.classList.contains('lg-refract')) return;
  // 每个胶囊一个折射滤镜（尺寸不同，贴图也不同），id 按顺序编号，写进各自的 --lg-f
  actionBoxes.forEach((el, i) => el.style.setProperty('--lg-f', `url(#lg-f-btn-${i}) blur(4px) saturate(1.7) brightness(1.05)`));
  $('#lg-defs').innerHTML = lgFilter('lg-f-nav', nav) + actionBoxes.map((el, i) => lgFilter(`lg-f-btn-${i}`, el)).join('');
}

// 换页时 <html> 的 class 会被新页面的换掉，折射的开关每次换页后都要补回去
const markRefract = () => { if (refractOk) root.classList.add('lg-refract'); };
markRefract();
document.addEventListener('astro:after-swap', markRefract);

const refresh = () => { lgRefract(); lgLens(); };
addEventListener('resize', refresh);
document.fonts?.ready.then(refresh);
document.addEventListener('astro:page-load', () => { markCurrent(); syncTheme(); refresh(); });
markCurrent(); syncTheme(); refresh();

export {}; // 这是一个模块（让顶层的 const / function 不进全局作用域）
