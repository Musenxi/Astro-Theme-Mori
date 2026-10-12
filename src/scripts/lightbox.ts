/**
 * 看大图：图片从原位放大，原来的裁切（object-fit: cover 裁掉的部分）同步展开；Esc、点击或滚动时关闭，按原路缩回。
 * 同一页的图可以前后翻（圆钮、← →、窄屏左右滑），关的时候缩回当前这张在页面上的位置。
 * 有拍摄信息（img 的 data-exif，见 lib/exif.ts）的照片可以开关信息栏（按钮或 i 键），开关记在 localStorage；宽屏时图片跟着让位。
 * 实况照片在放大（或翻页）落定后给大图接上播放器，挪动时先藏起来，关的时候拆掉。
 * 事件挂在 document 上，只绑一次；每次都现查 #lb，因为换页后它是新节点。
 */
import { lgFilter, lgSpec } from './lg.ts';
import { t } from './i18n.ts';
import { attachLive, type LiveHandle } from './live.ts';
import { drawMap } from './photo-map.ts';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = matchMedia('(max-width: 760px)');
const EASE = 'cubic-bezier(.2,.75,.15,1)';
const SEL = '.blk img, .prose figure img';
let source: HTMLImageElement | null = null;
let list: HTMLImageElement[] = [];
let anim: Animation | null = null;
let busy = false;
let live: LiveHandle | undefined;
let liveTok = 0;

const $lb = () => document.querySelector<HTMLElement>('#lb')!;
const $img = () => $lb().querySelector<HTMLImageElement>('.lb-img')!;
const $ = <T extends Element = HTMLElement>(sel: string) => $lb().querySelector<T>(sel)!;
const isOpen = () => { const lb = $lb(); return !lb.hidden && lb.classList.contains('on'); };

/** 图注：编号（.mono）+ 文字 */
function captionOf(img: HTMLImageElement): [string, string] {
  const fc = img.closest('figure')?.querySelector('figcaption');
  if (!fc) return ['', ''];
  const n = fc.querySelector('.mono')?.textContent ?? '';
  const t = [...fc.childNodes]
    .filter((x) => !(x instanceof HTMLElement && x.classList.contains('mono')))
    .map((x) => x.textContent)
    .join('')
    .trim();
  return [n, t];
}

/** srcset 里最大的那一档：[地址, 宽度]（页面上加载的可能只是小尺寸，大图用它） */
function largest(img: HTMLImageElement): [string, number] {
  const last = img.srcset.split(',').map((s) => s.trim().split(/\s+/)).filter((p) => p[0]).pop();
  const w = last?.[1]?.endsWith('w') ? parseFloat(last[1]) : 0;
  return [last?.[0] ?? img.currentSrc ?? img.src, w || img.naturalWidth];
}

/** 大图在屏幕上占的尺寸：原尺寸压进舞台（#lb-stage 去掉内边距）和 1600px 宽。先把框定死，换更清晰的图时才不会跳 */
function fit(img: HTMLImageElement) {
  const lbImg = $img(), w = largest(img)[1];
  if (!img.naturalWidth || !w) { lbImg.style.width = lbImg.style.height = ''; return; }
  const stage = $('#lb-stage'), cs = getComputedStyle(stage);
  const sw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const sh = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const h = (w * img.naturalHeight) / img.naturalWidth;
  const k = Math.min(1, Math.min(sw, 1600) / w, sh / h);
  lbImg.style.width = `${w * k}px`;
  lbImg.style.height = `${h * k}px`;
}

/** 按信息栏现在的开关摆好图，图注对准图的中线（offset* 不受动画的 transform 影响，量的是落定后的位置） */
function layout(img: HTMLImageElement) {
  const lb = $lb(), on = lb.classList.contains('info') && lb.classList.contains('ex');
  $('#lb-i').setAttribute('aria-pressed', String(on));
  fit(img);
  const lbImg = $img();
  lb.style.setProperty('--pc', `${lbImg.offsetLeft + lbImg.offsetWidth / 2}px`);
}

/** 信息栏开着吗：记过就照记的，没记过宽屏开、窄屏关 */
const KEY = 'mori:lb-info';
function infoPref() {
  try { const v = localStorage.getItem(KEY); if (v) return v === '1'; } catch { /* 读不到就按默认 */ }
  return !narrow.matches;
}

