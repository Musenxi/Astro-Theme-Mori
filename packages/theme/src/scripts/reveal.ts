/** 图片进入视口时轻微展开，只播一次（spec §4）。`.rv` 的初始状态在 CSS 里 */
function init() {
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.12 });
  document.querySelectorAll('.rv:not(.in)').forEach((el) => io.observe(el));
}
document.addEventListener('astro:page-load', init);
init();
