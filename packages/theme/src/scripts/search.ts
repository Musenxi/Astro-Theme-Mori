/**
 * 站内搜索：第一次打开时读 /search.json，在浏览器里查。
 * 中文没有空格分词：整句先当一个词，再按空格拆成几个词，每个词都要命中（标题 > 副题 > 摘要 > 分类 > 正文）。
 * 按 `/` 从任何页面跳到搜索页。
 */
import { t } from './i18n.ts';
interface Item { t: string; s: string; u: string; c: string; d: string; e: string; x: string }
let index: Item[] | null = null;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 一篇对一组词的得分；有任何一个词完全没命中就是 0 */
function score(it: Item, terms: string[]) {
  let total = 0;
  for (const w of terms) {
    const s = (it.t.toLowerCase().includes(w) ? 10 : 0) + (it.s.toLowerCase().includes(w) ? 6 : 0) + (it.e.toLowerCase().includes(w) ? 4 : 0) + (it.c.includes(w) ? 3 : 0) + (it.x.toLowerCase().includes(w) ? 1 : 0);
    if (!s) return 0;
    total += s;
  }
  return total;
}

/** 正文里第一处命中的上下文，命中的词加粗 */
function snippet(it: Item, terms: string[]) {
  const src = !it.e || it.x.startsWith(it.e) ? it.x : it.e + ' … ' + it.x, low = src.toLowerCase(); // 正文常以摘要开头，别重复一遍
  const at = Math.min(...terms.map((w) => low.indexOf(w)).filter((i) => i >= 0), src.length);
  const from = Math.max(0, at - 20);
  let out = esc(src.slice(from, from + 90));
  for (const w of terms) out = out.replace(new RegExp(esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark>${m}</mark>`);
  return (from ? '…' : '') + out;
}

async function init() {
  const input = document.querySelector<HTMLInputElement>('#q');
  const list = document.querySelector<HTMLElement>('#srch-list');
  const note = document.querySelector<HTMLElement>('#srch-note');
  const clear = document.querySelector<HTMLElement>('#q-clear');
  const cats = document.querySelector<HTMLElement>('#srch-cats');
  if (!input || !list || !note || input.dataset.ready) return;
  input.dataset.ready = '1';

  const run = async () => {
    const q = input.value.trim().toLowerCase();
    history.replaceState(null, '', q ? `?q=${encodeURIComponent(q)}` : location.pathname);
    if (clear) clear.hidden = !q;
    if (cats) cats.hidden = !!q;
    if (!q) { list.replaceChildren(); note.textContent = ''; return; }
    index ??= await (await fetch('/search.json')).json();
    const terms = [...new Set([q, ...q.split(/\s+/)].filter(Boolean))].slice(0, 6);
    const hits = index!.map((it) => ({ it, s: score(it, q.includes(' ') ? q.split(/\s+/).filter(Boolean) : [q]) })).filter((h) => h.s > 0).sort((a, b) => b.s - a.s || b.it.d.localeCompare(a.it.d));
    note.textContent = hits.length ? t('js.search.count', { n: hits.length }) : t('js.search.none');
    list.innerHTML = hits.map(({ it }) => `<li><a class="group block border-b border-b-border py-5" href="${it.u}"><span class="flex items-baseline justify-between gap-5"><b class="text-[20px] leading-[1.5] font-normal tracking-[.05em] transition-[color] duration-300 group-hover:text-primary">${esc(it.t)}</b><span class="meta whitespace-nowrap">${esc(it.c)} · ${it.d}</span></span><span class="mt-1.5 line-clamp-2 text-[14.5px] leading-[1.8] tracking-[.03em] text-muted-foreground [&_mark]:bg-transparent [&_mark]:text-foreground [&_mark]:underline [&_mark]:decoration-primary [&_mark]:decoration-1 [&_mark]:underline-offset-4">${snippet(it, terms)}</span></a></li>`).join('');
  };
  input.addEventListener('input', run);
  clear?.addEventListener('click', () => { input.value = ''; run(); input.focus(); });
  const q = new URLSearchParams(location.search).get('q');
  if (q) { input.value = q; run(); }
  input.focus();
}

// 在任何页面按 / 跳到搜索页（在输入框里打字时不算）
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
  const el = e.target as HTMLElement;
  if (el.closest('input, textarea, select, [contenteditable]')) return;
  e.preventDefault();
  location.href = '/search/';
});
document.addEventListener('astro:page-load', init);
init();

export {};
