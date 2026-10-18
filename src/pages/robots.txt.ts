import type { APIRoute } from 'astro';
import config from 'virtual:mori/config';
import { siteUrl } from '../lib/site.ts';

// 没填网址时不写 Sitemap：本地地址对搜索引擎没用
export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\n${config.site || site ? `\nSitemap: ${siteUrl(site)}/sitemap.xml\n` : ''}`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
