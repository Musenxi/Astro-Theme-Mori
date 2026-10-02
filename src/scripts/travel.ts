/**
 * 长卷的三种读法（spec §3.2）：竖向 / 混合 / 横向，读者在右下角切换并被记住；横滚方向由作者按篇设定。
 * 横向不劫持滚轮：页面仍是原生竖向滚动，横移由 position:sticky + transform 实现（触控板、键盘、滚动条都能用）。
 *  - 竖向（v）：一路往下；横向图组是可以左右滑动的一行。
 *  - 混合（m）：一路往下；横向图组钉住，由竖向滚动驱动横移。
 *  - 横向（h）：整篇排进横轴，竖向滚动驱动整条轨道横移。
 * 切换读法时回到当前读到的那一块，不丢阅读位置。
 * 读到哪个地点：每一列带 data-place（第几个地点）；正文里的地点标记是 #place-<n>。
 */
import { t } from './i18n.ts';
import { lgFilter, lgSpec } from './lg.ts';
type Mode = 'v' | 'h' | 'm';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const pad = (n: number) => String(n).padStart(2, '0');
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
};
const root = document.documentElement;

type XTrack = HTMLElement & { _x?: number | null };
let relayoutOnResize: (() => void) | null = null;
addEventListener('resize', () => relayoutOnResize?.());

