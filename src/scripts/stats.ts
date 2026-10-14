/**
 * 阅读量和在线访客：记在自建评论服务里（comments.provider 为 mori 时才有地址）。
 * 文章、页面打开时记一次阅读，返回的阅读量填进页头；页面开着时连着 /online/ws，连着就算在线。
 * 站内换页不刷新整页，连接一直留着，换页时告诉服务现在在哪一页；关页面时断开，断线了自己重连。
 * 服务推来的在线人数和各页人数填进页脚（悬停列出在读的页面），这一页的人数填进文章页头。
 * 读者 id 是随机生成的，存在 localStorage 里，只用来区分“同一个人”。
 */
import { t } from './i18n.ts';

const PING = 45_000;

const read = () => {
  const b = document.body.dataset;
  return { base: (b.stats ?? '').replace(/\/$/, ''), entry: b.entry ?? '' };
};

let id = '';
function visitor() {
  if (id) return id;
  try { id = localStorage.getItem('mori-visitor') ?? ''; } catch {}
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => n.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem('mori-visitor', id); } catch {}
  }
  return id;
}

/* ───────── 阅读量 ───────── */

function showViews(n: number) {
  const els = document.querySelectorAll<HTMLElement>('[data-views]');
  if (!els.length) return;
  els[els.length - 1].textContent = t(n === 1 ? 'js.views.one' : 'js.views', { n: n.toLocaleString() });
  els.forEach((el) => (el.hidden = false));
}

// 不带 Content-Type：浏览器当作 text/plain 发，跨域不用预检
async function view(base: string, entry: string) {
  try {
    const r = await fetch(`${base}/views`, { method: 'POST', body: JSON.stringify({ visitor: visitor(), entry }) });
    const { views } = await r.json();
    if (typeof views === 'number' && read().entry === entry) showViews(views); // 等回来时可能已经换页了
  } catch {}
}

/* ───────── 页脚：在读的人数和页面 ───────── */

type Online = { online: number; pages: [string, number][] };
let now: Online | null = null;
/** 文章的标题：悬停时才去取 /search.json（不小，读者多半不会悬停） */
let titles: Record<string, string> | null = null, loading = false;

const here = () => location.pathname;

function nameOf(path: string, names: Record<string, string>) {
  const name = names[path] ?? titles?.[path];
  if (name) return name;
  try { return decodeURIComponent(path); } catch { return path; }
}

/** 文章页头：这一页有几人在读 */
function showReading() {
  const els = document.querySelectorAll<HTMLElement>('[data-reading]');
  if (!els.length) return;
  const n = (ws && now?.pages.find(([p]) => p === here())?.[1]) || 0;
  if (n) els[els.length - 1].textContent = t('js.online', { n: n.toLocaleString() });
  els.forEach((el) => (el.hidden = !n));
}

function showOnline() {
  showReading();
  const box = document.getElementById('online');
  if (!box) return;
  if (!now || !ws) return void (box.hidden = true);
  let names: Record<string, string> = {};
  try { names = JSON.parse(box.dataset.names ?? '{}'); } catch {}
  box.querySelector<HTMLElement>('[data-n]')!.textContent = t('js.online', { n: now.online.toLocaleString() });
  const list = box.querySelector<HTMLElement>('[data-list]')!;
  list.replaceChildren(...now.pages.map(([path, n]) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = path;
    a.className = 'flex items-baseline justify-between gap-6 rounded-[9px] px-3 py-1.5 text-soft-foreground transition-[color,background-color] duration-300 hover:bg-(--glass-line) hover:text-primary aria-[current]:text-primary';
    if (path === here()) a.setAttribute('aria-current', 'page');
    const name = document.createElement('span');
    name.className = 'min-w-0 truncate';
    name.textContent = nameOf(path, names);
    const count = document.createElement('span');
    count.textContent = n.toLocaleString();
    a.append(name, count);
    li.append(a);
    return li;
  }));
  box.querySelector<HTMLElement>('#online-pages')!.hidden = !now.pages.length;
  box.hidden = false;
}

async function loadTitles() {
  if (titles || loading) return;
  loading = true;
  try {
    const index: { u: string; t: string }[] = await (await fetch('/search.json')).json();
    titles = Object.fromEntries(index.map((e) => [e.u, e.t]));
    showOnline();
  } catch { loading = false; }
}

document.addEventListener('pointerover', (e) => { if ((e.target as Element).closest?.('#online')) loadTitles(); });
document.addEventListener('focusin', (e) => { if ((e.target as Element).closest?.('#online')) loadTitles(); });

/* ───────── 在线访客 ───────── */

let ws: WebSocket | null = null;
let wsBase = '', told = '', ping = 0, retry = 0, again = 0, closing = false;

/** 告诉服务现在在哪一页（连接还没建好时等 onopen 再说） */
function tell() {
  if (ws?.readyState !== 1 || told === here()) return;
  told = here();
  ws.send(JSON.stringify({ page: told }));
}

function connect(base: string) {
  if (ws && wsBase === base) return tell();
  ws?.close();
  wsBase = base; closing = false; clearTimeout(again); told = here();
  try { ws = new WebSocket(`${base.replace(/^http/, 'ws')}/online/ws?visitor=${visitor()}&page=${encodeURIComponent(told)}`); } catch { return; }
  const me = ws;
  me.onopen = () => { retry = 0; clearInterval(ping); ping = window.setInterval(() => me.readyState === 1 && me.send('ping'), PING); tell(); };
  me.onmessage = (e) => {
    if (ws !== me || e.data === 'pong') return;
    try {
      const d = JSON.parse(e.data);
      if (typeof d.online === 'number') { now = { online: d.online, pages: Array.isArray(d.pages) ? d.pages : [] }; showOnline(); }
    } catch {}
  };
  me.onclose = () => {
    if (ws !== me) return;
    clearInterval(ping); ws = null; showOnline();
    if (!closing) again = window.setTimeout(() => connect(base), Math.min(60_000, 2000 * 2 ** retry++)); // 断线重连，越等越久
  };
}

function disconnect() { closing = true; clearInterval(ping); clearTimeout(again); ws?.close(); ws = null; }

document.addEventListener('astro:page-load', () => {
  const { base, entry } = read();
  if (!base) return disconnect();
  if (entry) view(base, entry);
  connect(base);
  showOnline(); // 页脚是新的，先填上一次的数，服务推来新数再更新
});
addEventListener('pagehide', disconnect);
addEventListener('pageshow', (e) => { const { base } = read(); if (e.persisted && base) connect(base); }); // 从往返缓存里回来
