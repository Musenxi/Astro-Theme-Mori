/**
 * 文章目录（PostToc.astro）：滚动时标出当前读到的那一节；跨栏大图、旁注经过目录所在的位置时，目录先隐去，免得叠在上面。
 * 点目录平滑滚到小标题（小标题的 scroll-margin 和目录的 top 相同，滚到后两者齐平）。
 * 窄屏：右下角的圆钮读到正文时才出来，点开弹出同一份目录；点外面、按 Esc、点了某一节都收起。
 */
import { glassButtons, lgFilter, lgSpec } from './lg.ts';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let stop: (() => void) | undefined;

function init() {
  stop?.();
  stop = undefined;
  const toc = document.querySelector<HTMLElement>('[data-toc]');
  const side = toc?.querySelector<HTMLOListElement>('ol');
  if (!toc || !side) return;
  const btn = document.querySelector<HTMLButtonElement>('[data-toc-btn]')!;
  const pop = document.querySelector<HTMLElement>('[data-toc-pop]')!;
  const shade = document.querySelector<HTMLElement>('[data-toc-shade]')!;
  const defs = document.querySelector('[data-toc-defs]');
  const lists = [side, pop.querySelector<HTMLOListElement>('ol')!];
  const links = lists.map((l) => [...l.querySelectorAll<HTMLAnchorElement>('a')]);
  const body = toc.parentElement!;
  const mc = document.querySelector<HTMLElement>('#mc');
  // 长卷版式里同一个标题可能因读法不同渲染两份（一份藏着），取显示着的那份；每次现取，读法切换后也对
  const headOf = (a: HTMLAnchorElement) => {
    const all = [...document.querySelectorAll<HTMLElement>(`[id="${CSS.escape(decodeURIComponent(a.hash.slice(1)))}"]`)];
    return all.find((e) => e.offsetParent !== null) ?? all[0] ?? null;
  };
  const blocks = [...document.querySelectorAll<HTMLElement>('article figure:not(.inline), article aside')];

  // 主题色那段移到当前一节；目录比屏幕高、自己能滚时，把当前一节滚进来
  let cur = -2;
  const mark = (list: HTMLOListElement, as: HTMLAnchorElement[], snap = false) => {
    const a = as[cur];
    list.classList.toggle('snap', snap);
    list.classList.toggle('mark', !!a);
    if (!a) return;
    list.style.setProperty('--y', `${a.offsetTop}px`);
    list.style.setProperty('--h', `${a.offsetHeight}px`);
    if (list.scrollHeight > list.clientHeight) {
      const top = a.offsetTop - list.clientHeight / 2 + a.offsetHeight / 2;
      list.scrollTo({ top, behavior: snap || reduce ? 'auto' : 'smooth' });
    }
  };

  let raf = 0;
  const update = () => {
    raf = 0;
    const r = side.getBoundingClientRect();
    // 当前一节：最后一个已经滚过视口上部 40% 的小标题；滚到页底时算最后一节
    const line = Math.max((r.height ? r.top : innerHeight * 0.15) + 24, innerHeight * 0.4);
    const heads = links[0].map(headOf);
    let c = -1;
    heads.forEach((h, i) => { if (h && h.getBoundingClientRect().top <= line) c = i; });
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2 && (heads.at(-1)?.getBoundingClientRect().top ?? Infinity) < innerHeight) c = heads.length - 1;
    if (c !== cur) {
      const first = cur === -2;
      cur = c;
      links.forEach((as, k) => {
        as.forEach((a, i) => (i === c ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));
        if (r.height || k) mark(lists[k], as, first);
      });
    }
    if (r.height) side.classList.toggle('off', blocks.some((f) => { const b = f.getBoundingClientRect(); return b.top < r.bottom + 24 && b.bottom > r.top - 24; }));
    // 窄屏的圆钮：正文占着屏幕中线时才出来
    const br = body.getBoundingClientRect();
    btn.classList.toggle('on', br.top < innerHeight * 0.5 && br.bottom > innerHeight * 0.5);
    if (!btn.classList.contains('on') && pop.classList.contains('open')) close();
  };
  const onScroll = () => { raf ||= requestAnimationFrame(update); };

  // 长卷里右下角已经有读法切换：圆钮叠在它上面，中线对齐
  const place = () => {
    if (!mc) return;
    const m = mc.getBoundingClientRect();
    btn.style.right = `${innerWidth - m.right + (m.width - btn.offsetWidth) / 2}px`;
    btn.style.bottom = `${innerHeight - m.top + 10}px`;
  };
  const glass = () => {
    glassButtons([btn], defs, 'lg-f-toc');
    const w = Math.round(pop.offsetWidth), h = Math.round(pop.offsetHeight), rad = 20;
    if (!w || !h) return;
    pop.style.setProperty('--lg-spec', `url(${lgSpec(w, h, rad)})`);
    if (!document.documentElement.classList.contains('lg-refract') || !defs) return;
    defs.insertAdjacentHTML('beforeend', lgFilter('lg-f-tocp', pop, rad));
    pop.style.backdropFilter = 'url(#lg-f-tocp) blur(16px) saturate(1.7) brightness(1.05)';
  };

  const open = () => {
    const b = btn.getBoundingClientRect();
    pop.style.right = `${innerWidth - b.right}px`;
    pop.style.setProperty('--toc-pop-b', `${innerHeight - b.top + 10}px`);
    pop.classList.add('open');
    shade.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    glass();
    mark(lists[1], links[1], true);
    links[1][Math.max(cur, 0)]?.focus({ preventScroll: true });
  };
  function close() {
    pop.classList.remove('open');
    shade.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }
  const onBtn = () => (pop.classList.contains('open') ? close() : open());
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && pop.classList.contains('open')) { close(); btn.focus(); } };
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element).closest('a');
    const i = a ? links.findIndex((as) => as.includes(a)) : -1;
    const h = a && i >= 0 && headOf(links[i][links[i].indexOf(a)]);
    if (!h) return;
    e.preventDefault();
    close();
    h.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(history.state, '', a.hash);
  };
  const onResize = () => { place(); cur = -2; onScroll(); if (pop.classList.contains('open')) open(); };

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onResize);
  addEventListener('keydown', onKey);
  lists.forEach((l) => l.addEventListener('click', onClick));
  btn.addEventListener('click', onBtn);
  shade.addEventListener('click', close);
  place();
  update();
  glassButtons([btn], defs, 'lg-f-toc');
  stop = () => {
    removeEventListener('scroll', onScroll);
    removeEventListener('resize', onResize);
    removeEventListener('keydown', onKey);
    cancelAnimationFrame(raf);
  };
}
document.addEventListener('astro:page-load', init);
document.addEventListener('astro:before-swap', () => { stop?.(); stop = undefined; });
