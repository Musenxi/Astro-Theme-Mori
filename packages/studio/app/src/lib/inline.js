/**
 * 行内文字：JSON 的“文字 + 标注”序列 ⇄ 编辑框里的轻量标记。必须无损，否则编辑会悄悄改坏内容。
 *
 *   **粗**  *斜*  `码`  [文字](地址)
 *   {文字|tcy}        竖排里数字横排
 *   {文字|note:n1}    旁注（正文在文章的 notes 里，n1 是它的 id）
 *   {文字|fn:f1}      脚注
 *   \*  \`  \[  \{  \\   转义
 * 标注可以嵌套（外层先写）：**{十天|note:n1}**。
 */

const SPECIAL = /[\\*`[\]{}|]/g;
const esc = (s) => s.replace(SPECIAL, (c) => '\\' + c);

/** 地址里的括号如果不配对，会让收尾的 ) 错位：不配对时转成 %28 / %29 */
function safeHref(h) {
  let d = 0, ok = true;
  for (const c of h) { if (c === '(') d++; else if (c === ')' && --d < 0) { ok = false; break; } }
  return ok && d === 0 ? h : h.replace(/\(/g, '%28').replace(/\)/g, '%29');
}

const open = (m) => {
  switch (m.type) {
    case 'strong': return ['**', '**'];
    case 'em': return ['*', '*'];
    case 'code': return ['`', '`'];
    case 'link': return ['[', `](${safeHref(m.href)})`];
    case 'tcy': return ['{', '|tcy}'];
    case 'note': return ['{', `|note:${m.ref}}`];
    case 'fn': return ['{', `|fn:${m.ref}}`];
    default: return ['', ''];
  }
};

/** spans → 文本。marks 从外到内：最外层的标注最先写、最后收 */
export function spansToText(spans) {
  return (spans ?? [])
    .map((s) => (s.marks ?? []).reduceRight((t, m) => { const [a, b] = open(m); return a + t + b; }, esc(s.t)))
    .join('');
}

/** 找和 open 配对的收尾位置（跳过转义）；找不到返回 -1 */
function close(text, from, token) {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text.startsWith(token, i)) return i;
  }
  return -1;
}

/** 文本 → spans；相邻且标注相同的文字会合并 */
export function textToSpans(text, marks = []) {
  const spans = [];
  let buf = '';
  const flush = () => { if (buf) { spans.push(marks.length ? { t: buf, marks } : { t: buf }); buf = ''; } };
  const push = (inner, m) => { flush(); spans.push(...textToSpans(inner, [...marks, m])); };

  for (let i = 0; i < text.length; ) {
    const c = text[i];
    if (c === '\\' && i + 1 < text.length) { buf += text[i + 1]; i += 2; continue; }

    if (text.startsWith('**', i)) {
      const j = close(text, i + 2, '**');
      if (j > i + 2) { push(text.slice(i + 2, j), { type: 'strong' }); i = j + 2; continue; }
    } else if (c === '*') {
      const j = close(text, i + 1, '*');
      if (j > i + 1) { push(text.slice(i + 1, j), { type: 'em' }); i = j + 1; continue; }
    } else if (c === '`') {
      const j = close(text, i + 1, '`');
      if (j > i + 1) {
        // 代码里面不再解析标注，原样保留（转义仍然有效）
        flush(); spans.push({ t: text.slice(i + 1, j).replace(/\\(.)/g, '$1'), marks: [...marks, { type: 'code' }] });
        i = j + 1; continue;
      }
    } else if (c === '[') {
      const j = close(text, i + 1, ']');
      if (j > i && text[j + 1] === '(') {
        // 地址里配对的括号（如维基百科的链接）算在地址里
        let k = -1;
        for (let x = j + 2, d = 0; x < text.length; x++) {
          if (text[x] === '(') d++;
          else if (text[x] === ')') { if (d === 0) { k = x; break; } d--; }
        }
        if (k > 0) { push(text.slice(i + 1, j), { type: 'link', href: text.slice(j + 2, k) }); i = k + 1; continue; }
      }
    } else if (c === '{') {
      const j = close(text, i + 1, '}');
      if (j > i) {
        const body = text.slice(i + 1, j);
        // 最后一个没被转义的 | 分开“文字”和“标注”
        let bar = -1;
        for (let x = 0; x < body.length; x++) { if (body[x] === '\\') { x++; continue; } if (body[x] === '|') bar = x; }
        if (bar >= 0) {
          const kind = body.slice(bar + 1), inner = body.slice(0, bar);
          const [type, ref] = kind.split(':');
          if (type === 'tcy' || ((type === 'note' || type === 'fn') && ref)) {
            const m = type === 'tcy' ? { type } : { type, ref };
            if (inner === '') { flush(); spans.push({ t: '', marks: [...marks, m] }); } else push(inner, m);
            i = j + 1; continue;
          }
        }
      }
    }
    buf += c; i++;
  }
  flush();
  return mergeSpans(spans);
}

const sameMarks = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
function mergeSpans(spans) {
  const out = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && s.t !== '' && last.t !== '' && sameMarks(last.marks, s.marks)) last.t += s.t;
    else out.push({ ...s });
  }
  return out;
}

/** 内容里“文字”既可能是字符串，也可能是 spans：统一成 spans */
export const asSpans = (v) => (typeof v === 'string' ? [{ t: v }] : Array.isArray(v) ? v : []);

/** 存回去时：没有任何标注的一整段，存成裸字符串（和手写 JSON 的习惯一致） */
export function compact(spans) {
  return spans.length === 1 && !spans[0].marks?.length ? spans[0].t : spans;
}