/** 圆钮的玻璃：高光贴图，Chromium 里再加折射（几个钮一样大，共用一个滤镜） */
function glass() {
  const btns = [...$lb().querySelectorAll<HTMLElement>('.lg')].filter((el) => el.offsetWidth);
  if (!btns.length) return;
  const spec = `url(${lgSpec(Math.round(btns[0].offsetWidth), Math.round(btns[0].offsetHeight))})`;
  btns.forEach((el) => el.style.setProperty('--lg-spec', spec));
  if (!document.documentElement.classList.contains('lg-refract')) return;
  $('#lg-defs-lb').innerHTML = lgFilter('lg-f-lb', btns[0]);
  btns.forEach((el) => el.style.setProperty('--lg-f', 'url(#lg-f-lb) blur(4px) saturate(1.7) brightness(1.05)'));
}

// —— 信息栏 ——
interface Exif {
  camera?: string; lens?: string; focal?: number; focal35?: number; aperture?: number; shutter?: string; iso?: number;
  ev?: number; program?: number; metering?: number; wb?: number; flash?: boolean; time?: string; tz?: string;
  size?: [number, number]; hist?: [number[], number[], number[]]; gps?: [number, number]; alt?: number; map?: string;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = '') => Object.assign(document.createElement(tag), { className: cls, textContent: text });
/** 词条有就用，没有（不认识的编号）就不写这一行 */
const word = (key: string) => { const s = t(key); return s === key ? undefined : s; };

/** 一个大数：数字 + 小单位，下面一行名字 */
function figure(value: string, unit: string, label: string, pre = '') {
  const cell = el('div', '');
  const v = el('p', 'text-heading leading-none text-foreground [font-feature-settings:"tnum"]');
  if (pre) v.append(el('span', 'mr-0.5 text-aux text-soft-foreground', pre));
  v.append(value);
  if (unit) v.append(el('span', 'ml-0.5 text-aux text-soft-foreground', unit));
  cell.append(v, el('p', 'meta mt-2', label));
  return cell;
}

/** 位置图的框（地图本身等信息栏看得见时再画，见 showMap）；点开在 OpenStreetMap 看 */
function placeMap(e: Exif) {
  const [lng, lat] = e.gps!;
  const a = el('a', 'relative mt-3 block aspect-[16/10] overflow-hidden rounded-[10px] border border-(--glass-line) bg-background');
  a.href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
  a.target = '_blank';
  a.rel = 'noopener';
  a.id = 'lb-map';
  a.dataset.at = `${lng},${lat}`;
  a.setAttribute('aria-label', t('js.lb.place'));
  a.append(el('div', 'absolute inset-0 size-full')); // MapLibre 的样式会把容器改成 relative，靠 size-full 撑满
  // 拍摄地点：主题色的点，外面一圈底色描边和一圈淡晕
  a.append(el('span', 'pointer-events-none absolute top-1/2 left-1/2 size-7 -translate-1/2 rounded-[999px] bg-primary opacity-20'));
  a.append(el('span', 'pointer-events-none absolute top-1/2 left-1/2 size-3.5 -translate-1/2 rounded-[999px] border-2 border-background bg-primary shadow-[0_1px_3px_rgba(0,0,0,.35)]'));
  // 数据署名不占版面，放在悬停提示里
  a.title = '© OpenStreetMap · OpenFreeMap';
  return a;
}

/** 信息栏开着、这张有位置时才画地图（载入 MapLibre、下瓦片）；换图、关灯箱时拆掉 */
let unmap: (() => void) | undefined, mapFor: Element | null = null;
function hideMap() { unmap?.(); unmap = undefined; mapFor = null; }
function showMap() {
  const lb = $lb(), a = lb.querySelector<HTMLElement>('#lb-map');
  if (!a || a === mapFor || !lb.classList.contains('info') || !isOpen()) return;
  hideMap();
  mapFor = a;
  const at = a.dataset.at!.split(',').map(Number) as [number, number];
  drawMap(a.firstElementChild as HTMLElement, at).then((off) => { if (mapFor === a) unmap = off; else off(); }, () => {});
}

