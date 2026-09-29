/**
 * E 刻度的行为：日期挨得太近的几篇按实际占的高度（竖排时是宽度）依次让开；
 * 竖排时页面竖向滚动驱动时间轴横移（手卷，从右往左）；大号年月按当前位置逐位翻动。
 */
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const root = document.documentElement;
const vw = () => root.clientWidth;
const pad = (n: number) => String(n).padStart(2, '0');

type XAxis = HTMLElement & { _x?: number | null };
let onResize: (() => void) | null = null;
addEventListener('resize', () => onResize?.());

function init() {
  const he = document.querySelector<HTMLElement>('.he');
  if (!he || he.dataset.ready) return;
  he.dataset.ready = '1';
  const body = he.querySelector<HTMLElement>('#he-body')!;
  const axis = he.querySelector<XAxis>('#he-axis')!;
  const digitsEl = [...he.querySelectorAll<HTMLElement>('#he-counter .dg i')];
  const items = [...he.querySelectorAll<HTMLElement>('.he-item')];
  const NY = +he.dataset.ny!, NM = +he.dataset.nm!, MONTHS = +he.dataset.months!;
  const vertical = () => root.dataset.hdir === 'v';
  const unit = (name: '--mh' | '--mw') => parseFloat(getComputedStyle(he).getPropertyValue(name));
  let month = -1;

  function setCounter(k: number) {
    k = clamp(Math.floor(k), 0, MONTHS - 1);
    if (k === month) return;
    month = k;
    const tm = NY * 12 + NM - 1 - k;
    const digits = `${Math.floor(tm / 12)}${pad((tm % 12) + 1)}`;
    digitsEl.forEach((el, i) => (el.style.transform = `translateY(${-digits[i]}em)`));
  }

  function declutter() {
    const v = vertical(), u = unit(v ? '--mw' : '--mh');
    let end = -Infinity;
    for (const it of items) {
      it.style.removeProperty('--q');
      const size = v ? it.offsetWidth : it.offsetHeight;
      const c = Math.max(parseFloat(it.style.getPropertyValue('--p')) * u, end + size / 2 + 10);
      it.style.setProperty('--q', c + 'px');
      end = c + size / 2;
    }
  }

  function layout() {
    axis.style.transform = ''; axis._x = null;
    body.style.height = vertical() ? Math.max(innerHeight, axis.offsetWidth - vw() + innerHeight) + 'px' : '';
    month = -1;
    declutter();
  }
  onResize = () => he.isConnected && layout();

  function tick() {
    if (!he!.isConnected) { onResize = null; return; }
    if (vertical()) {
      const r = body.getBoundingClientRect();
      const max = Math.max(0, axis.offsetWidth - vw()), span = r.height - innerHeight;
      const target = (span > 0 ? clamp(-r.top / span, 0, 1) : 0) * max;
      let x = axis._x ?? target;
      x = reduce ? target : x + (target - x) * 0.14;
      if (Math.abs(target - x) < 0.25) x = target;
      if (x !== axis._x) { axis._x = x; axis.style.transform = `translate3d(${x}px,0,0)`; }
      const mw = unit('--mw'), edge = (axis.offsetWidth - MONTHS * mw) / 2;
      setCounter((x + vw() * 0.5 - edge) / mw);
    } else {
      setCounter((innerHeight * 0.42 - axis.getBoundingClientRect().top) / unit('--mh'));
    }
    requestAnimationFrame(tick);
  }

  layout();
  document.fonts?.ready.then(layout);
  requestAnimationFrame(tick);
}

document.addEventListener('astro:page-load', init);
init();

export {}; // 这是一个模块（让顶层的 const / function 不进全局作用域）
