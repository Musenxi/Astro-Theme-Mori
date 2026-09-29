import type { Inline, Mark } from '../content/schema.ts';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 文章里旁注 / 脚注的编号：按在正文里出现的先后顺序，从 1 起 */
export interface NoteNumbers {
  /** 旁注 id → 编号 */
  side: Map<string, number>;
  /** 脚注 id → 编号 */
  foot: Map<string, number>;
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

/** 一个 span 的标注从外到内依次包上去；note / fn 在文字后面接一个上标编号（`data-skip`：算批注位置时跳过） */
function wrap(html: string, mark: Mark, numbers: NoteNumbers): string {
  switch (mark.type) {
    case 'em': return `<em>${html}</em>`;
    case 'strong': return `<strong>${html}</strong>`;
    case 'code': return `<code>${html}</code>`;
    case 'tcy': return `<span class="tcy">${html}</span>`;
    case 'link': return `<a href="${escapeHtml(mark.href)}">${html}</a>`;
    case 'note': return `${html}<sup class="nref" data-skip><a href="#note-${mark.ref}" id="ref-${mark.ref}">${numbers.side.get(mark.ref) ?? '?'}</a></sup>`;
    case 'fn': return `${html}<sup class="nref" data-skip><a href="#fn-${mark.ref}" id="ref-${mark.ref}">${numbers.foot.get(mark.ref) ?? '?'}</a></sup>`;
  }
}

export function renderInline(spans: Inline, numbers: NoteNumbers): string {
  return spans
    .map((s) => (s.marks ?? []).reduceRight((html, mark) => wrap(html, mark, numbers), escapeHtml(s.t).replace(/\n/g, '<br>')))
    .join('');
}

/** 一段行内文字里引用了哪些旁注（按出现顺序） */
export function sideRefs(spans: Inline): string[] {
  return spans.flatMap((s) => (s.marks ?? []).flatMap((m) => (m.type === 'note' ? [m.ref] : [])));
}

/** 纯文字（摘要、alt、字数统计用） */
export const plainText = (spans: Inline) => spans.map((s) => s.t).join('');

/** 正文字数：数所有 span 的文字（代码块不算） */
export function countChars(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((n: number, v) => n + countChars(v), 0);
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    return (typeof o.t === 'string' ? o.t.length : 0) + Object.values(o).reduce((n: number, v) => n + (typeof v === 'object' ? countChars(v) : 0), 0);
  }
  return 0;
}
