import type { Inline, Mark, Span } from '../schema/schema.ts';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 文章里旁注 / 脚注的编号：按在正文里出现的先后顺序，从 1 起 */
export interface NoteNumbers {
  /** 旁注 id → 编号 */
  side: Map<string, number>;
  /** 脚注 id → 编号 */
  foot: Map<string, number>;
  /** 长卷版式里给正文里的地点编号（第几个，从 0 起）：渲染时按出现顺序用掉。不给就把地点当普通文字 */
  place?: { next: number };
}

/** 递归收集一组块里的 note / fn 引用（顺序即出现顺序）。块里可以有 text、items、paras、text（自由排布） */
function collect(node: unknown, out: Array<{ type: 'note' | 'fn'; ref: string }>) {
  if (Array.isArray(node)) node.forEach((n) => collect(n, out));
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if ((o.type === 'note' || o.type === 'fn') && typeof o.ref === 'string') out.push({ type: o.type, ref: o.ref });
    for (const v of Object.values(o)) collect(v, out);
  }
}

export function numberNotes(blocks: unknown): NoteNumbers {
  const refs: Array<{ type: 'note' | 'fn'; ref: string }> = [];
  collect(blocks, refs);
  const side = new Map<string, number>(), foot = new Map<string, number>();
  let n = 0;
  for (const { type, ref } of refs) {
    const map = type === 'note' ? side : foot;
    if (!map.has(ref)) map.set(ref, ++n);
  }
  return { side, foot };
}

/** 一个 span 的标注从外到内依次包上去；note / fn 在文字后面接一个上标编号（`data-skip`：算引用评论位置时跳过） */
function wrap(html: string, mark: Mark, numbers: NoteNumbers): string {
  switch (mark.type) {
    case 'em': return `<em>${html}</em>`;
    case 'strong': return `<strong>${html}</strong>`;
    case 'code': return `<code>${html}</code>`;
    case 'tcy': return `<span class="tcy">${html}</span>`;
    case 'place': return html; // 地点的序号和包裹在 renderInline 里处理
    case 'link': return `<a href="${escapeHtml(mark.href)}">${html}</a>`;
    case 'note': return `${html}<sup class="nref" data-skip><a href="#note-${mark.ref}" id="ref-${mark.ref}">${numbers.side.get(mark.ref) ?? '?'}</a></sup>`;
    case 'fn': return `${html}<sup class="nref" data-skip><a href="#fn-${mark.ref}" id="ref-${mark.ref}">${numbers.foot.get(mark.ref) ?? '?'}</a></sup>`;
  }
}

export function renderInline(spans: Inline, numbers: NoteNumbers): string {
  let prev = '', at = -1;
  return spans
    .map((s) => {
      const html = (s.marks ?? []).reduceRight((h, mark) => wrap(h, mark, numbers), escapeHtml(s.t).replace(/\n/g, '<br>'));
      const place = (s.marks ?? []).find((m) => m.type === 'place');
      if (!place || !numbers.place) { prev = ''; return html; }
      // 被粗体之类拆开的同一个地点只编一个号，id 只给第一段
      const key = JSON.stringify(place);
      const first = key !== prev;
      if (first) at = numbers.place.next++;
      prev = key;
      return `<span class="place" data-place="${at}"${first ? ` id="place-${at}"` : ''}>${html}</span>`;
    })
    .join('');
}

/** 一段行内文字里引用了哪些旁注（按出现顺序） */
export function sideRefs(spans: Inline): string[] {
  return spans.flatMap((s) => (s.marks ?? []).flatMap((m) => (m.type === 'note' ? [m.ref] : [])));
}

/** 纯文字（摘要、alt、字数统计用） */
export const plainText = (spans: Inline) => spans.map((s) => s.t).join('');

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const WORD = /[\p{L}\p{N}]+(?:['’.\-][\p{L}\p{N}]+)*/gu;

/** 正文字数：数所有 span 的文字（代码块不算）。汉字、假名一字算一个，英文单词和数字一串算一个，空格和标点不算 */
export function countChars(node: unknown): { cjk: number; words: number } {
  const parts: string[] = [];
  const collect = (v: unknown) => {
    if (Array.isArray(v)) {
      // 一段行内文字：span 之间直接相连（一个词可能被标注拆成几个 span）
      if (v.length && v.every((x) => typeof x?.t === 'string')) parts.push((v as Span[]).map((s) => s.t).join(''));
      else v.forEach(collect);
    } else if (v && typeof v === 'object') for (const x of Object.values(v)) if (typeof x === 'object') collect(x);
  };
  collect(node);
  const text = parts.join(' ');
  const cjk = text.match(CJK)?.length ?? 0;
  const words = text.replace(CJK, ' ').match(WORD)?.length ?? 0;
  return { cjk, words };
}

/** 全文字数和阅读时间（分钟，至少 1）：中文每分钟 450 字，西文每分钟 220 词 */
export function readingOf(data: { blocks?: unknown }): { chars: number; minutes: number } {
  const { cjk, words } = countChars(data.blocks);
  return { chars: cjk + words, minutes: Math.max(1, Math.round(cjk / 450 + words / 220)) };
}
