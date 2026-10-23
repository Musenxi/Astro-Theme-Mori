/**
 * 正文里的视频（components/Video.astro）：露出一半时静音自动播放，离开屏幕就停；
 * 右下角的按钮开关声音（打开一个，别的都静音）；点画面暂停 / 接着放，读者自己停下的不再自动放。
 * 系统设了“减少动态”的不自动放，点了才放。横卷里的视频跟着轨道移动，IntersectionObserver 照样算得对
 */
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let io: IntersectionObserver | null = null;

function sound(v: HTMLVideoElement, on: boolean) {
  v.muted = !on;
  const b = v.parentElement?.querySelector<HTMLButtonElement>('[data-sound]');
  if (!b) return;
  b.setAttribute('aria-pressed', String(on));
  b.setAttribute('aria-label', (on ? b.dataset.mute : b.dataset.unmute) ?? '');
  b.querySelector('[data-on]')?.classList.toggle('hidden', !on);
  b.querySelector('[data-off]')?.classList.toggle('hidden', on);
}

function init() {
  io?.disconnect();
  const vids = [...document.querySelectorAll<HTMLVideoElement>('video[data-vid]')];
  if (!vids.length) return;
  io = new IntersectionObserver((es) => {
    for (const e of es) {
      const v = e.target as HTMLVideoElement;
      if (e.intersectionRatio >= 0.5) { if (!reduce && !v.dataset.held) v.play().catch(() => {}); }
      else if (!v.paused) v.pause();
    }
  }, { threshold: [0, 0.5] });
  for (const v of vids) {
    io.observe(v);
    v.addEventListener('click', () => {
      if (v.paused) { delete v.dataset.held; v.play().catch(() => {}); }
      else { v.dataset.held = '1'; v.pause(); }
    });
    v.parentElement?.querySelector('[data-sound]')?.addEventListener('click', () => {
      const on = v.muted;
      if (on) for (const o of vids) if (o !== v) sound(o, false);
      sound(v, on);
      if (on && v.paused) { delete v.dataset.held; v.play().catch(() => {}); }
    });
  }
}

document.addEventListener('astro:page-load', init);
