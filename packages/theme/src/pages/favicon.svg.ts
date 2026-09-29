import type { APIRoute } from 'astro';
import config from 'virtual:mori/config';

/** 站点图标：一个主题色的方块里一个“M”。浏览器标签页里看，够认出来就行 */
export const GET: APIRoute = () =>
  new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="${config.accent}"/><text x="16" y="23" text-anchor="middle" font-family="Georgia,serif" font-size="20" fill="#f3f0e9">M</text></svg>`,
    { headers: { 'Content-Type': 'image/svg+xml' } },
  );