function init() {
  const travel = document.querySelector<HTMLElement>('.travel');
  if (!travel || travel.dataset.ready) return;
  travel.dataset.ready = '1';

  const tbody = travel.querySelector<HTMLElement>('.t-body')!;
  const track = travel.querySelector<XTrack>('.t-track')!;
  const strips = [...travel.querySelectorAll<HTMLElement>('.b-strip')];
  const blocks = [...travel.querySelectorAll<HTMLElement>('.t-track .blk:not(.b-endcard)')];
  const progress = travel.querySelector<HTMLElement>('.h-progress i');
  const mc = document.querySelector<HTMLElement>('#mc');
  const loc = document.querySelector<HTMLElement>('#loc');
  const allowed = (mc?.dataset.modes?.split(',') ?? [travel.dataset.mode!]) as Mode[];
  const stops: Array<{ id: string; name: string; date: string }> = JSON.parse(loc?.dataset.stops ?? '[]');
  const rtl = () => travel.dataset.dir === 'rtl';
  const vw = () => root.clientWidth;
  const mode = () => travel.dataset.mode as Mode;
  let snap = true;

  // 读者上次的选择；不在允许范围内就用作者的默认值
  const saved = store.get('mori-mode') as Mode | null;
  if (saved && allowed.includes(saved)) travel.dataset.mode = saved;

  // 横向读法里，横排的长文字排成并排的几栏（高度用满，宽度按栏数撑开）；短的一列就保持原样，按 y 摆
  const texts = [...travel.querySelectorAll<HTMLElement>('.b-text:not(.v)')];
  function flowText() {
    for (const el of texts) { el.classList.remove('cols'); el.style.width = ''; el.style.height = ''; }
    if (mode() !== 'h') return;
    const cs = getComputedStyle(track);
    const availH = track.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const gap = Math.round(clamp(vw() * 0.045, 36, 72));
    for (const el of texts) {
      const colW = el.offsetWidth, h = el.offsetHeight;
      if (!colW || h <= availH) continue;
      el.classList.add('cols');
      el.style.setProperty('--col-w', colW + 'px');
      el.style.setProperty('--col-gap', gap + 'px');
      el.style.height = availH + 'px';
      // 从估计的栏数开始，装不下就多加一栏
      for (let n = Math.max(2, Math.ceil(h / availH)); n < 60; n++) {
        el.style.width = n * colW + (n - 1) * gap + 'px';
        if (el.scrollWidth <= el.clientWidth + 1) break;
      }
    }
  }

  function layout() {
    const m = mode();
    flowText();
    tbody.style.height = '';
    for (const s of strips) { s.style.height = ''; const t = s.querySelector<XTrack>('.strip-track')!; t.style.transform = ''; t._x = null; }
    track.style.transform = ''; track._x = null;
    if (m === 'h') tbody.style.height = Math.max(innerHeight, track.offsetWidth - vw() + innerHeight) + 'px';
    if (m === 'm') for (const s of strips) s.style.height = Math.max(innerHeight, s.querySelector<HTMLElement>('.strip-track')!.offsetWidth - vw() + innerHeight) + 'px';
  }
  relayoutOnResize = () => { if (travel.isConnected) { layout(); snap = true; } };

  /** 当前读到的块：横向按横轴上的一条线，竖向按屏幕偏上的一条线 */
  function current() {
    const X = vw() * (rtl() ? 0.6 : 0.4), Y = innerHeight * 0.45;
    let best = blocks[0], bd = Infinity;
    for (const b of blocks) {
      if (b.offsetParent === null) continue;
      const r = b.getBoundingClientRect();
      const d = mode() === 'h' ? (X < r.left ? r.left - X : X > r.right ? X - r.right : 0) : (Y < r.top ? r.top - Y : Y > r.bottom ? Y - r.bottom : 0);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  function scrollToBlock(b: HTMLElement) {
    if (mode() === 'h') {
      const top = tbody.getBoundingClientRect().top + scrollY;
      const edge = parseFloat(getComputedStyle(track).paddingLeft);
      const max = Math.max(0, track.offsetWidth - vw());
      const x = rtl() ? track.offsetWidth - (b.offsetLeft + b.offsetWidth) - edge : b.offsetLeft - edge;
      scrollTo(0, top + clamp(x, 0, max));
    } else scrollTo(0, b.getBoundingClientRect().top + scrollY - innerHeight * 0.2);
  }

  // 划词引用评论的“回到正文”：把这一块带到屏幕中间。横向读法下换算成竖向滚动距离（左→右和右→左的手卷都适用），不切换读法
  const onReveal = (e: Event) => {
    if (!travel!.isConnected) { document.removeEventListener('mori:reveal', onReveal); return; }
    const el = (e as CustomEvent<{ el: Element; handled: boolean }>).detail.el;
    const b = el.closest<HTMLElement>('.t-track .blk');
    if (!b || mode() !== 'h') return; // 竖向 / 混合读法：交给原生滚动
    const top = tbody.getBoundingClientRect().top + scrollY;
    const max = Math.max(0, track.offsetWidth - vw());
    const x = rtl() ? track.offsetWidth - b.offsetLeft - b.offsetWidth / 2 - vw() / 2 : b.offsetLeft + b.offsetWidth / 2 - vw() / 2;
    scrollTo({ top: top + clamp(x, 0, max), behavior: reduce ? 'auto' : 'smooth' });
    (e as CustomEvent).detail.handled = true;
  };
  document.addEventListener('mori:reveal', onReveal);

  function withTransition(fn: () => void) {
    if (document.startViewTransition && !reduce) {
      root.classList.add('vt-mode');
      const t = document.startViewTransition(fn);
      t.ready.catch(() => {}); t.updateCallbackDone.catch(() => {});
      t.finished.catch(() => {}).finally(() => root.classList.remove('vt-mode'));
    } else fn();
  }

  function syncModeUI() {
    if (!mc) return;
    const m = mode();
    mc.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    mc.style.setProperty('--i', String(allowed.indexOf(m)));
  }

  function setMode(m: Mode) {
    if (mode() === m) return;
    const anchor = tbody.getBoundingClientRect().top < innerHeight * 0.5 ? current() : null;
    withTransition(() => {
      travel!.dataset.mode = m; store.set('mori-mode', m);
      syncModeUI(); layout(); snap = true;
      if (anchor) scrollToBlock(anchor);
    });
  }
  mc?.addEventListener('click', (e) => { const b = (e.target as Element).closest<HTMLButtonElement>('button'); if (b) setMode(b.dataset.m as Mode); });
  syncModeUI();

  // 竖向读法里横向图组的左右钮
  travel.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('.strip-ctl button');
    if (!b) return;
    const sc = b.closest('.b-strip')!.querySelector<HTMLElement>('.strip-sc')!;
    sc.scrollBy({ left: +b.dataset.dir! * sc.clientWidth * 0.7, behavior: 'smooth' });
  });

  // 行程表：点某个地点，滚到正文里标着它的那一块（横向读法下换算成横轴位置）
  travel.querySelector('.itin')?.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a');
    if (!a) return;
    e.preventDefault();
    const b = document.getElementById(a.getAttribute('href')!.slice(1))?.closest<HTMLElement>('.blk');
    if (b) scrollToBlock(b);
  });

  /** 竖向滚动 → 横向位移：外层高度撑出滚动距离，内层 sticky，位移带一点缓动（切换、缩放时直接到位） */
  function drive(outer: HTMLElement, tr: XTrack, prog?: HTMLElement | null) {
    const r = outer.getBoundingClientRect();
    const max = Math.max(0, tr.offsetWidth - vw());
    const span = r.height - innerHeight;
    const p = span > 0 ? clamp(-r.top / span, 0, 1) : 0;
    const target = p * max;
    let x = tr._x ?? target;
    x = snap || reduce ? target : x + (target - x) * 0.14;
    if (Math.abs(target - x) < 0.25) x = target;
    if (x !== tr._x) { tr._x = x; tr.style.transform = `translate3d(${rtl() ? x : -x}px,0,0)`; }
    if (prog) prog.style.transform = `scaleX(${max ? x / max : 0})`;
  }

  const hero = travel.querySelector('.t-hero')!, end = travel.querySelector('.t-end');
  const rbN = loc?.querySelector<HTMLElement>('#rb-n'), rbName = loc?.querySelector<HTMLElement>('#rb-name');

  // 左下角小地图：每个区域一张，区域之间有一张过渡图（见 flow.mjs 的 regionsOf）；读到哪个地点就显示哪一张，
  // 路线随阅读往前画，当前位置的标记移到当前读到的地点（地点在路线上走了多远，按最近的采样点量）
  interface MiniView { el: SVGSVGElement; route: SVGPathElement | null; here: SVGGElement | null; xy: Array<{ x: number; y: number }>; places: number[]; len: number; at: number[]; ppk: number }
  const viewData: { of: string[]; places: Record<string, number[]> } = JSON.parse(loc?.dataset.views ?? '{"of":[],"places":{}}');
  const miniViews = new Map<string, MiniView>();
  for (const el of loc?.querySelectorAll<SVGSVGElement>('svg.mini-v') ?? []) {
    const key = el.dataset.view!;
    miniViews.set(key, { el, route: el.querySelector('path.route-p'), here: el.querySelector('.here'), xy: JSON.parse(el.dataset.stops ?? '[]'), places: viewData.places[key] ?? [], len: 0, at: [], ppk: Number(el.dataset.ppk) || 1 });
  }
  /** 第一次显示时才量路线（display:none 的 SVG 量不出长度） */
  function prepare(v: MiniView) {
    if (v.len || !v.route) return;
    v.len = v.route.getTotalLength();
    const pts = Array.from({ length: 601 }, (_, i) => { const l = (v.len * i) / 600, p = v.route!.getPointAtLength(l); return [l, p.x, p.y] as const; });
    let from = 0;
    v.at = v.xy.map((s, k) => {
      if (k === 0) return 0;
      let best = Infinity, bl = 0, bi = from;
      for (let i = from; i < pts.length; i++) { const d = (pts[i][1] - s.x) ** 2 + (pts[i][2] - s.y) ** 2; if (d < best) { best = d; bl = pts[i][0]; bi = i; } }
      from = bi;
      return bl;
    });
    v.route.style.strokeDasharray = String(v.len);
    v.route.style.strokeDashoffset = String(v.len);
  }
  /**
   * 切换小地图的视图时做一次缩放过渡：两张图共有的那个地点（区域和过渡图总是共用一个地点）在屏幕上不动，
   * 旧图以它为中心放大（拉近）或缩小（拉远）并淡出，新图从相反的倍数缩放到原尺寸并淡入；倍数是两张图的比例尺之比。
   * 两张图没有共同的地点（比如跳着滚）就只淡入淡出。
   */
  let anims: Animation[] = [];
  function switchView(from: MiniView | null, to: MiniView) {
    for (const a of anims) a.cancel();
    anims = [];
    for (const v of miniViews.values()) if (v !== to && v !== from) v.el.classList.remove('on');
    to.el.classList.add('on');
    if (!from || from === to || reduce || !to.el.animate) { if (from && from !== to) from.el.classList.remove('on'); return; }
    const k = to.el.clientWidth / 1000; // 视图坐标 → 像素
    const shared = from.places.find((n) => to.places.includes(n));
    const pa = shared === undefined ? null : from.xy[from.places.indexOf(shared)], pb = shared === undefined ? null : to.xy[to.places.indexOf(shared)];
    const opt: KeyframeAnimationOptions = { duration: 1000, easing: 'cubic-bezier(.45,0,.2,1)' };
    if (!pa || !pb) {
      anims = [from.el.animate([{ opacity: 1 }, { opacity: 0 }], opt), to.el.animate([{ opacity: 0 }, { opacity: 1 }], opt)];
    } else {
      const s = clamp(to.ppk / from.ppk, 1 / 40, 40);
      const o = (p: { x: number; y: number }) => `${p.x * k}px ${p.y * k}px`;
      const d = `translate(${(pb.x - pa.x) * k}px,${(pb.y - pa.y) * k}px)`;
      anims = [
        from.el.animate([{ opacity: 1, transformOrigin: o(pa), transform: `${d} scale(1)` }, { opacity: 0, transformOrigin: o(pa), transform: `${d} scale(${s})` }], { ...opt, easing: 'cubic-bezier(.45,0,.9,.5)' }),
        to.el.animate([{ opacity: 0, transformOrigin: o(pb), transform: `scale(${1 / s})` }, { opacity: 1, transformOrigin: o(pb), transform: 'scale(1)' }], { ...opt, easing: 'cubic-bezier(.1,.5,.2,1)' }),
      ];
    }
    anims[0].onfinish = () => { if (from !== lastView) from.el.classList.remove('on'); };
  }
  let lastStop = -1, lastView: MiniView | null = null;
  function updateLoc() {
    if (!loc || !rbN || !rbName || !stops.length) return;
    const hr = hero.getBoundingClientRect(), er = end?.getBoundingClientRect();
    loc.classList.toggle('on', hr.bottom < innerHeight * 0.35 && (!er || er.top > innerHeight * 0.5));
    // 还没读到第一个地点时，当作在第一个地点
    const i = Math.min(stops.length - 1, Math.max(0, Number(current().dataset.place ?? 0)));
    if (i === lastStop) return;
    lastStop = i;
    rbN.textContent = `${pad(i + 1)} / ${pad(stops.length)}${stops[i].date ? ` · ${stops[i].date}` : ''}`;
    rbName.textContent = stops[i].name;
    const v = miniViews.get(viewData.of[i]);
    if (!v) return;
    if (lastView !== v) { switchView(lastView, v); lastView = v; }
    prepare(v); // 要先显示出来才量得出路线长度
    const k = v.places.indexOf(i);
    if (v.route && k >= 0 && v.xy[k]) {
      v.route.style.strokeDashoffset = String(v.len - v.at[k]);
      v.here!.style.transform = `translate(${v.xy[k].x}px,${v.xy[k].y}px)`;
    }
  }

  function tick() {
    if (!travel!.isConnected) { relayoutOnResize = null; return; }
    const m = mode();
    if (m === 'h') drive(tbody, track, progress);
    else if (m === 'm') for (const s of strips) drive(s, s.querySelector<XTrack>('.strip-track')!);
    updateLoc();
    snap = false;
    requestAnimationFrame(tick);
  }

  // 右下角的读法切换和左下角的小地图是液态玻璃（和页头一样）：高光、折射贴图按实际尺寸画，尺寸变了（地名换了）就重画
  const glassEls = [mc, loc].filter((x): x is HTMLElement => !!x);
  const lgDefs = document.querySelector('#lg-defs-t');
  let glassRaf = 0;
  const glass = () => {
    cancelAnimationFrame(glassRaf);
    glassRaf = requestAnimationFrame(() => {
      const refract = root.classList.contains('lg-refract');
      let f = '';
      glassEls.forEach((el, i) => {
        const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
        if (!w || !h) return;
        el.style.setProperty('--lg-spec', `url(${lgSpec(w, h)})`);
        if (refract) { el.style.setProperty('--lg-f', `url(#lg-f-t${i}) blur(4px) saturate(1.7) brightness(1.05)`); f += lgFilter(`lg-f-t${i}`, el); }
      });
      if (refract && lgDefs) lgDefs.innerHTML = f;
    });
  };
  const glassRo = new ResizeObserver(glass);
  glassEls.forEach((el) => glassRo.observe(el));
  glass();
  document.fonts?.ready.then(glass);

  layout();
  document.fonts?.ready.then(() => { layout(); snap = true; });
  addEventListener('load', () => { layout(); snap = true; }, { once: true });
  requestAnimationFrame(tick);
}

document.addEventListener('astro:page-load', init);
init();

export {}; // 这是一个模块（让顶层的 const / function 不进全局作用域）
