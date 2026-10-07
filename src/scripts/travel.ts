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
import { zoomPath, tileFit, type Cam } from '../lib/fly.ts';
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
  const blocks = [...travel.querySelectorAll<HTMLElement>('.t-track .blk')];
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

  // 行程表：点某个地点，滚到正文里标着它的那一块（横向读法下换算成横轴位置）
  travel.querySelector('.itin')?.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a');
    if (!a) return;
    e.preventDefault();
    let b = document.getElementById(a.getAttribute('href')!.slice(1))?.closest<HTMLElement>('.blk') ?? null;
    // 一列在横滚和竖滚里渲染了两份：标着地点的那份可能正藏着，滚到显示着的那份
    if (b && b.offsetParent === null) b = [b.nextElementSibling, b.previousElementSibling].find((x): x is HTMLElement => x instanceof HTMLElement && x.classList.contains('blk') && x.offsetParent !== null) ?? b;
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

  // 左下角小地图（见 MiniMap.astro）：所有图层在同一个墨卡托坐标里，镜头停在当前地点所在的区域。
  // 读到下一个地点时，当前位置的标记沿路线走过去、路线跟在后面画出来；换了区域，镜头就沿平滑缩放路径飞过去
  // （fly.ts：先拉远、边移边飞、再拉近），陆地按镜头的远近在几层精度之间交接。飞到一半又换了地点，就从半路接着飞。
  const mini = loc?.querySelector<SVGSVGElement>('svg[data-map="mini"]');
  const cams: Cam[] = JSON.parse(mini?.dataset.cams ?? '[]');
  const spots: Array<[number, number, number, number]> = JSON.parse(mini?.dataset.places ?? '[]'); // x、y、区域、沿路线走了多远
  const total = Number(mini?.dataset.len ?? 0);
  const camG = mini?.querySelector<SVGGElement>('.cam'), here = mini?.querySelector<SVGGElement>('.here');
  const routeP = mini?.querySelector<SVGPathElement>('.route-p');
  // 图层：细的在前（最后一层最粗，总是兜底）
  const tileBox: Cam[] = JSON.parse(mini?.dataset.tiles ?? '[]');
  const tiles = Array.from(mini?.querySelectorAll<SVGGElement>('.tile') ?? [], (el, n) => ({ el, cam: tileBox[n], o: -1 })).reverse();
  let cam: Cam = cams[0] ?? [0, 0, 1], walked = 0, flight = 0;

  function drawMini() {
    if (!mini) return;
    const [cx, cy, cw] = cam, z = 1000 / cw;
    camG!.setAttribute('transform', `matrix(${z} 0 0 ${z} ${500 - cx * z} ${360 - cy * z})`);
    mini.style.setProperty('--u', `${cw / (mini.clientWidth || 60)}px`); // 一个屏幕像素是多少全局单位：路线粗细不随缩放变
    routeP?.style.setProperty('stroke-dashoffset', String(total - walked));
    const p = routeP && walked > 0 ? routeP.getPointAtLength(walked) : { x: spots[0][0], y: spots[0][1] };
    here!.setAttribute('transform', `translate(${500 + (p.x - cx) * z} ${360 + (p.y - cy) * z})`);
    // 从细到粗依次分配：合用的细图层在上面；交接时两层都不透明（同色的陆地叠着看不出来），中途不会变淡
    let rest = 1;
    tiles.forEach((t, n) => {
      const a = rest * (n === tiles.length - 1 ? 1 : tileFit(t.cam, cam, 0.72));
      rest -= a;
      const o = Math.round(Math.min(1, 2 * a) * 100) / 100;
      if (o !== t.o) { t.o = o; t.el.style.opacity = String(o); t.el.style.display = o ? '' : 'none'; }
    });
  }

  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  /** 框住第 a 到第 b 个地点的镜头（跳着读、一次跨过好几区时，先拉远看一眼这一段） */
  function overview(a: number, b: number): Cam {
    const s = spots.slice(Math.min(a, b), Math.max(a, b) + 1), xs = s.map((p) => p[0]), ys = s.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return [(x0 + x1) / 2, (y0 + y1) / 2, (Math.max(x1 - x0, (y1 - y0) / 0.72) / 0.84) * 1.15];
  }

  /** 去第 i 个地点：同一区里只走路线，换区时镜头一起飞，标记沿路线走、离画面中间不远；路越远飞得越久，但不拖沓 */
  function goTo(i: number, from: number) {
    const spot = spots[i];
    if (!mini || !spot) return;
    cancelAnimationFrame(flight);
    const to = cams[spot[2]], w0 = walked, w1 = spot[3];
    if (from < 0 || reduce) { cam = to; walked = w1; drawMini(); return; }
    // 中间跳过了别的区域：经过一个能看到这一整段的镜头
    const skipped = spots.slice(Math.min(from, i) + 1, Math.max(from, i)).some((p) => p[2] !== spot[2] && p[2] !== spots[from][2]);
    const legs = skipped ? [zoomPath(cam, overview(from, i)), zoomPath(overview(from, i), to)] : [zoomPath(cam, to)];
    const S = legs.reduce((n, l) => n + l.S, 0), split = S ? legs[0].S / S : 0;
    const ms = clamp(700 + S * 260, 900, 2400), t0 = performance.now();
    const step = (time: number) => {
      const t = Math.min(1, (time - t0) / ms);
      cam = legs.length === 1 ? legs[0].at(ease(t)) : t < split ? legs[0].at(ease(t / split)) : legs[1].at(ease((t - split) / (1 - split)));
      // 标记跟着镜头走；跳着读时等镜头拉远了再走这一整段，镜头拉近之前走完
      walked = w0 + (w1 - w0) * (legs.length === 1 ? legs[0].pan(ease(t)) : ease(clamp((t - 0.6 * split) / (0.4 * split + 0.4 * (1 - split)), 0, 1)));
      drawMini();
      if (t < 1) flight = requestAnimationFrame(step);
    };
    flight = requestAnimationFrame(step);
  }

  let lastStop = -1;
  function updateLoc() {
    if (!loc || !rbN || !rbName || !stops.length) return;
    const hr = hero.getBoundingClientRect(), er = end?.getBoundingClientRect();
    loc.classList.toggle('on', hr.bottom < innerHeight * 0.35 && (!er || er.top > innerHeight * 0.5));
    // 还没读到第一个地点时，当作在第一个地点
    const i = Math.min(stops.length - 1, Math.max(0, Number(current().dataset.place ?? 0)));
    if (i === lastStop) return;
    goTo(i, lastStop);
    lastStop = i;
    rbN.textContent = `${pad(i + 1)} / ${pad(stops.length)}${stops[i].date ? ` · ${stops[i].date}` : ''}`;
    rbName.textContent = stops[i].name;
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
