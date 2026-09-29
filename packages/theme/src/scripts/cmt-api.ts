/** 评论服务的接口封装：文末评论区和划词批注共用 */
import { t } from './i18n.ts';

export interface MoriComment {
  id: number;
  block: string | null;
  start: number | null;
  end: number | null;
  quote: string | null;
  prefix: string | null;
  suffix: string | null;
  body: string;
  name: string;
  createdAt: number;
  parentId: number | null;
}
export interface SendResult { status: 'approved' | 'pending'; comment?: MoriComment }

export interface MoriCommentsConfig { provider: string; endpoint?: string; turnstileSiteKey?: string; annotations?: boolean }

/** 当前页面的评论设置（评论区 section 上的 data-config）。没有评论区 / 不是自建评论就是 null */
export function moriConfig(): (MoriCommentsConfig & { entry: string }) | null {
  const el = document.querySelector<HTMLElement>('#comments');
  if (!el || el.dataset.provider !== 'mori') return null;
  try { return { ...JSON.parse(el.dataset.config!), entry: el.dataset.entry! }; } catch { return null; }
}

const base = (c: MoriCommentsConfig) => (c.endpoint ?? '').replace(/\/$/, '');

export async function listComments(c: MoriCommentsConfig, entry: string): Promise<MoriComment[]> {
  const r = await fetch(`${base(c)}/comments?entry=${encodeURIComponent(entry)}`);
  if (!r.ok) throw new Error(t('js.cmt.loadFail', { status: r.status }));
  return ((await r.json()) as { comments: MoriComment[] }).comments;
}

export async function sendComment(c: MoriCommentsConfig, payload: Record<string, unknown>): Promise<SendResult> {
  const r = await fetch(`${base(c)}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const j = (await r.json().catch(() => ({}))) as any;
  if (!r.ok) throw new Error(j.error ?? t('js.cmt.postFail', { status: r.status }));
  return j as SendResult;
}

/* ───────── Cloudflare Turnstile（有站点密钥时才加载）───────── */
let tsLoad: Promise<void> | null = null;
const loadTurnstile = () => (tsLoad ??= new Promise<void>((ok, fail) => {
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  s.async = true; s.onload = () => ok(); s.onerror = () => fail(new Error(t('js.cmt.tsFail')));
  document.head.appendChild(s);
}));

/** 在 el 里放一个验证控件；返回取令牌 / 重置的方法。没有站点密钥就返回 null（不需要验证） */
export async function mountTurnstile(c: MoriCommentsConfig, el: HTMLElement): Promise<{ token(): string; reset(): void } | null> {
  if (!c.turnstileSiteKey) return null;
  try { await loadTurnstile(); } catch { return null; }
  const ts = (window as any).turnstile;
  const id = ts.render(el, { sitekey: c.turnstileSiteKey, theme: 'auto', size: 'flexible' });
  return { token: () => ts.getResponse(id) ?? '', reset: () => ts.reset(id) };
}

export const remember = {
  get: (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
};

export const dotDate = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
