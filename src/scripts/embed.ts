/** 视频卡片：点封面才换成播放器（之前不向视频网站发请求，除了封面图） */
document.addEventListener('click', (e) => {
  const btn = (e.target as Element).closest?.<HTMLButtonElement>('.embed-video [data-player]');
  if (!btn) return;
  const f = document.createElement('iframe');
  f.src = btn.dataset.player!;
  f.className = 'aspect-video w-full rounded-[8px] border-0 bg-muted';
  f.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
  f.allowFullscreen = true;
  f.title = btn.getAttribute('aria-label') ?? '';
  btn.replaceWith(f);
});
