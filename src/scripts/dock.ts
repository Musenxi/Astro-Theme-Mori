/**
 * 文章页右下角（PostDock.astro）：回到顶部、点赞。
 * 这一列叠在目录圆钮（读到正文才出来）和读法切换上面，它们出来、收起时跟着挪。
 * 点赞记在自建评论服务里，一位读者一篇只算一次，再点取消；先改界面，服务回来的数为准。
 */
import { lgFilter, lgSpec } from './lg.ts';
import { visitor } from './stats.ts';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const GAP = 10;
let stop: (() => void) | undefined;

function init() {
  stop?.();
  stop = undefined;
  const dock = document.querySelector<HTMLElement>('#dock');
  if (!dock) return;
  const top = dock.querySelector<HTMLButtonElement>('[data-top]')!;
  const like = dock.querySelector<HTMLButtonElement>('[data-like]');
  const defs = dock.querySelector('[data-dock-defs]');
  const below = [document.querySelector<HTMLElement>('#mc'), document.querySelector<HTMLElement>('[data-toc-btn]')].filter((x): x is HTMLElement => !!x);

  // 底下有显示着的控件就叠在它上面；按它停稳时的位置算（目录圆钮出场时有位移，不用 getBoundingClientRect）
  const place = () => {
    let y = 0, r = 0;
    for (const el of below) {
      if (!el.offsetWidth || (el.matches('[data-toc-btn]') && !el.classList.contains('on'))) continue;
      const cs = getComputedStyle(el), b = parseFloat(cs.bottom) + el.offsetHeight + GAP;
      if (b > y) { y = b; r = parseFloat(cs.right) + (el.offsetWidth - dock.offsetWidth) / 2; } // 和底下那颗竖着对齐
    }
    if (y) { dock.style.setProperty('--dock-b', `${y}px`); dock.style.right = `${r}px`; }
    else { dock.style.removeProperty('--dock-b'); dock.style.right = ''; }
  };

  let raf = 0;
  const onScroll = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => top.classList.toggle('on', scrollY > innerHeight * 0.5));
  };
  const onResize = () => { place(); onScroll(); };
  const mo = new MutationObserver(place);
  below.forEach((el) => mo.observe(el, { attributes: true, attributeFilter: ['class', 'style'] }));

  // 液态玻璃：高光、折射按每颗的实际尺寸画
  const glass = () => {
    const refract = document.documentElement.classList.contains('lg-refract');
    let f = '';
    [top, like].forEach((el, i) => {
      if (!el?.offsetWidth) return;
      el.style.setProperty('--lg-spec', `url(${lgSpec(el.offsetWidth, el.offsetHeight, 19.5)})`);
      if (refract) { el.style.setProperty('--lg-f', `url(#lg-f-dock${i}) blur(4px) saturate(1.7) brightness(1.05)`); f += lgFilter(`lg-f-dock${i}`, el, 19.5); }
    });
    if (refract && defs) defs.innerHTML = f;
  };
  const ro = new ResizeObserver(glass);
  [top, like].forEach((el) => el && ro.observe(el));

  const onTop = () => scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  top.addEventListener('click', onTop);

  if (like) {
    const b = document.body.dataset, base = (b.stats ?? '').replace(/\/$/, ''), entry = b.entry ?? '';
    const n = like.querySelector<HTMLElement>('[data-n]')!;
    let count = 0, liked = false, seq = 0;
    const show = () => {
      like.setAttribute('aria-pressed', String(liked));
      n.textContent = count ? count.toLocaleString() : '';
    };
    const got = (d: any) => {
      if (typeof d?.likes !== 'number') return;
      count = d.likes; liked = !!d.liked; show();
      like.hidden = false;
    };
    if (base && entry) {
      fetch(`${base}/likes?entry=${encodeURIComponent(entry)}&visitor=${visitor()}`).then((r) => r.json()).then((d) => like.isConnected && got(d)).catch(() => {});
    }
    // 不带 Content-Type：浏览器当作 text/plain 发，跨域不用预检
    like.addEventListener('click', async () => {
      liked = !liked; count = Math.max(0, count + (liked ? 1 : -1)); show();
      like.classList.remove('pop');
      if (liked && !reduce) { void like.offsetWidth; like.classList.add('pop'); }
      const me = ++seq;
      try {
        const r = await fetch(`${base}/likes`, { method: 'POST', body: JSON.stringify({ entry, visitor: visitor(), liked }) });
        const d = await r.json();
        if (me === seq && like.isConnected) got(d); // 连点时只认最后一次
      } catch {}
    });
  }

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onResize);
  place();
  onScroll();
  glass();
  document.fonts?.ready.then(glass);
  stop = () => {
    removeEventListener('scroll', onScroll);
    removeEventListener('resize', onResize);
    cancelAnimationFrame(raf);
    mo.disconnect();
    ro.disconnect();
  };
}

document.addEventListener('astro:page-load', init);
document.addEventListener('astro:before-swap', () => { stop?.(); stop = undefined; });
