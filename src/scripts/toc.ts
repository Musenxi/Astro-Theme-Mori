/**
 * 文章目录（PostToc.astro）：滚动时标出当前读到的那一节；跨栏大图、旁注经过目录所在的位置时，目录先隐去，免得叠在上面。
 * 点目录平滑滚到小标题（小标题的 scroll-margin 和目录的 top 相同，滚到后两者齐平）。
 */
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let stop: (() => void) | undefined;

function init() {
  stop?.();
  stop = undefined;
  const toc = document.querySelector<HTMLElement>('[data-toc]');
  const list = toc?.querySelector('ol');
  if (!toc || !list) return;
  const links = [...list.querySelectorAll<HTMLAnchorElement>('a')];
  const heads = links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))));
  const blocks = [...document.querySelectorAll<HTMLElement>('article figure:not(.inline), article aside')];

  let raf = 0;
  const update = () => {
    raf = 0;
    const r = list.getBoundingClientRect();
    // 当前一节：最后一个已经滚过视口上部 40% 的小标题；滚到页底时算最后一节
    const line = Math.max(r.top + 24, innerHeight * 0.4);
    let cur = -1;
    heads.forEach((h, i) => { if (h && h.getBoundingClientRect().top <= line) cur = i; });
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2 && heads.at(-1)!.getBoundingClientRect().top < innerHeight) cur = heads.length - 1;
    links.forEach((a, i) => (i === cur ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));
    list.classList.toggle('off', blocks.some((f) => { const b = f.getBoundingClientRect(); return b.top < r.bottom + 24 && b.bottom > r.top - 24; }));
  };
  const onScroll = () => { raf ||= requestAnimationFrame(update); };
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element).closest('a');
    const h = a && heads[links.indexOf(a)];
    if (!h) return;
    e.preventDefault();
    h.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(history.state, '', a.hash);
  };

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  list.addEventListener('click', onClick);
  update();
  stop = () => {
    removeEventListener('scroll', onScroll);
    removeEventListener('resize', onScroll);
    cancelAnimationFrame(raf);
  };
}
document.addEventListener('astro:page-load', init);
document.addEventListener('astro:before-swap', () => { stop?.(); stop = undefined; });

export {}; // 这是一个模块（让顶层的 const / function 不进全局作用域）
