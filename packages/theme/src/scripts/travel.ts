/**
 * 游记的三种读法（spec §3.2）：竖向 / 混合 / 横向，读者在右下角切换并被记住；横滚方向由作者按篇设定。
 * 横向不劫持滚轮：页面仍是原生竖向滚动，横移由 position:sticky + transform 实现（触控板、键盘、滚动条都能用）。
 *  - 竖向（v）：一路往下；横向图组是可以左右滑动的一行。
 *  - 混合（m）：一路往下；横向图组钉住，由竖向滚动驱动横移。
 *  - 横向（h）：整篇排进横轴，竖向滚动驱动整条轨道横移。
 * 切换读法时回到当前站点的开头，不丢阅读位置。
 */
type Mode = 'v' | 'h' | 'm';
const NAME: Record<Mode, string> = { v: '竖向', h: '横向', m: '混合' };
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
  const loc = document.querySelector<HTMLElement>('#loc')!;
  const allowed = (mc?.dataset.modes?.split(',') ?? [travel.dataset.mode!]) as Mode[];
  const stops: Array<{ id: string; name: string; date: string }> = JSON.parse(loc.dataset.stops ?? '[]');
  const stopIndex = new Map(stops.map((s, i) => [s.id, i]));
  const rtl = () => travel.dataset.dir === 'rtl';
  const vw = () => root.clientWidth;
  const mode = () => travel.dataset.mode as Mode;
  let snap = true;

  // 读者上次的选择；不在允许范围内就用作者的默认值
  const saved = store.get('mori-mode') as Mode | null;
  if (saved && allowed.includes(saved)) travel.dataset.mode = saved;

  function layout() {
    const m = mode();
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
    mc.querySelector('#mc-tip')!.textContent = `读法：${NAME[m]}`;
  }

  function setMode(m: Mode) {
    if (mode() === m) return;
    const cur = tbody.getBoundingClientRect().top < innerHeight * 0.5 ? current() : null;
    const anchor = cur && blocks.find((b) => b.dataset.stop === cur.dataset.stop);
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

  // 行程表：点某一站，滚到这一站的第一块（横向读法下换算成横轴位置）
  travel.querySelector('.itin')?.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a');
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute('href')!.replace('#stop-', '');
    const b = blocks.find((x) => x.dataset.stop === id);
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

  const hero = travel.querySelector('.t-hero')!, end = travel.querySelector('.t-end')!;
  const rbN = loc.querySelector<HTMLElement>('#rb-n')!, rbName = loc.querySelector<HTMLElement>('#rb-name')!;
  let lastStop = -1;
  function updateLoc() {
    const hr = hero.getBoundingClientRect(), er = end.getBoundingClientRect();
    loc.classList.toggle('on', hr.bottom < innerHeight * 0.35 && er.top > innerHeight * 0.5);
    const i = stopIndex.get(current().dataset.stop!) ?? 0;
    if (i === lastStop) return;
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

  layout();
  document.fonts?.ready.then(() => { layout(); snap = true; });
  addEventListener('load', () => { layout(); snap = true; }, { once: true });
  requestAnimationFrame(tick);
}

document.addEventListener('astro:page-load', init);
init();
