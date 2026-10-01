/**
 * 站内搜索：第一次搜的时候读 /search.json，在浏览器里查。搜索页和悬浮搜索框共用这一套。
 * 中文没有空格分词：整句先当一个词，再按空格拆成几个词，每个词都要命中（标题 > 副题 > 摘要 > 分类 > 正文）。
 * 悬浮搜索框（SearchPanel.astro）：点页头的搜索入口、按 ⌘K / Ctrl+K 或 / 打开；↑↓ 选、回车打开、Esc 关。
 */
import { t } from './i18n.ts';
import { lgFilter } from './lg.ts';
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

/** 查一次，返回结果条目的 HTML 和计数文字；q 为空时返回 null */
async function search(raw: string) {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  index ??= await (await fetch('/search.json')).json();
  const terms = [...new Set([q, ...q.split(/\s+/)].filter(Boolean))].slice(0, 6);
  const hits = index!.map((it) => ({ it, s: score(it, q.includes(' ') ? q.split(/\s+/).filter(Boolean) : [q]) })).filter((h) => h.s > 0).sort((a, b) => b.s - a.s || b.it.d.localeCompare(a.it.d));
  return {
    note: hits.length ? t('js.search.count', { n: hits.length }) : t('js.search.none'),
    html: hits.map(({ it }) => `<li><a class="group block border-b border-b-border py-5 outline-none" href="${it.u}"><span class="flex items-baseline justify-between gap-5"><b class="text-item leading-[1.5] font-normal tracking-[.05em] transition-[color] duration-300 group-hover:text-primary group-aria-selected:text-primary group-focus-visible:text-primary">${esc(it.t)}</b><span class="meta whitespace-nowrap">${esc(it.c)} · ${it.d}</span></span><span class="mt-1.5 line-clamp-2 text-aux leading-[1.8] tracking-[.03em] text-muted-foreground [&_mark]:bg-transparent [&_mark]:text-foreground [&_mark]:underline [&_mark]:decoration-primary [&_mark]:decoration-1 [&_mark]:underline-offset-4">${snippet(it, terms)}</span></a></li>`).join(''),
  };
}

/* ───────────── 搜索页 /search/ ───────────── */
function initPage() {
  const input = document.querySelector<HTMLInputElement>('#q');
  const list = document.querySelector<HTMLElement>('#srch-list');
  const note = document.querySelector<HTMLElement>('#srch-note');
  const clear = document.querySelector<HTMLElement>('#q-clear');
  const cats = document.querySelector<HTMLElement>('#srch-cats');
  if (!input || !list || !note || input.dataset.ready) return;
  input.dataset.ready = '1';

  const run = async () => {
    const q = input.value.trim();
    history.replaceState(null, '', q ? `?q=${encodeURIComponent(q.toLowerCase())}` : location.pathname);
    if (clear) clear.hidden = !q;
    if (cats) cats.hidden = !!q;
    const r = await search(q);
    if (input.value.trim() !== q) return; // 打字比查询快：只用最后一次的结果
    note.textContent = r?.note ?? '';
    list.innerHTML = r?.html ?? '';
  };
  input.addEventListener('input', run);
  clear?.addEventListener('click', () => { input.value = ''; run(); input.focus(); });
  const q = new URLSearchParams(location.search).get('q');
  if (q) { input.value = q; run(); }
  input.focus();
}

/* ───────────── 悬浮搜索框 ───────────── */
const panel = () => document.querySelector<HTMLDialogElement>('#srch-panel');

function initPanel() {
  const dlg = panel();
  if (!dlg || dlg.dataset.ready) return;
  dlg.dataset.ready = '1';
  const input = dlg.querySelector<HTMLInputElement>('[data-q]')!;
  const list = dlg.querySelector<HTMLElement>('[data-list]')!;
  const note = dlg.querySelector<HTMLElement>('[data-note]')!;
  let sel = -1;

  const links = () => [...list.querySelectorAll<HTMLAnchorElement>('a')];
  const select = (i: number) => {
    const ls = links();
    sel = ls.length ? (i + ls.length) % ls.length : -1;
    ls.forEach((a, k) => (k === sel ? a.setAttribute('aria-selected', 'true') : a.removeAttribute('aria-selected')));
    ls[sel]?.scrollIntoView({ block: 'nearest' });
  };

  input.addEventListener('input', async () => {
    const q = input.value.trim();
    const r = await search(q);
    if (input.value.trim() !== q) return;
    note.textContent = r?.note ?? '';
    list.innerHTML = r?.html ?? '';
    select(0);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); select(sel + (e.key === 'ArrowDown' ? 1 : -1)); }
    else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); links()[sel]?.click(); }
  });
  // 点外面的磨砂层关；点结果先关再跳，换页时不把搜索框截进过渡画面
  dlg.addEventListener('click', (e) => {
    const el = e.target as Element;
    if (el.closest('[data-close]')) close();
    else if (el.closest('a')) dlg.close();
  });
  dlg.addEventListener('close', () => document.documentElement.classList.remove('srch-open'));

  // 液态玻璃：折射贴图按板子的实际尺寸画；结果一多板子变高，就重画（攒一帧再画）
  const box = dlg.querySelector<HTMLElement>('[data-srch]')!, defs = dlg.querySelector('[data-defs]')!;
  let raf = 0;
  const glass = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const w = Math.round(box.offsetWidth), h = Math.round(box.offsetHeight), r = parseFloat(getComputedStyle(box).borderTopLeftRadius) || 24;
      if (!w || !h) return;
      if (document.documentElement.classList.contains('lg-refract')) defs.innerHTML = lgFilter('lg-f-panel', box, r);
    });
  };
  new ResizeObserver(glass).observe(box);
}

function open() {
  const dlg = panel();
  if (!dlg) return false;
  initPanel();
  if (!dlg.open) {
    dlg.showModal();
    document.documentElement.classList.add('srch-open');
  }
  const input = dlg.querySelector<HTMLInputElement>('[data-q]')!;
  input.focus();
  input.select();
  return true;
}
function close() { panel()?.close(); }

// 搜索页上就用页面里的框；别处打开悬浮框
const openSearch = () => {
  const own = document.querySelector<HTMLInputElement>('#q');
  if (own) { own.focus(); own.select(); return; }
  if (!open()) location.href = '/search/';
};

// ⌘K / Ctrl+K 在哪都能开；/ 在打字的时候不算
document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
    e.preventDefault();
    if (panel()?.open) close(); else openSearch();
    return;
  }
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
  if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
  e.preventDefault();
  openSearch();
});

// 指向搜索页的链接（页头的搜索入口、页脚）：普通点击改为打开悬浮框；按着修饰键（新标签页打开等）照常
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
  if (!a || a.closest('#srch-panel') || a.target === '_blank') return;
  const u = new URL(a.href, location.href);
  if (u.origin !== location.origin || !/^\/search\/?$/.test(u.pathname) || u.search) return;
  e.preventDefault();
  openSearch();
}, true);

document.addEventListener('astro:page-load', () => { initPage(); initPanel(); });
initPage();
initPanel();

export {};
