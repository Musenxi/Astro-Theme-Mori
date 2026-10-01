/**
 * 看大图：图片从原位放大，原来的裁切（object-fit: cover 裁掉的部分）同步展开；Esc、点击或滚动时关闭，按原路缩回。
 * 事件挂在 document 上，只绑一次；每次都现查 #lb，因为换页后它是新节点。
 */
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let source: HTMLImageElement | null = null;

const $lb = () => document.querySelector<HTMLElement>('#lb')!;
const $img = () => $lb().querySelector<HTMLImageElement>('.lb-img')!;

/** 图注：编号（.mono）+ 文字；横向图组里的左右钮不算 */
function captionOf(img: HTMLImageElement): [string, string] {
  const fc = img.closest('figure')?.querySelector('figcaption');
  if (!fc) return ['', ''];
  const n = fc.querySelector('.mono')?.textContent ?? '';
  const t = [...fc.childNodes]
    .filter((x) => !(x instanceof HTMLElement && (x.classList.contains('mono') || x.classList.contains('strip-ctl'))))
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

/** 大图在屏幕上占的尺寸：原尺寸压进 88vw / 1600px 宽、78vh 高（和 CSS 的上限一致）。先把框定死，换更清晰的图时才不会跳 */
function fit(img: HTMLImageElement, w: number) {
  const lbImg = $img();
  if (!img.naturalWidth || !w) { lbImg.style.width = lbImg.style.height = ''; return; }
  const h = (w * img.naturalHeight) / img.naturalWidth;
  const k = Math.min(1, Math.min(document.documentElement.clientWidth * 0.88, 1600) / w, innerHeight * 0.78 / h);
  lbImg.style.width = `${w * k}px`;
  lbImg.style.height = `${h * k}px`;
}

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
  return lbImg.animate(back ? [to, from] : [from, to], { duration: back ? 440 : 600, easing: 'cubic-bezier(.2,.75,.15,1)', fill: 'both' });
}

let anim: Animation | null = null;

async function open(img: HTMLImageElement) {
  const lb = $lb(), lbImg = $img();
  source = img;
  const [big, bigW] = largest(img);
  // 先用页面上已经加载好的那张顶上，点下去立刻放大；更清晰的图在后台取，到了再换
  const first = img.currentSrc || big;
  fit(img, bigW);
  lbImg.src = first;
  lbImg.alt = img.alt;
  const [n, t] = captionOf(img);
  lb.querySelector('#lb-n')!.textContent = n;
  lb.querySelector('#lb-t')!.textContent = t;
  // 灯箱先别显示：解码完再显示，并且在同一帧里起动画、藏原图，中间不会露出一帧“已经放大”的图
  await lbImg.decode().catch(() => {});
  if (source !== img) return;
  lb.hidden = false;
  void lb.offsetWidth;
  lb.classList.add('on');
  img.style.visibility = 'hidden';
  anim = reduce ? null : flip(img, false);
  if (big !== first) {
    const hi = new Image();
    hi.src = big;
    hi.decode().then(() => { if (source === img && !lb.hidden) lbImg.src = big; }, () => {});
  }
}

function close() {
  const lb = $lb();
  if (lb.hidden || !lb.classList.contains('on')) return;
  lb.classList.remove('on');
  const img = source!;
  const done = () => { lb.hidden = true; img.style.visibility = ''; anim = null; $img().getAnimations().forEach((a) => a.cancel()); };
  if (reduce) return done();
  // 还在放大的路上就关：从当前位置原路退回，不要先跳到终点再缩
  if (anim && anim.playState === 'running') anim.reverse();
  else anim = flip(img, true);
  anim.finished.then(done, done);
}

document.addEventListener('click', (e) => {
  const el = e.target as Element;
  if (el.closest('#lb')) return close();
  const img = el.closest<HTMLImageElement>('.blk img, .prose figure img');
  if (!img) return;
  e.preventDefault();
  open(img);
});
addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
addEventListener('wheel', (e) => { if (!$lb().hidden) { e.preventDefault(); close(); } }, { passive: false });
// 换页时直接收起，不留半开的遮罩
document.addEventListener('astro:before-swap', () => { source && (source.style.visibility = ''); });

export {}; // 这是一个模块（让顶层的 const / function 不进全局作用域）
