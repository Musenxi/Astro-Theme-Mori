/**
 * 划词引用评论的定位（spec §3.4，参考 W3C Web Annotation 的做法）：
 * 每条引用评论记录“块 id + 起止字符位置”，同时保存被选中的原文和前后各几十个字。
 * 文章修改后，先按位置找；对不上就用原文加前后文匹配；仍找不到时评论照常显示，只是引用旁标注“原文已修改”。
 * 这个文件只处理纯文本，不碰 DOM，所以能在 Node 里测试。
 */
export interface Anchor {
  start: number;
  end: number;
  quote: string;
  prefix: string;
  suffix: string;
}

export const CONTEXT = 40;

/** 选区前后各取几十个字作上下文 */
export function contextOf(text: string, start: number, end: number, n = CONTEXT) {
  return { prefix: text.slice(Math.max(0, start - n), start), suffix: text.slice(end, end + n) };
}

/** 两个字符串末尾 / 开头有多少个字相同 */
const commonSuffix = (a: string, b: string) => { let i = 0; while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++; return i; };
const commonPrefix = (a: string, b: string) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };

/**
 * 在（可能已经改过的）块文字里找回被引用的那一段。找不到返回 null。
 * 1) 原位置上的文字仍是原文 → 直接用
 * 2) 否则找原文出现的所有位置，按前后文吻合的字数打分，取最高；并列时取离原位置最近的
 * 3) 只出现一次就直接采用（前后文可能是改动的那部分）
 */
export function locate(text: string, a: Anchor): { start: number; end: number } | null {
  if (!a.quote) return null;
  if (text.slice(a.start, a.end) === a.quote) return { start: a.start, end: a.end };

  const hits: number[] = [];
  for (let i = text.indexOf(a.quote); i >= 0; i = text.indexOf(a.quote, i + 1)) hits.push(i);
  if (!hits.length) return null;
  if (hits.length === 1) return { start: hits[0], end: hits[0] + a.quote.length };

  let best = hits[0], bs = -1, bd = Infinity;
  for (const i of hits) {
    const score = commonSuffix(text.slice(0, i), a.prefix) + commonPrefix(text.slice(i + a.quote.length), a.suffix);
    const d = Math.abs(i - a.start);
    if (score > bs || (score === bs && d < bd)) { best = i; bs = score; bd = d; }
  }
  return { start: best, end: best + a.quote.length };
}
