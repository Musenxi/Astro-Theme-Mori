import type { APIRoute } from 'astro';
import config from 'virtual:mori/config';
import { getEntries } from '../lib/entries.ts';
import { getPages } from '../lib/pages.ts';
import { siteUrl } from '../lib/site.ts';

export const GET: APIRoute = async ({ site }) => {
  const base = siteUrl(site);
  const entries = await getEntries();
  const fixed = ['/', '/posts/', '/archive/', ...config.categories.map((c) => `/category/${c.id}/`)];
  const pages = await getPages();
  const urls = [
    ...fixed.map((u) => `  <url><loc>${base}${u}</loc></url>`),
    ...pages.map((p) => `  <url><loc>${base}/${p.id}/</loc></url>`),
    ...entries.map((e) => `  <url><loc>${base}${e.href}</loc><lastmod>${(e.data.updated ?? e.data.date).toISOString().slice(0, 10)}</lastmod></url>`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
