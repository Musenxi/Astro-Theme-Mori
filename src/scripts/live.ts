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
  updateSize(w?: number, h?: number): void;
}
interface Kit {
  augmentElementAsPlayer(el: HTMLElement): Player;
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
  // 尺寸要写在元素上，LivePhotosKit 量的是元素自己的大小（为 0 就不渲染）
  player.style.width = `${pw}px`;
  player.style.height = `${ph}px`;
  player.style.setProperty('--vx', `${Math.max(0, -x)}px`);
  player.style.setProperty('--vy', `${Math.max(0, -y)}px`);
  player.updateSize(pw, ph);
}

export interface LiveHandle { place(): void; play(): void; destroy(): void }

/** 给一张图接上播放器；photo 是播放器显示的照片（不给就用图片当前那张）。destroy 拆掉播放器和所有监听 */
function bind(img: HTMLImageElement, Kit: Kit, photo?: string): LiveHandle {
  const ac = new AbortController(), on = { signal: ac.signal };
  const box = document.createElement('div');
  box.className = 'live-box';
  box.setAttribute('aria-hidden', 'true');
  const el = document.createElement('div');
  el.style.width = `${img.offsetWidth}px`; // 先给个尺寸，不然创建时 LivePhotosKit 会警告宽高为 0；准确的位置和大小由 layout 摆
  el.style.height = `${img.offsetHeight}px`;
  box.append(el);
  img.after(box);
  const player = Kit.augmentElementAsPlayer(el);

  const time = Number(img.dataset.photoTime) || undefined;
  // 换视频时 LivePhotosKit 会清掉 photoTime，视频载入后再设一次；没记时间点就取视频中间
  const setTime = () => { player.photoTime = time ?? (player.video?.duration ? player.video.duration / 2 : player.photoTime); };
  player.addEventListener('videoload', setTime, on);
  player.proactivelyLoadsVideo = true;
  player.photoSrc = photo ?? (img.currentSrc || img.src);
  player.videoSrc = img.dataset.live!;
  setTime();

  const place = () => layout(img, box, player);
  place();
  const ro = new ResizeObserver(place);
  ro.observe(img);
  addEventListener('resize', place, on);

  const play = () => { player.playbackStyle = Kit.PlaybackStyle.FULL; player.play(); };
  const end = () => { if (player.isPlaying) player.beginFinishingPlaybackEarly(); };
  img.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') play(); }, on);
  img.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') end(); }, on);
  // 触屏：按住 0.3 秒开始放，松手收尾
  let hold = 0;
  img.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') hold = window.setTimeout(play, 300); }, on);
  for (const type of ['pointerup', 'pointercancel'] as const) img.addEventListener(type, (e) => { if (e.pointerType !== 'mouse') { clearTimeout(hold); end(); } }, on);
  img.addEventListener('contextmenu', (e) => { if (player.isPlaying) e.preventDefault(); }, on);

  return {
    place,
    play,
    destroy() {
      ac.abort();
      ro.disconnect();
      clearTimeout(hold);
      try { player.stop(); } catch { /* 还没载好 */ }
      box.remove();
    },
  };
}

/** 看大图时给大图接播放器（scripts/lightbox.ts 用）：载不到 LivePhotosKit 就是 undefined，只显示照片 */
export function attachLive(img: HTMLImageElement, photo?: string): Promise<LiveHandle | undefined> {
  return kit().then((Kit) => bind(img, Kit, photo), () => undefined);
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
