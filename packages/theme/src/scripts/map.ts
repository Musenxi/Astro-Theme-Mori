/**
 * 地图进场（spec §4）：路线从起点画到终点，站点和标签随路线依次出现，只播一次。
 * 几何都是构建时算好的（data-t 是这个站点沿路线走了多远，0–1）；没有脚本时地图直接完整显示。
 */
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const D = 2600, EASE = 'cubic-bezier(.45,0,.2,1)';

function prepare(svg: SVGSVGElement) {
  const route = svg.querySelector<SVGPathElement>('path[data-route]');
  const dots = [...svg.querySelectorAll<SVGCircleElement>('circle.dot')];
  const labs = [...svg.querySelectorAll<SVGGElement>('g.lab')];
  if (!route) return () => {};
  const len = route.getTotalLength();
  route.style.strokeDasharray = String(len);
  route.style.strokeDashoffset = String(len);
  dots.forEach((d) => (d.style.opacity = '0'));
  labs.forEach((l) => (l.style.opacity = '0'));
  return () => {
    route.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: D, easing: EASE, fill: 'both', delay: 350 });
    dots.forEach((d) => {
      const t = 350 + D * +(d.dataset.t ?? 0) * 0.92;
      d.animate([{ opacity: 0, r: 0 }, { opacity: 1, r: 7 }], { duration: 420, delay: t, fill: 'both', easing: 'cubic-bezier(.3,1.6,.5,1)' });
    });
    labs.forEach((l) => {
      const t = 350 + D * +(l.dataset.t ?? 0) * 0.92;
      l.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: t + 80, fill: 'both', easing: 'ease-out' });
    });
  };
}

function init() {
  if (reduce) return;
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    (e.target as any)._play?.();
  }), { threshold: 0.3 });
  document.querySelectorAll<SVGSVGElement>('svg.map[data-map="hero"], svg.map[data-map="block"]').forEach((svg) => {
    if ((svg as any)._play) return;
    (svg as any)._play = prepare(svg);
    io.observe(svg);
  });
}

document.addEventListener('astro:page-load', init);
init();

export {}; // 这是一个模块（让顶层的 const / function 不进全局作用域）
