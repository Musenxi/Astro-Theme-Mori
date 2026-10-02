import type { APIRoute } from 'astro';
import { getEntries } from '../lib/entries.ts';
import { placesOf } from '../lib/flow.mjs';
import { numDate } from '../lib/zh.ts';

/** 站内搜索的索引：标题、分类、摘要、正文前 1200 字。构建时生成，浏览器里直接查 */
function bodyText(node: unknown, out: string[]) {
  if (Array.isArray(node)) node.forEach((n) => bodyText(n, out));
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.t === 'string') out.push(o.t);
    for (const [k, v] of Object.entries(o)) if (k !== 'src' && typeof v === 'object') bodyText(v, out);
  }
}

export const GET: APIRoute = async () => {
  const entries = await getEntries();
  const index = entries.map((e) => {
    const d: any = e.data, parts: string[] = [];
    bodyText(d.blocks, parts);
    // 地点的英文名正文里没有，单独放进索引
    parts.push(...placesOf(d.blocks).flatMap((p: any) => (p.en ? [` ${p.en} `] : [])));
    return { t: d.title, s: d.subtitle ?? '', u: e.href, c: e.category.zh, d: numDate(d.date), e: d.excerpt, x: parts.join('').slice(0, 1200) };
  });
  return new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