/** 直方图：红绿蓝三层细竖条叠着画（一格一根，条间留缝），重叠处按 --hist-blend 混色；背后三根横向淡刻度，底下一根基线 */
function histogram(svg: SVGSVGElement, hist?: Exif['hist']) {
  svg.replaceChildren();
  if (!hist?.length) return;
  const ns = 'http://www.w3.org/2000/svg', n = hist[0].length, W = n * 2, H = 64, bar = 1.3;
  const node = (tag: string, a: Record<string, string | number>) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v));
    return e;
  };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  for (const y of [H / 4, H / 2, (H * 3) / 4]) svg.append(node('line', { x1: 0, x2: W, y1: y, y2: y, stroke: 'currentColor', 'stroke-opacity': '.14', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
  const g = node('g', { style: 'isolation:isolate' });
  hist.forEach((bins, k) => {
    const d = bins.map((b, i) => { const h = (b / 99) * H; return h > 0 ? `M${i * 2 + 0.35},${H}h${bar}v${(-h).toFixed(2)}h${-bar}Z` : ''; }).join('');
    g.append(node('path', { d, fill: `var(--hist-${'rgb'[k]})`, style: 'fill-opacity:var(--hist-o);mix-blend-mode:var(--hist-blend)' }));
  });
  svg.append(g);
  svg.append(node('line', { x1: 0, x2: W, y1: H, y2: H, stroke: 'currentColor', 'stroke-opacity': '.45', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
}

function fillInfo(img: HTMLImageElement) {
  const lb = $lb();
  hideMap();
  let e: Exif | null = null;
  try { e = img.dataset.exif ? JSON.parse(img.dataset.exif) : null; } catch { /* 坏数据就当没有 */ }
  lb.classList.toggle('ex', !!e);
  $('#lb-cam').textContent = e?.camera ?? '';
  $('#lb-lens').textContent = e?.lens ?? '';

  const par: HTMLElement[] = [];
  const focal = e?.focal35 ?? e?.focal;
  if (focal) par.push(figure(String(focal), 'mm', t('js.lb.focal')));
  if (e?.aperture) par.push(figure(String(e.aperture), '', t('js.lb.aperture'), 'ƒ/'));
  if (e?.shutter) par.push(figure(e.shutter, 's', t('js.lb.shutter')));
  if (e?.iso) par.push(figure(String(e.iso), '', t('js.lb.iso')));
  $('#lb-par').replaceChildren(...par);
  histogram($<SVGSVGElement>('#lb-hist'), e?.hist);

  const ev = e?.ev ? `${e.ev > 0 ? '+' : '−'}${Math.abs(e.ev)} EV` : undefined; // 0 EV 不写
  const deg = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
  const sections: [string, [string, string | undefined][], HTMLElement?][] = [
    [t('js.lb.shot'), [
      [t('js.lb.time'), e?.time && (e.tz ? `${e.time}  UTC${e.tz.replace(/:00$/, '').replace(/^([+-])0/, '$1')}` : e.time)],
      [t('js.lb.ev'), ev],
      [t('js.lb.program'), e?.program ? word(`js.lb.prog${e.program}`) : undefined],
      [t('js.lb.metering'), e?.metering ? word(`js.lb.meter${e.metering}`) : undefined],
      [t('js.lb.wb'), e?.wb === undefined ? undefined : word(`js.lb.wb${e.wb}`)],
      [t('js.lb.flash'), e?.flash === undefined ? undefined : t(`js.lb.flash${e.flash ? 1 : 0}`)],
    ]],
    [t('js.lb.place'), [
      [t('js.lb.coords'), e?.gps && `${deg(e.gps[1], 'N', 'S')}  ${deg(e.gps[0], 'E', 'W')}`],
      [t('js.lb.alt'), e?.alt === undefined ? undefined : `${e.alt} m`],
    ], e?.gps ? placeMap(e) : undefined],
    [t('js.lb.file'), [
      [t('js.lb.size'), e?.size && `${e.size[0]} × ${e.size[1]}`],
      [t('js.lb.pixels'), e?.size && `${Math.round((e.size[0] * e.size[1]) / 1e6)} MP`],
    ]],
  ];
  $('#lb-rows').replaceChildren(...sections.flatMap(([title, rows, extra]) => {
    const have = rows.filter((r): r is [string, string] => !!r[1]);
    if (!have.length && !extra) return [];
    const sec = el('section', 'mt-8');
    const dl = el('dl', extra ? 'mt-3' : 'mt-2');
    for (const [k, v] of have) {
      const row = el('div', 'flex items-baseline justify-between gap-6 border-t border-(--glass-line) py-2.5');
      row.append(el('dt', 'meta shrink-0', k), el('dd', 'm-0 text-right text-aux text-foreground [font-feature-settings:"tnum"] whitespace-pre', v));
      dl.append(row);
    }
    sec.append(el('h3', 'meta m-0 text-soft-foreground', title));
    if (extra) sec.append(extra);
    sec.append(dl);
    return [sec];
  }));
}

/** 图注、第几张、信息、前后钮 */
function fillMeta(img: HTMLImageElement) {
  const [n, cap] = captionOf(img);
  $('#lb-n').textContent = n;
  $('#lb-t').textContent = cap;
  const i = list.indexOf(img);
  $('#lb-k').textContent = list.length > 1 ? `${i + 1} / ${list.length}` : '';
  $<HTMLButtonElement>('#lb-prev').disabled = i <= 0;
  $<HTMLButtonElement>('#lb-next').disabled = i < 0 || i >= list.length - 1;
  fillInfo(img);
}

/** 在页面上看得见的图（游记换了读法，藏起来的那一版里的图不算） */
const visibleImages = () => [...document.querySelectorAll<HTMLImageElement>(SEL)].filter((im) => im.getClientRects().length);

function flip(img: HTMLImageElement, back: boolean) {
  const lbImg = $img();
  lbImg.getAnimations().forEach((a) => a.cancel());
  const r = img.getBoundingClientRect(), t = lbImg.getBoundingClientRect();
  const nw = img.naturalWidth || t.width, nh = img.naturalHeight || t.height;
  const s = Math.max(r.width / nw, r.height / nh) / (t.width / nw);
  const dx = r.left + r.width / 2 - (t.left + t.width / 2), dy = r.top + r.height / 2 - (t.top + t.height / 2);
  const ix = Math.max(0, (t.width - r.width / s) / 2), iy = Math.max(0, (t.height - r.height / s) / 2);
  const from = { transform: `translate(${dx}px,${dy}px) scale(${s})`, clipPath: `inset(${iy}px ${ix}px)` };
  const to = { transform: 'none', clipPath: 'inset(0px 0px)' };
  return lbImg.animate(back ? [to, from] : [from, to], { duration: back ? 440 : 600, easing: EASE, fill: 'both' });
}

/** 先用页面上已经加载好的那张顶上；更清晰的图在后台取，到了再换 */
function upgrade(img: HTMLImageElement, first: string) {
  const [big] = largest(img);
  if (big === first) return;
  const hi = new Image();
  hi.src = big;
  hi.decode().then(() => { if (source === img && !$lb().hidden) $img().src = big; }, () => {});
}

/** 实况照片：大图落定后接上播放器（照片用最大那张）；挪动或换图前先拆 */
function liveOff() {
  liveTok++;
  live?.destroy();
  live = undefined;
  delete $img().dataset.live;
}
function liveOn(img: HTMLImageElement) {
  const lbImg = $img(), video = img.dataset.live;
  if (!video || !isOpen() || source !== img) return;
  lbImg.dataset.live = video;
  lbImg.dataset.liveOn = ''; // 别让 live.ts 换页时再给它接一个
  if (img.dataset.photoTime) lbImg.dataset.photoTime = img.dataset.photoTime; else delete lbImg.dataset.photoTime;
  const tok = ++liveTok;
  attachLive(lbImg, largest(img)[0]).then((h) => {
    if (tok !== liveTok || !isOpen() || source !== img) return h?.destroy();
    live = h;
    // 点开时鼠标本来就在图上，不会再有“移入”：直接放一次
    if (h && lbImg.matches(':hover')) h.play();
  });
}

async function open(img: HTMLImageElement) {
  const lb = $lb(), lbImg = $img();
  source = img;
  list = visibleImages();
  const first = img.currentSrc || largest(img)[0];
  lbImg.src = first;
  lbImg.alt = img.alt;
  fillMeta(img);
  lb.classList.toggle('info', infoPref());
  // 灯箱先别显示：解码完再显示，并且在同一帧里起动画、藏原图，中间不会露出一帧“已经放大”的图
  await lbImg.decode().catch(() => {});
  if (source !== img) return;
  lb.hidden = false;
  layout(img); // 舞台要显示出来才量得到
  glass();
  void lb.offsetWidth;
  lb.classList.add('on');
  showMap();
  img.style.visibility = 'hidden';
  anim = reduce ? null : flip(img, false);
  if (anim) anim.finished.then(() => liveOn(img), () => {}); else liveOn(img);
  upgrade(img, first);
}

/** 翻到前一张 / 后一张：旧的往一边淡出，新的从另一边淡入；页面在后面滚到新的那张，关的时候缩回它 */
async function go(d: number) {
  if (!isOpen() || busy || !source) return;
  const next = list[list.indexOf(source) + d];
  if (!next) return;
  busy = true;
  liveOff();
  const lbImg = $img(), first = next.currentSrc || largest(next)[0];
  const pre = new Image();
  pre.src = first;
  const ready = pre.decode().catch(() => {});
  lbImg.getAnimations().forEach((a) => a.cancel());
  anim = null;
  if (!reduce) await lbImg.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-d * 28}px)` }], { duration: 160, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
  await ready;
  if (!isOpen()) { busy = false; return; }
  source.style.visibility = '';
  source = next;
  next.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  next.style.visibility = 'hidden';
  lbImg.src = first;
  lbImg.alt = next.alt;
  fillMeta(next);
  layout(next);
  showMap();
  lbImg.getAnimations().forEach((a) => a.cancel());
  if (reduce) liveOn(next);
  else lbImg.animate([{ opacity: 0, transform: `translateX(${d * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE }).finished.then(() => liveOn(next), () => {});
  upgrade(next, first);
  busy = false;
}

/** 开关信息栏：宽屏时图片从原来的位置挪到让位后的位置（只动 transform，不重新裁切） */
function toggleInfo(force?: boolean) {
  const lb = $lb(), lbImg = $img();
  if (!isOpen() || !lb.classList.contains('ex') || !source) return;
  const on = force ?? !lb.classList.contains('info');
  if (on === lb.classList.contains('info')) return;
  const r0 = lbImg.getBoundingClientRect();
  lbImg.getAnimations().forEach((a) => a.cancel());
  anim = null;
  lb.classList.toggle('info', on);
  showMap();
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* 存不了就只管这一次 */ }
  layout(source);
  const r1 = lbImg.getBoundingClientRect();
  if (reduce || (Math.abs(r0.width - r1.width) < 1 && Math.abs(r0.left - r1.left) < 1)) return live?.place();
  const s = r0.width / r1.width;
  const dx = r0.left + r0.width / 2 - (r1.left + r1.width / 2), dy = r0.top + r0.height / 2 - (r1.top + r1.height / 2);
  // 实况播放器不跟着 transform 走：挪动时先藏起来，落定后摆好再显示
  lb.classList.add('mv');
  const settle = () => { live?.place(); lb.classList.remove('mv'); };
  lbImg.animate([{ transform: `translate(${dx}px,${dy}px) scale(${s})` }, { transform: 'none' }], { duration: 550, easing: EASE }).finished.then(settle, settle);
}

function close() {
  const lb = $lb();
  if (!isOpen()) return;
  lb.classList.remove('on', 'mv');
  hideMap();
  liveOff();
  const img = source!;
  const done = () => { lb.hidden = true; img.style.visibility = ''; anim = null; $img().getAnimations().forEach((a) => a.cancel()); };
  if (reduce) return done();
  // 还在放大的路上就关：从当前位置原路退回，不要先跳到终点再缩
  if (anim && anim.playState === 'running') anim.reverse();
  else anim = flip(img, true);
  anim.finished.then(done, done);
}

// 窄屏左右滑翻页；滑过之后紧跟着的那次点击不算（不然会关掉）
let touch: { x: number; y: number } | null = null, swiped = false;
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch' || !isOpen() || (e.target as Element).closest('#lb-info, button')) return;
  touch = { x: e.clientX, y: e.clientY };
});
document.addEventListener('pointerup', (e) => {
  if (!touch) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  touch = null;
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) { swiped = true; setTimeout(() => (swiped = false), 400); go(dx < 0 ? 1 : -1); }
});

