/**
 * 首页封面版：刊名按版心宽度排满；往下滚时刊名缩小并移到页头的位置，变成页头里的 MORI；页头压在封面上时反色。
 * 页头是跨页保留的，离开首页时要把它恢复原样。
 */
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const easeIO = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const root = document.documentElement;

let stop: (() => void) | null = null;

function resetHeader() {
  const site = document.querySelector<HTMLElement>('#site');
  site?.classList.remove('on-cover');
  const mark = site?.querySelector<HTMLElement>('.mark');
  if (mark) mark.style.opacity = '';
  root.style.removeProperty('--hh');
}

function init() {
  stop?.(); stop = null;
  const fc = document.querySelector<HTMLElement>('#fc');
  const site = document.querySelector<HTMLElement>('#site');
  if (!fc || !site) { resetHeader(); return; }
  const m = fc.querySelector<HTMLElement>('#f-mast')!;
  const mark = site.querySelector<HTMLElement>('.mark')!;
  let mast0: { L: number; T: number; H: number; fs: number } | null = null;

  // 刊名按版心宽度排满
  function fit() {
    m.style.transform = ''; m.style.fontSize = '100px'; m.style.width = 'max-content'; m.style.justifyContent = 'flex-start';
    const pcs = getComputedStyle(m.parentElement!);
    const w = m.getBoundingClientRect().width, W = m.parentElement!.clientWidth - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight);
    m.style.width = ''; m.style.justifyContent = '';
    m.style.fontSize = ((100 * W) / w * 0.99).toFixed(2) + 'px';
    mast0 = null;
    root.style.setProperty('--hh', site!.offsetHeight + 'px');
    onScroll();
  }

  function onScroll() {
    site!.classList.toggle('on-cover', fc!.getBoundingClientRect().bottom > site!.offsetHeight * 0.6);
    if (reduce) return;
    if (!mast0) {
      m.style.transform = '';
      const r = m.getBoundingClientRect();
      mast0 = { L: r.left, T: r.top + scrollY, H: r.height, fs: parseFloat(m.style.fontSize) || 100 };
    }
    const mk = mark.getBoundingClientRect();
    const p = clamp(scrollY / (innerHeight * 0.5), 0, 1), e = easeIO(p);
    // 让刊名的大写字母高度落到页头 MORI 的大写字母高度（Cormorant 大写约 .63em，页头字母约 .7em）
    const s = (parseFloat(getComputedStyle(mark).fontSize) * 0.7) / (mast0.fs * 0.63);
    const S = 1 + (s - 1) * e;
    const tx = (mk.left - mast0.L) * e;
    const targetTop = mk.top + mk.height / 2 - (mast0.H * s) / 2;
    const Y = mast0.T + (targetTop - mast0.T) * e;
    m.style.transform = `translate(${tx.toFixed(2)}px,${(Y - (mast0.T - scrollY)).toFixed(2)}px) scale(${S.toFixed(4)})`;
    const f = clamp((p - 0.82) / 0.18, 0, 1);
    m.style.opacity = String(1 - f);
    mark.style.opacity = String(f);
  }

  // 进场（第一次打开）：刊名自下而上露出，细线从左画开，小点依次落下
  if (!reduce) { fc.classList.remove('play'); void fc.offsetWidth; fc.classList.add('play'); }
  fit();
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', fit);
  document.fonts?.ready.then(fit);
  // 西文字体的样式表是异步加载的：有字体加载完成再按实际字宽排满一次
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
