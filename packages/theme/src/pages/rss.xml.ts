import type { APIRoute } from 'astro';
import config from 'virtual:mori/config';
import { getEntries } from '../lib/entries.ts';
import { siteUrl, xmlEscape } from '../lib/site.ts';

export const GET: APIRoute = async ({ site }) => {
  const base = siteUrl(site);
  const entries = await getEntries();
  const items = entries.slice(0, 30).map((e) => `  <item>
    <title>${xmlEscape(e.data.title)}</title>
    <link>${base}${e.href}</link>
    <guid isPermaLink="true">${base}${e.href}</guid>
    <pubDate>${e.data.date.toUTCString()}</pubDate>
    <category>${xmlEscape(e.category.zh)}</category>
    <description>${xmlEscape(e.data.excerpt)}</description>
  </item>`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${xmlEscape(config.title)}</title>
  <link>${base}/</link>
  <description>${xmlEscape(config.description || config.title)}</description>
  <language>zh-CN</language>
${items.join('\n')}
</channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