document.addEventListener('click', (e) => {
  const el = e.target as Element;
  if (el.closest('#lb')) {
    if (swiped) return;
    if (el.closest('#lb-i')) return toggleInfo();
    if (el.closest('#lb-x')) return close();
    if (el.closest('#lb-prev')) return void go(-1);
    if (el.closest('#lb-next')) return void go(1);
    if (el.closest('#lb-info')) return; // 信息栏里的字可以选
    // 窄屏信息栏盖在图上：点外面先收起它
    if (narrow.matches && $lb().classList.contains('info') && $lb().classList.contains('ex')) return toggleInfo(false);
    return close();
  }
  const img = el.closest<HTMLImageElement>(SEL);
  if (!img) return;
  e.preventDefault();
  open(img);
});
addEventListener('keydown', (e) => {
  if (!isOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  else if (e.key === 'i' || e.key === 'I') toggleInfo();
});
addEventListener('wheel', (e) => {
  if ($lb().hidden || (e.target as Element).closest?.('#lb-info')) return;
  e.preventDefault();
  close();
}, { passive: false });
addEventListener('resize', () => { if (!$lb().hidden && source) layout(source); });
// 换页时直接收起，不留半开的遮罩
document.addEventListener('astro:before-swap', () => { source && (source.style.visibility = ''); });

export {}; // 这是一个模块（让顶层的 const / function 不进全局作用域）
