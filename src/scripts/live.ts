/**
 * 实况照片（img[data-live]）用 Apple 的 LivePhotosKit JS 播放：页面上有实况照片才去 Apple 的 CDN 载入它。
 * 播放器放在图片后面、绝对定位盖住图片，按图片的 object-fit 放大后由外层裁切（LivePhotosKit 自己只会完整显示、留边），
 * “LIVE”标记挪到看得见的左上角。播放器不接鼠标，点击照样落到图片上（灯箱）；鼠标移上去（触屏是长按）播放，移开收尾。
 */
interface Player extends HTMLElement {
  photoSrc: string;
  videoSrc: string;
  photoTime?: number | null;
  proactivelyLoadsVideo: boolean;
  playbackStyle: string;
  video?: HTMLVideoElement | null;
  isPlaying: boolean;
  play(): void;
  stop(): void;
  beginFinishingPlaybackEarly(): void;
  updateSize(w: number, h: number): void;
}
interface Kit {
  Player(el?: HTMLElement): Player;
  PlaybackStyle: { FULL: string };
}
declare global { interface Window { LivePhotosKit?: Kit } }

const LPK = 'https://cdn.apple-livephotoskit.com/lpk/1/livephotoskit.js';
let lib: Promise<Kit> | undefined;
const kit = () =>
  (lib ??= new Promise<Kit>((ok, fail) => {
    if (window.LivePhotosKit) return ok(window.LivePhotosKit);
    const s = document.createElement('script');
    s.src = LPK;
    s.async = true;
    s.onload = () => (window.LivePhotosKit ? ok(window.LivePhotosKit) : fail(new Error('LivePhotosKit')));
    s.onerror = () => { lib = undefined; fail(new Error('LivePhotosKit')); };
    document.head.append(s);
  }));

/** 把外框放到图片的位置（只用 offset*，不受祖先 transform 影响），播放器按 object-fit / object-position 摆在框里 */
function layout(img: HTMLImageElement, box: HTMLElement, player: Player) {
  const cs = getComputedStyle(img);
  box.style.left = box.style.top = '0px';
  box.style.left = `${img.offsetLeft - box.offsetLeft}px`;
  box.style.top = `${img.offsetTop - box.offsetTop}px`;
  box.style.width = cs.width;
  box.style.height = cs.height;
  box.style.borderRadius = cs.borderRadius;
  if (cs.zIndex !== 'auto') box.style.zIndex = cs.zIndex;
  const w = parseFloat(cs.width), h = parseFloat(cs.height);
  const ar = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : w / h;
  let pw = w, ph = h;
  if (cs.objectFit === 'cover') { pw = Math.max(w, h * ar); ph = pw / ar; }
  else if (cs.objectFit === 'contain' || cs.objectFit === 'scale-down') { pw = Math.min(w, h * ar); ph = pw / ar; }
  const [fx, fy] = cs.objectPosition.split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
  const x = (w - pw) * fx, y = (h - ph) * fy;
  player.style.left = `${x}px`;
  player.style.top = `${y}px`;
  player.style.setProperty('--vx', `${Math.max(0, -x)}px`);
  player.style.setProperty('--vy', `${Math.max(0, -y)}px`);
  player.updateSize(pw, ph);
}

function bind(img: HTMLImageElement, Kit: Kit) {
  const box = document.createElement('div');
  box.className = 'live-box';
  box.setAttribute('aria-hidden', 'true');
  const player = Kit.Player();
  box.append(player);
  img.after(box);

  const time = Number(img.dataset.photoTime) || undefined;
  // 换视频时 LivePhotosKit 会清掉 photoTime，视频载入后再设一次；没记时间点就取视频中间
  const setTime = () => { player.photoTime = time ?? (player.video?.duration ? player.video.duration / 2 : player.photoTime); };
  player.addEventListener('videoload', setTime);
  player.proactivelyLoadsVideo = true;
  player.photoSrc = img.currentSrc || img.src;
  player.videoSrc = img.dataset.live!;
  setTime();

  const place = () => layout(img, box, player);
  place();
  new ResizeObserver(place).observe(img);
  addEventListener('resize', place);

  const play = () => { player.playbackStyle = Kit.PlaybackStyle.FULL; player.play(); };
  const end = () => { if (player.isPlaying) player.beginFinishingPlaybackEarly(); };
  img.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') play(); });
  img.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') end(); });
  // 触屏：按住 0.3 秒开始放，松手收尾
  let hold = 0;
  img.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') hold = window.setTimeout(play, 300); });
  for (const type of ['pointerup', 'pointercancel'] as const) img.addEventListener(type, (e) => { if (e.pointerType !== 'mouse') { clearTimeout(hold); end(); } });
  img.addEventListener('contextmenu', (e) => { if (player.isPlaying) e.preventDefault(); });
}

/** 图片快进入视口时才建播放器（会预先下载视频） */
let io: IntersectionObserver | undefined;
function init() {
  io?.disconnect();
  const imgs = [...document.querySelectorAll<HTMLImageElement>('img[data-live]:not([data-live-on])')];
  if (!imgs.length) return;
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const img = e.target as HTMLImageElement;
      io!.unobserve(img);
      img.dataset.liveOn = '';
      const go = () => kit().then((Kit) => bind(img, Kit), () => { /* 载不到 LivePhotosKit 就只显示照片 */ });
      if (img.complete) go(); else img.addEventListener('load', go, { once: true });
    }
  }, { rootMargin: '50%' });
  for (const img of imgs) io.observe(img);
}
document.addEventListener('astro:page-load', init);

export {};
