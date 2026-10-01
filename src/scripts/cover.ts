/**
 * 首页封面版：刊名太长时缩到版心宽度以内；往下滚时刊名缩小并移到页头的位置，变成页头里的站名（动画在 cover.css）。
 * 这里只量起止位置：刊名在 h1 里的位置（滚动时它是 fixed 的）、页头站名的位置和字号。
 * 页头是跨页保留的，离开首页时要把它恢复原样。
 */
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const timeline = CSS.supports('animation-timeline: scroll()');
const root = document.documentElement;

let stop: (() => void) | null = null;

function resetHeader() {
  root.classList.remove('cover-home');
  root.style.removeProperty('--hh');
  root.style.removeProperty('--mast-end');
  root.style.removeProperty('--p');
  delete root.dataset.siteKeep;
}

function init() {
  stop?.(); stop = null;
  const fc = document.querySelector<HTMLElement>('#fc');
  const site = document.querySelector<HTMLElement>('#site');
  if (!fc || !site) { resetHeader(); return; }
  const box = fc.querySelector<HTMLElement>('#f-mast-box')!;
  const m = fc.querySelector<HTMLElement>('#f-mast')!;
  const mark = site.querySelector<HTMLElement>('.mark')!;
  let end = 1;

  function fit() {
    root.style.setProperty('--hh', site!.offsetHeight + 'px');
    // 字号由 CSS 定；站名太长、放不下版心时才缩小
    m.style.fontSize = '';
    const fs0 = parseFloat(getComputedStyle(m).fontSize), W = box.clientWidth;
    const fs = m.offsetWidth > W ? (fs0 * W) / m.offsetWidth * 0.99 : fs0;
    if (fs !== fs0) m.style.fontSize = fs.toFixed(2) + 'px';
    const H = m.offsetHeight;
    box.style.setProperty('--mh', H + 'px');
    if (reduce) return;
    // 起点：刊名在 h1 里居中时的位置（视口坐标）；终点：页头站名的位置（页头收起时把收起的位移扣掉）
    const b = box.getBoundingClientRect(), L = b.left + (box.clientWidth - m.offsetWidth) / 2, T = b.top + scrollY;
    const mk = mark.getBoundingClientRect(), up = new DOMMatrix(getComputedStyle(site!).transform).m42;
    const s = parseFloat(getComputedStyle(mark).fontSize) / fs;
    const ty = mk.top - up + mk.height / 2 - (H * s) / 2 - T;
    m.style.setProperty('--ml', L + 'px');
    m.style.setProperty('--mt', T + 'px');
    m.style.setProperty('--tx', (mk.left - L).toFixed(2) + 'px');
    m.style.setProperty('--ty', ty.toFixed(2) + 'px');
    m.style.setProperty('--s', s.toFixed(4));
    end = Math.round(innerHeight * 0.5);
    root.style.setProperty('--mast-end', end + 'px');
    root.dataset.siteKeep = String(end);
    root.classList.add('cover-home');
    fc!.classList.add('anim');
    onScroll();
  }

  function onScroll() {
    if (!timeline) root.style.setProperty('--p', Math.min(1, scrollY / end).toFixed(4));
  }

  // 进场（第一次打开）：刊名自下而上露出，细线从左画开，小点依次落下
  if (!reduce) { fc.classList.remove('play'); void fc.offsetWidth; fc.classList.add('play'); }
  fit();
  if (!timeline) addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', fit);
  document.fonts?.ready.then(fit);
  document.fonts?.addEventListener('loadingdone', fit);
  stop = () => {
    removeEventListener('scroll', onScroll); removeEventListener('resize', fit);
    document.fonts?.removeEventListener('loadingdone', fit);
    resetHeader();
  };
}

// 离开首页时（换页前）把页头恢复原样
document.addEventListener('astro:before-swap', () => { stop?.(); stop = null; });
document.addEventListener('astro:page-load', init);
init();

export {};
