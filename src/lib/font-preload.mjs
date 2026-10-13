/**
 * 东观体是按字符区间切成几百片的（public/fonts/STD/<字重>/font.css），页面载完才整体加载。
 * 首屏的字如果等那时才换，同一屏里的字会一片一片地换成东观体，字重看起来在变。
 * 构建完成后，给每个页面算出首屏要用到的那几片，在 <head> 里 preload，并把这几片的 @font-face 直接写在页面里，
 * 首次绘制时就用上东观体；其余的还是页面载完再加载。
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FONT_DIR = fileURLToPath(new URL('../../public/fonts/STD/', import.meta.url));
const WEIGHTS = { regular: 400, light: 300, bold: 700 };
/** 首屏按文档顺序看这么多个字；最多预载这么多片（每片三四十 KB） */
const FIRST_CHARS = 60;
const MAX_SLICES = 4;
/** 西文和数字用 EB Garamond，不会用到东观体（见 fonts/EBGaramond/font.css） */
const LATIN = [[0x20, 0x7e], [0xa0, 0xb6], [0xb8, 0xff], [0x131, 0x131], [0x152, 0x153], [0x2013, 0x2013], [0x20ac, 0x20ac], [0x2122, 0x2122], [0x2212, 0x2212]];
const isLatin = (cp) => LATIN.some(([a, b]) => cp >= a && cp <= b);

/** 读一个字重的切片表：{ file → @font-face 原文 }、{ 码点 → file } */
function loadSlices(name) {
  const css = join(FONT_DIR, name, 'font.css');
  if (!existsSync(css)) return null;
  const byCp = new Map(), rules = new Map();
  for (const rule of readFileSync(css, 'utf8').match(/@font-face\{[^}]*\}/g) ?? []) {
    const file = rule.match(/url\("\.\/([^"]+)"\)/)?.[1], range = rule.match(/unicode-range:([^;}]*)/)?.[1];
    if (!file || !range) continue;
    rules.set(file, rule);
    for (const part of range.split(',')) {
      const [a, b] = part.trim().replace(/^U\+/i, '').split('-').map((h) => parseInt(h, 16));
      for (let cp = a; cp <= (b ?? a); cp++) byCp.set(cp, file);
    }
  }
  return { byCp, rules };
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'head']);

/** 页面里前几个字各用什么字重：[[字, 字重]]。字重按 Tailwind 的 font-* 类和 b / strong 推（没写就是 400） */
export function firstScreenChars(html, limit = FIRST_CHARS) {
  const body = html.slice(Math.max(0, html.search(/<body[\s>]/i))).replace(/<!--[\s\S]*?-->/g, '');
  const out = [], stack = [{ tag: '', w: 400, skip: false }];
  const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(body)) && out.length < limit) {
    if (m[4] !== undefined) {
      if (stack.at(-1).skip) continue;
      const text = m[4].replace(/&[#\w]+;/g, (e) => (e === '&nbsp;' ? ' ' : e.startsWith('&#') ? String.fromCodePoint(+e.slice(2, -1).replace(/^x/i, '0x') || 32) : '·'));
      for (const ch of text) if (!/\s/.test(ch)) out.push([ch, stack.at(-1).w]);
      continue;
    }
    const [, close, tag, attrs] = m, t = tag.toLowerCase();
    if (close) { if (stack.length > 1 && stack.at(-1).tag === t) stack.pop(); else { const i = stack.map((s) => s.tag).lastIndexOf(t); if (i > 0) stack.length = i; } continue; }
    if (VOID.has(t) || /\/\s*$/.test(attrs)) continue;
    const cls = attrs.match(/class="([^"]*)"/)?.[1] ?? '';
    const cur = stack.at(-1);
    let w = cur.w;
    if (/(^|\s)font-light(\s|$)/.test(cls)) w = 300;
    else if (/(^|\s)font-(normal|medium)(\s|$)/.test(cls)) w = 400;
    else if (/(^|\s)font-(bold|semibold)(\s|$)/.test(cls) || t === 'strong' || t === 'b') w = 700;
    stack.push({ tag: t, w, skip: cur.skip || SKIP.has(t) || /(^|\s)hidden(\s|=|$)/.test(attrs) || /aria-hidden="true"/.test(attrs) });
  }
  return out;
}

export function preloadFonts(out, logger) {
  const slices = Object.fromEntries(Object.entries(WEIGHTS).map(([n]) => [n, loadSlices(n)]));
  if (!Object.values(slices).every(Boolean)) return;
  const names = Object.fromEntries(Object.entries(WEIGHTS).map(([n, w]) => [w, n]));
  let pages = 0, total = 0;
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) { if (f !== '_astro' && f !== 'fonts') walk(p); continue; }
      if (!f.endsWith('.html')) continue;
      let html = readFileSync(p, 'utf8');
      const anchor = html.match(/<meta name="viewport"[^>]*>/i);
      if (!anchor) continue;
      const picked = new Map(); // `${字重名}/${文件}` → 字重名
      for (const [ch, w] of firstScreenChars(html)) {
        const cp = ch.codePointAt(0);
        if (isLatin(cp)) continue;
        const name = names[w] ?? 'regular', file = slices[name].byCp.get(cp);
        if (file && picked.size < MAX_SLICES) picked.set(`${name}/${file}`, name);
      }
      if (!picked.size) continue;
      let head = '', style = '';
      for (const [key, name] of picked) {
        const file = key.split('/')[1];
        head += `<link rel="preload" as="font" type="font/woff2" crossorigin href="/fonts/STD/${name}/${file}">`;
        style += slices[name].rules.get(file).replace(/url\("\.\/([^"]+)"\)/, `url("/fonts/STD/${name}/$1")`);
      }
      html = html.replace(anchor[0], `${anchor[0]}${head}<style>${style}</style>`);
      writeFileSync(p, html);
      pages++; total += picked.size;
    }
  };
  walk(out);
  if (pages) logger.info(`东观体：${pages} 个页面预载了首屏用到的字体片（平均 ${(total / pages).toFixed(1)} 片）`);
}
