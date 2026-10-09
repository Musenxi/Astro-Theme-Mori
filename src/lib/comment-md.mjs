/**
 * 评论用的 Markdown：只认评论里用得上的一小部分，输出结构化的节点，不产出 HTML 字符串——
 * 站点和 Studio 各自把节点变成 DOM / React 元素，读者写的任何 HTML 都只会是文字。
 *
 * 块：段落（段落里单个换行就是换行）、> 引用、- / * / + / 1. 列表、``` 代码块
 * 行内：**粗体**、*斜体* / _斜体_、~~删除线~~、`代码`、[文字](网址)、直接写出的网址；\ 转义
 * 链接只认 http / https。
 *
 * 块：{ type: 'p', children } | { type: 'quote', children: 块[] } | { type: 'ul' | 'ol', start?, items: 行内[][] } | { type: 'pre', text }
 * 行内：{ type: 'text', text } | { type: 'br' } | { type: 'b' | 'i' | 'del', children } | { type: 'code', text } | { type: 'a', href, children }
 */

const FENCE = /^\s*```/;
const QUOTE = /^\s*>\s?/;
const ITEM = /^\s*(?:([-*+])|(\d{1,9})[.)])\s+(.*)$/;
const MAX_DEPTH = 4;

/** 评论正文 → 块节点 */
export function parseComment(src) {
  return blocks(String(src ?? '').replace(/\r\n?/g, '\n').split('\n'), 0);
}

function blocks(lines, depth) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (FENCE.test(line)) {
      const body = [];
      for (i++; i < lines.length && !FENCE.test(lines[i]); i++) body.push(lines[i]);
      i++; // 跳过收尾的 ```（没有收尾就到结尾为止）
      out.push({ type: 'pre', text: body.join('\n') });
      continue;
    }
    if (QUOTE.test(line) && depth < MAX_DEPTH) {
      const body = [];
      for (; i < lines.length && QUOTE.test(lines[i]); i++) body.push(lines[i].replace(QUOTE, ''));
      out.push({ type: 'quote', children: blocks(body, depth + 1) });
      continue;
    }
    const first = line.match(ITEM);
    if (first) {
      const ordered = !first[1];
      const items = [];
      for (; i < lines.length; i++) {
        const m = lines[i].match(ITEM);
        if (!m || !m[1] !== ordered) break;
        items.push(inline(m[3], 0));
      }
      out.push(ordered ? { type: 'ol', start: Number(first[2]), items } : { type: 'ul', items });
      continue;
    }
    const para = [];
    for (; i < lines.length && lines[i].trim() && !FENCE.test(lines[i]) && !QUOTE.test(lines[i]) && !ITEM.test(lines[i]); i++) para.push(lines[i].trim());
    const children = [];
    para.forEach((l, k) => { if (k) children.push({ type: 'br' }); children.push(...inline(l, 0)); });
    out.push({ type: 'p', children: merge(children) });
  }
  return out;
}

const URL_RE = /^https?:\/\/[^\s<>"'`]+/i;
/** 网址末尾的标点通常不是网址的一部分 */
const trimUrl = (u) => u.replace(/[.,;:!?)\]}'"。，；：！？、）」』】》]+$/, '');
const safeHref = (u) => (/^https?:\/\/[^\s]+$/i.test(u) ? u : null);
const PAIRS = [['**', 'b'], ['__', 'b'], ['~~', 'del'], ['*', 'i'], ['_', 'i']];

function inline(s, depth) {
  const out = [];
  let text = '';
  const flush = () => { if (text) { out.push({ type: 'text', text }); text = ''; } };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    // 转义
    if (ch === '\\' && i + 1 < s.length && /[\\`*_~[\]()>#+\-.!|]/.test(s[i + 1])) { text += s[i + 1]; i += 2; continue; }
    // 行内代码
    if (ch === '`') {
      const run = s.slice(i).match(/^`+/)[0];
      const end = s.indexOf(run, i + run.length);
      if (end > i) { flush(); out.push({ type: 'code', text: s.slice(i + run.length, end).trim() || s.slice(i + run.length, end) }); i = end + run.length; continue; }
      text += run; i += run.length; continue;
    }
    // [文字](网址)
    if (ch === '[') {
      const m = s.slice(i).match(/^\[([^\]\n]+)\]\(([^)\s]+)\)/);
      const href = m && safeHref(m[2]);
      if (href) { flush(); out.push({ type: 'a', href, children: depth < MAX_DEPTH ? inline(m[1], depth + 1) : [{ type: 'text', text: m[1] }] }); i += m[0].length; continue; }
    }
    // 直接写出的网址
    if ((ch === 'h' || ch === 'H') && !/[\w/]/.test(s[i - 1] ?? '')) {
      const m = s.slice(i).match(URL_RE);
      if (m) { const u = trimUrl(m[0]); flush(); out.push({ type: 'a', href: u, children: [{ type: 'text', text: u }] }); i += u.length; continue; }
    }
    // 粗体、斜体、删除线：要有收尾，内容不能以空格开头或结尾；_ 两边不能紧贴字母数字（免得 snake_case 变斜体）
    let hit = false;
    for (const [mark, type] of PAIRS) {
      if (!s.startsWith(mark, i) || depth >= MAX_DEPTH) continue;
      if (mark[0] === '_' && /\w/.test(s[i - 1] ?? '')) continue;
      const from = i + mark.length;
      let end = s.indexOf(mark, from + 1);
      while (end > 0 && mark[0] === '_' && /\w/.test(s[end + mark.length] ?? '')) end = s.indexOf(mark, end + 1);
      while (end > 0 && s[end + mark.length] === mark[0]) end++; // ***：收尾取这一串的最后两个，里面的留给内层
      const inner = end > 0 ? s.slice(from, end) : '';
      if (!inner || /^\s|\s$/.test(inner)) continue;
      flush();
      out.push({ type, children: inline(inner, depth + 1) });
      i = end + mark.length;
      hit = true;
      break;
    }
    if (hit) continue;
    text += ch;
    i++;
  }
  flush();
  return merge(out);
}

/** 相邻的文字并成一段 */
function merge(nodes) {
  const out = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    if (n.type === 'text' && last?.type === 'text') last.text += n.text;
    else out.push(n);
  }
  return out;
}

/** 节点 → 纯文字（小地方只放得下一行字时用；块之间、换行处用空格隔开） */
export function commentText(src) {
  const flat = (n) => (n.type === 'text' || n.type === 'code' || n.type === 'pre' ? n.text : n.type === 'br' ? ' ' : n.items ? n.items.map((it) => it.map(flat).join('')).join(' ') : (n.children ?? []).map(flat).join(n.type === 'quote' ? ' ' : ''));
  return (Array.isArray(src) ? src : parseComment(src)).map(flat).join(' ').replace(/\s+/g, ' ').trim();
}
