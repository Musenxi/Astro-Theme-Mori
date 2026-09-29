import type { APIRoute } from 'astro';
import config from 'virtual:mori/config';
import { getEntries } from '../lib/entries.ts';
import { siteUrl, xmlEscape } from '../lib/site.ts';

/** RSS 2.0。同一份内容挂在 /feed 和 /rss.xml 两个地址上（订阅地址是 /feed） */
export const GET: APIRoute = async ({ site }) => {
  const base = siteUrl(site);
  const entries = (await getEntries()).slice(0, 30);
  // 每篇的 guid 是文章的固定网址（isPermaLink="true"）：读者的阅读器靠它判断“读过没有”，所以只要网址不变它就不变
  const items = entries.map((e) => `  <item>
    <title>${xmlEscape(e.data.title)}</title>
    <link>${base}${e.href}</link>
    <guid isPermaLink="true">${base}${e.href}</guid>
    <pubDate>${e.data.date.toUTCString()}</pubDate>
    <category>${xmlEscape(e.category.zh)}</category>
    <description>${xmlEscape(e.data.excerpt)}</description>
  </item>`);
  // 频道更新时间取最新一篇的修改（或发布）时间，不用构建时间——否则每次构建阅读器都以为有更新
  const latest = entries.reduce((t, e) => Math.max(t, (e.data.updated ?? e.data.date).getTime()), 0);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${xmlEscape(config.title)}</title>
  <link>${base}/</link>
  <atom:link href="${base}/feed" rel="self" type="application/rss+xml" />
  <description>${xmlEscape(config.description || config.title)}</description>
  <language>${xmlEscape(config.lang)}</language>
${latest ? `  <lastBuildDate>${new Date(latest).toUTCString()}</lastBuildDate>\n` : ''}${items.join('\n')}
</channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
