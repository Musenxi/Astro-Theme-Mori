/**
 * 阅读量和在线访客：记在自建评论服务里（comments.provider 为 mori 时才有地址）。
 * 文章、页面打开时记一次阅读，返回的阅读量填进页头；页面开着时连着 /online/ws，连着就算在线。
 * 站内换页不刷新整页，连接一直留着；关页面时断开，断线了自己重连。
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

/* ───────── 在线访客 ───────── */

let ws: WebSocket | null = null;
let wsBase = '', ping = 0, retry = 0, again = 0, closing = false;

function connect(base: string) {
  if (ws && wsBase === base) return;
  ws?.close();
  wsBase = base; closing = false; clearTimeout(again);
  try { ws = new WebSocket(`${base.replace(/^http/, 'ws')}/online/ws?visitor=${visitor()}`); } catch { return; }
  const me = ws;
  me.onopen = () => { retry = 0; clearInterval(ping); ping = window.setInterval(() => me.readyState === 1 && me.send('ping'), PING); };
  me.onclose = () => {
    if (ws !== me) return;
    clearInterval(ping); ws = null;
    if (!closing) again = window.setTimeout(() => connect(base), Math.min(60_000, 2000 * 2 ** retry++)); // 断线重连，越等越久
  };
}

function disconnect() { closing = true; clearInterval(ping); clearTimeout(again); ws?.close(); ws = null; }

document.addEventListener('astro:page-load', () => {
  const { base, entry } = read();
  if (!base) return disconnect();
  if (entry) view(base, entry);
  connect(base);
});
addEventListener('pagehide', disconnect);
addEventListener('pageshow', (e) => { const { base } = read(); if (e.persisted && base) connect(base); }); // 从往返缓存里回来
