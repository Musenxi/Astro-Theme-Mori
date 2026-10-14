/** 网站图标（simple-icons，单色、跟随文字颜色）：键和 sites.mjs 的 brandOf 一致 */
import {
  siApplemusic, siBilibili, siBluesky, siCodesandbox, siDiscord, siDouban, siGithub, siGitlab, siInstagram, siMedium,
  siNeteasecloudmusic, siNpm, siReddit, siSinaweibo, siSpotify, siStackoverflow, siTelegram, siThreads, siV2ex,
  siWikipedia, siX, siXiaohongshu, siYoutube, siZhihu,
} from 'simple-icons';

const ICONS: Record<string, { path: string; title: string }> = {
  applemusic: siApplemusic, bilibili: siBilibili, bluesky: siBluesky, codesandbox: siCodesandbox, discord: siDiscord,
  douban: siDouban, github: siGithub, gitlab: siGitlab, instagram: siInstagram, medium: siMedium, netease: siNeteasecloudmusic,
  npm: siNpm, reddit: siReddit, weibo: siSinaweibo, spotify: siSpotify, stackoverflow: siStackoverflow, telegram: siTelegram,
  threads: siThreads, v2ex: siV2ex, wikipedia: siWikipedia, x: siX, xiaohongshu: siXiaohongshu, youtube: siYoutube, zhihu: siZhihu,
};

/** 图标的 <svg>；没有返回空字符串 */
export function brandSvg(name: string | null, className = '') {
  const icon = name ? ICONS[name] : undefined;
  if (!icon) return '';
  return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"${className ? ` class="${className}"` : ''}><path d="${icon.path}"/></svg>`;
}

export const brandTitle = (name: string | null) => (name ? ICONS[name]?.title ?? '' : '');
