import type { APIRoute } from 'astro';
import { getImage } from 'astro:assets';
import config from 'virtual:mori/config';
import { getEntries } from '../lib/entries.ts';
import { siteUrl, xmlEscape } from '../lib/site.ts';
import { postHtml, travelHtml } from '../lib/feed-html.ts';

/**
 * RSS 2.0。同一份内容挂在 /feed 和 /rss.xml 两个地址上（订阅地址是 /feed）。
 * feed.content 是 'full' 时，每篇多一段 content:encoded 放全文；description 始终是摘要。
 */
export const GET: APIRoute = async ({ site }) => {
  const base = siteUrl(site);
  const entries = (await getEntries()).slice(0, 30);
  const full = config.feed?.content === 'full'; // ?. ：开发服务器没重启过、还在用旧的配置解析时，也不要 500
  const ctx = {
    base,
    // 订阅里的图不能太大：缩到 1200 宽的 jpeg，并换成绝对地址
    image: async (src: any) => { const im = await getImage({ src, width: 1200, format: 'jpeg' }); return im.src.startsWith('/') ? base + im.src : im.src; },
  };
  const bodies = full ? await Promise.all(entries.map((e) => (e.kind === 'post' ? postHtml(e.data as any, ctx) : travelHtml(e.data as any, ctx)))) : [];
  // 每篇的 guid 是文章的固定网址（isPermaLink="true"）：读者的阅读器靠它判断“读过没有”，所以只要网址不变它就不变
  const items = entries.map((e, i) => `  <item>
    <title>${xmlEscape(e.data.title)}</title>
    <link>${base}${e.href}</link>
    <guid isPermaLink="true">${base}${e.href}</guid>
    <pubDate>${e.data.date.toUTCString()}</pubDate>
    <category>${xmlEscape(e.category.zh)}</category>
    <description>${xmlEscape(e.data.excerpt)}</description>${full ? `\n    <content:encoded><![CDATA[${bodies[i].replaceAll(']]>', ']]]]><![CDATA[>')}]]></content:encoded>` : ''}
  </item>`);
  // 频道更新时间取最新一篇的修改（或发布）时间，不用构建时间——否则每次构建阅读器都以为有更新
  const latest = entries.reduce((t, e) => Math.max(t, (e.data.updated ?? e.data.date).getTime()), 0);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
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
