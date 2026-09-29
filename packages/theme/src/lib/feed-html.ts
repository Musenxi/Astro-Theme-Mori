/**
 * RSS 里的全文：把文章 / 游记的块转成一段自包含的 HTML（放进 content:encoded）。
 * 和站内页面不同：链接和图片都要是绝对地址；旁注和脚注没有页内锚点可跳，统一成 [1] 这样的编号，文末列出正文。
 */
import type { Inline, Mark, PostData, TravelData } from '../content/schema.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface FeedCtx {
  /** 站点根地址，不带结尾斜杠 */
  base: string;
  /** 把内容里的图片（Astro 的 ImageMetadata）变成可以放进订阅的绝对图片地址 */
  image: (src: any) => Promise<string>;
}

/** 收集所有 note / fn 引用，按出现顺序统一编号（旁注和脚注不再分开数） */
function numberRefs(blocks: unknown): Map<string, number> {
  const nums = new Map<string, number>();
  const walk = (n: unknown) => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object') {
      const o = n as Record<string, unknown>;
      if ((o.type === 'note' || o.type === 'fn') && typeof o.ref === 'string' && !nums.has(o.ref)) nums.set(o.ref, nums.size + 1);
      Object.values(o).forEach(walk);
    }
  };
  walk(blocks);
  return nums;
}

/** 空段落（Studio 里新建块时留下的）不放进订阅 */
const keep = (h: string) => h !== '' && h !== '<p></p>';

const abs = (base: string, href: string) => (href.startsWith('/') ? base + href : href);

function wrap(html: string, m: Mark, base: string, nums: Map<string, number>): string {
  switch (m.type) {
    case 'em': return `<em>${html}</em>`;
    case 'strong': return `<strong>${html}</strong>`;
    case 'code': return `<code>${html}</code>`;
    case 'tcy': return html;
    case 'link': return `<a href="${esc(abs(base, m.href))}">${html}</a>`;
    case 'note':
    case 'fn': return `${html}<sup>[${nums.get(m.ref) ?? '?'}]</sup>`;
  }
}

export const inline = (spans: Inline, base: string, nums: Map<string, number>) =>
  spans.map((s) => (s.marks ?? []).reduceRight((h, m) => wrap(h, m, base, nums), esc(s.t).replace(/\n/g, '<br />'))).join('');

async function figure(ctx: FeedCtx, src: unknown, alt: string, caption?: string) {
  return `<figure><img src="${esc(await ctx.image(src))}" alt="${esc(alt)}" />${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>`;
}

const notesHtml = (notes: Record<string, { text: Inline }>, nums: Map<string, number>, base: string) => {
  const rows = [...nums].filter(([ref]) => notes[ref]).map(([ref, n]) => `<p>[${n}] ${inline(notes[ref].text, base, nums)}</p>`);
  return rows.length ? `<hr />\n${rows.join('\n')}` : '';
};

export async function postHtml(d: PostData, ctx: FeedCtx): Promise<string> {
  const nums = numberRefs(d.blocks);
  const out: string[] = [];
  for (const b of d.blocks) {
    switch (b.type) {
      case 'p': out.push(`<p>${inline(b.text, ctx.base, nums)}</p>`); break;
      case 'h': out.push(`<h${b.level}>${inline(b.text, ctx.base, nums)}</h${b.level}>`); break;
      case 'quote': out.push(`<blockquote><p>${inline(b.text, ctx.base, nums)}</p>${b.cite ? `<p>—— ${esc(b.cite)}</p>` : ''}</blockquote>`); break;
      case 'image': out.push(await figure(ctx, b.src, b.alt, b.caption)); break;
      case 'list': {
        const tag = b.ordered ? 'ol' : 'ul';
        out.push(`<${tag}>${b.items.map((it) => `<li>${inline(it, ctx.base, nums)}</li>`).join('')}</${tag}>`);
        break;
      }
      case 'code': out.push(`<pre><code>${esc(b.code)}</code></pre>`); break;
    }
  }
  return [...out, notesHtml(d.notes, nums, ctx.base)].filter(keep).join('\n');
}

export async function travelHtml(d: TravelData, ctx: FeedCtx): Promise<string> {
  const nums = numberRefs(d.blocks);
  const out: string[] = [];
  if (d.facts.length) out.push(`<ul>${d.facts.map((f) => `<li><strong>${esc(f.label)}</strong>：${esc(f.value)}</li>`).join('')}</ul>`);
  let stop = '';
  for (const b of d.blocks) {
    if (b.stop !== stop) {
      stop = b.stop;
      const s = d.stops.find((x) => x.id === stop);
      if (s) out.push(`<h2>${esc(s.name)}${s.en ? ` <small>${esc(s.en)}</small>` : ''}</h2>`);
    }
    switch (b.type) {
      case 'text': for (const p of b.paras) out.push(`<p>${inline(p.text, ctx.base, nums)}</p>`); break;
      case 'single': out.push(await figure(ctx, b.src, b.alt, b.caption)); break;
      case 'pair': case 'strip': case 'grid': for (const im of b.images) out.push(await figure(ctx, im.src, im.alt, im.caption)); break;
      case 'free':
        for (const it of b.items) out.push(it.kind === 'image' ? await figure(ctx, it.src, it.alt, it.caption) : `<p>${inline(it.text, ctx.base, nums)}</p>`);
        break;
      // 地图是构建时画的矢量图，订阅里不放
    }
  }
  return [...out, notesHtml(d.notes, nums, ctx.base)].filter(keep).join('\n');
}
