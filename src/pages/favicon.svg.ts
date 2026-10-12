import type { APIRoute } from 'astro';
import config from 'virtual:mori/config';
import { DEFAULT_ICON, isPresetIcon } from '../lib/site-icon.mjs';

/** 站点图标的预设（mori.config.ts 的 icon）；用的是自己的图片时，页面直接链接那张图，这里给默认的 */
const svgs = import.meta.glob<string>('../icons/*.svg', { query: '?raw', import: 'default', eager: true });

export const GET: APIRoute = () =>
  new Response(svgs[`../icons/${isPresetIcon(config.icon) ? config.icon : DEFAULT_ICON}.svg`], { headers: { 'Content-Type': 'image/svg+xml' } });
