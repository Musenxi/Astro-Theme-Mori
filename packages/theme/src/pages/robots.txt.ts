import type { APIRoute } from 'astro';
import { siteUrl } from '../lib/site.ts';

export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${siteUrl(site)}/sitemap.xml\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
