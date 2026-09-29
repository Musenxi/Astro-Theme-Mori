/**
 * 首页：点左侧目录换篇（交叉溶解）；进场动画只在第一次打开首页时播；目次的栏目标题进入视口时画开下划线。
 * 换篇只有点击和目录里的上下方向键；不钉住、不跟滚动联动、不自动轮播。
 */
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
let played = false;

function init() {
  const fo = document.querySelector<HTMLElement>('#fo');
  if (!fo || fo.dataset.ready) return;
  fo.dataset.ready = '1';
  const slides = [...fo.querySelectorAll<HTMLElement>('.fo-slide')];
  const items = [...fo.querySelectorAll<HTMLLIElement>('.fo-more li')];
  const no = fo.querySelector<HTMLElement>('#fo-no')!;
  const cat = fo.querySelector<HTMLElement>('#fo-cat')!;
  const stage = fo.querySelector<HTMLElement>('#fo-stage')!;
  let cur = 0;

  function go(i: number) {
    const prev = cur;
    cur = clamp(i, 0, slides.length - 1);
    if (cur === prev) return;
    slides.forEach((el, k) => {
      el.classList.remove('on', 'enter', 'out');
      if (k === cur) el.classList.add('on', 'enter');
      else if (k === prev) {
        el.classList.add('out');
        setTimeout(() => el.classList.remove('out'), 700);
      }
      el.inert = k !== cur;
    });
    items.forEach((li, k) => (k === cur ? li.setAttribute('aria-current', 'true') : li.removeAttribute('aria-current')));
    no.textContent = slides[cur].dataset.no!;
    cat.textContent = slides[cur].dataset.cat!;
    if (!reduce) for (const el of [no, cat]) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 650, easing: 'cubic-bezier(.22,1,.36,1)' });
  }

  // 手机上目录在图下面：换篇时如果图已经滚出屏幕，就把图滚回来
  function pick(k: number) {
    go(k);
    const r = stage.getBoundingClientRect();
    if (r.top < -r.height * 0.35) scrollTo({ top: scrollY + r.top - (innerWidth > 760 ? 80 : 0), behavior: reduce ? 'auto' : 'smooth' });
  }

  const more = fo.querySelector<HTMLElement>('#fo-more');
  more?.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button');
    if (b) pick(+b.dataset.i!);
  });
  more?.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const k = clamp(cur + (e.key === 'ArrowDown' ? 1 : -1), 0, slides.length - 1);
    pick(k);
    more.querySelectorAll('button')[k].focus();
  });

  // 进场（第一次打开）：图从上往下展开，引文逐字洇开，细线画开，最后出现篇名等信息
  if (!reduce && !played) fo.classList.add('play');
  played = true;

  // 点目次里的栏目标题：这一个标题带上过渡名（同一页只能有一个），进栏目页后从原位移到页顶
  document.querySelectorAll<HTMLElement>('.f-sh').forEach((a) => a.addEventListener('click', () => {
    document.querySelectorAll<HTMLElement>('.f-sh h3').forEach((h) => (h.style.viewTransitionName = ''));
    a.querySelector<HTMLElement>('h3')!.style.viewTransitionName = 'cat-title';
  }));

  // 目次：栏目标题的细线在进入视口时画开
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.2 });
  document.querySelectorAll('.f-sec').forEach((s) => io.observe(s));
}

document.addEventListener('astro:page-load', init);
init();

export {}; // 这是一个模块（让顶层的 const / function 不进全局作用域）
