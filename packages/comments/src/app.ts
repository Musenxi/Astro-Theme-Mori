/**
 * MORI 自建评论的 HTTP 接口（spec §5.1）。Hono 写一份，Node 和 Cloudflare Workers 共用；
 * 存储通过 Store 接口注入（SQLite / D1）。
 *
 *   GET    /comments?entry=posts/xxx         某篇文章下已通过的评论（含划词批注）
 *   POST   /comments                         提交评论 / 批注 / 回复
 *   GET    /admin/comments?status=pending    管理：列表        ┐ 只接受管理令牌
 *   GET    /admin/stats                      管理：各状态数量  │ Authorization: Bearer <token>
 *   PATCH  /admin/comments/:id  {status}     管理：通过 / 隐藏 │
 *   DELETE /admin/comments/:id               管理：删除        ┘
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Store, CommentRow, Status } from './store.ts';

export interface AppOptions {
  store: Store;
  /** 管理令牌。不设置就关闭全部管理接口 */
  adminToken?: string;
  /** Cloudflare Turnstile 的密钥；不设置就不验证（本地开发） */
  turnstileSecret?: string;
  /** 允许跨域的站点：'*' 或逗号分隔的来源，如 https://example.com */
  allowOrigin?: string;
  /** 给邮箱和 IP 做哈希用的盐 */
  salt?: string;
  /** 新评论要不要先审：returning（默认）＝第一次留言的人先审后发，以前通过过的直接发；all 全部直接发；none 全部先审 */
  autoApprove?: 'returning' | 'all' | 'none';
  now?: () => number;
  fetchImpl?: typeof fetch;
}

export const LIMITS = { name: 40, email: 120, body: 4000, quote: 600, context: 200, perMinute: 3, perDay: 20 };
const ENTRY = /^(posts|travels)\/[A-Za-z0-9][A-Za-z0-9_-]*$/;
const BLOCK = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** 对外的字段：不含邮箱哈希、IP 哈希、状态之外的内部信息 */
export const publicOf = (c: CommentRow) => ({
  id: c.id, block: c.block, start: c.start, end: c.end, quote: c.quote, prefix: c.prefix, suffix: c.suffix,
  body: c.body, name: c.name, createdAt: c.createdAt, parentId: c.parentId,
});

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 恒定时间比较（避免通过响应时间猜令牌） */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1_000_000;

export function createApp(opts: AppOptions) {
  const { store } = opts;
  const now = opts.now ?? Date.now;
  const salt = opts.salt ?? 'mori';
  const doFetch = opts.fetchImpl ?? fetch;
  const app = new Hono();

  const origins = (opts.allowOrigin ?? '*').split(',').map((s) => s.trim()).filter(Boolean);
  app.use('*', cors({
    origin: (o) => (origins.includes('*') ? '*' : origins.includes(o) ? o : ''),
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }));

  app.get('/health', (c) => c.json({ ok: true }));

  /* ───────────── 公开接口 ───────────── */

  app.get('/comments', async (c) => {
    const entry = c.req.query('entry') ?? '';
    if (!ENTRY.test(entry)) return c.json({ error: 'entry 不合法' }, 400);
    return c.json({ comments: (await store.listApproved(entry)).map(publicOf) });
  });

  app.post('/comments', async (c) => {
    let b: any;
    try { b = await c.req.json(); } catch { return c.json({ error: '请求不是 JSON' }, 400); }

    // 蜜罐：真人看不到这个字段；机器人往里填了，就假装成功但不存
    if (typeof b.website === 'string' && b.website !== '') return c.json({ status: 'pending' }, 201);

    const entry = clip(b.entry, 200), body = clip(b.body, LIMITS.body), name = clip(b.name, LIMITS.name), email = clip(b.email, LIMITS.email);
    if (!ENTRY.test(entry)) return c.json({ error: 'entry 不合法' }, 400);
    if (!body) return c.json({ error: '评论不能是空的' }, 400);
    if (!name) return c.json({ error: '请留个名字' }, 400);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ error: '邮箱格式不对' }, 400);

    // 批注：钉在哪个块的哪一段字上；块 id 加起止位置，加被选中的原文和前后文（文章改了以后靠它们重新找）
    let anchor: { block: string; start: number; end: number; quote: string; prefix: string; suffix: string } | null = null;
    if (b.block != null) {
      const quote = clip(b.quote, LIMITS.quote);
      if (typeof b.block !== 'string' || !BLOCK.test(b.block) || !isInt(b.start) || !isInt(b.end) || b.end <= b.start || !quote) return c.json({ error: '批注的位置不合法' }, 400);
      anchor = { block: b.block, start: b.start, end: b.end, quote, prefix: clip(b.prefix, LIMITS.context), suffix: clip(b.suffix, LIMITS.context) };
    }

    // 回复：只能回复同一篇里已通过的评论；回复回复的，挂到最上面那条下面（只有一层）
    let parentId: number | null = null;
    if (b.parentId != null) {
      const p = isInt(b.parentId) ? await store.get(b.parentId) : null;
      if (!p || p.entry !== entry || p.status !== 'approved') return c.json({ error: '要回复的评论不存在' }, 400);
      parentId = p.parentId ?? p.id;
    }

    // 人机验证
    if (opts.turnstileSecret) {
      const ok = await verifyTurnstile(doFetch, opts.turnstileSecret, clip(b.turnstile, 2048), ipOf(c));
      if (!ok) return c.json({ error: '人机验证没通过，请刷新页面再试' }, 403);
    }

    // 限流：按 IP 的哈希数最近一分钟和一天里发了几条
    const ip = ipOf(c);
    const ipHash = ip ? await sha256(`${salt}|ip|${ip}`) : null;
    const t = now();
    if (ipHash) {
      if ((await store.countRecentByIp(ipHash, t - 60_000)) >= LIMITS.perMinute) return c.json({ error: '发得太快了，过一会儿再试' }, 429);
      if ((await store.countRecentByIp(ipHash, t - 86_400_000)) >= LIMITS.perDay) return c.json({ error: '今天发得够多了，明天再来' }, 429);
    }

    const emailHash = email ? await sha256(`${salt}|mail|${email.toLowerCase()}`) : null;
    const mode = opts.autoApprove ?? 'returning';
    const status: Status = mode === 'all' ? 'approved' : mode === 'none' ? 'pending' : (await store.hasApprovedBefore(emailHash, name, ipHash)) ? 'approved' : 'pending';

    const id = await store.insert({
      entry, block: anchor?.block ?? null, start: anchor?.start ?? null, end: anchor?.end ?? null,
      quote: anchor?.quote ?? null, prefix: anchor?.prefix ?? null, suffix: anchor?.suffix ?? null,
      body, name, emailHash, ipHash, createdAt: t, status, parentId,
    });
    const saved = (await store.get(id))!;
    return c.json({ status, comment: status === 'approved' ? publicOf(saved) : undefined }, 201);
  });

  /* ───────────── 管理接口 ───────────── */

  const admin = new Hono();
  admin.use('*', async (c, next) => {
    if (!opts.adminToken) return c.json({ error: '管理接口没有开启（没设置管理令牌）' }, 503);
    const h = c.req.header('authorization') ?? '';
    if (!h.startsWith('Bearer ') || !safeEqual(h.slice(7), opts.adminToken)) return c.json({ error: '没有权限' }, 401);
    await next();
  });
  admin.get('/comments', async (c) => {
    const s = c.req.query('status');
    const status = s === 'pending' || s === 'approved' || s === 'hidden' ? s : undefined;
    const limit = Math.min(500, Math.max(1, Number(c.req.query('limit')) || 100));
    // 管理列表多带一个 status，其余同对外字段
    return c.json({ comments: (await store.listAdmin(status, limit)).map((r) => ({ ...publicOf(r), entry: r.entry, status: r.status })) });
  });
  admin.get('/stats', async (c) => c.json(await store.countByStatus()));
  admin.patch('/comments/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const { status } = await c.req.json().catch(() => ({}));
    if (!Number.isInteger(id) || !['pending', 'approved', 'hidden'].includes(status)) return c.json({ error: '参数不对' }, 400);
    return (await store.setStatus(id, status)) ? c.json({ ok: true }) : c.json({ error: '没有这条评论' }, 404);
  });
  admin.delete('/comments/:id', async (c) => {
    const id = Number(c.req.param('id'));
    return Number.isInteger(id) && (await store.remove(id)) ? c.json({ ok: true }) : c.json({ error: '没有这条评论' }, 404);
  });
  app.route('/admin', admin);

  return app;
}

/** 客户端 IP：Cloudflare 和常见反向代理的头，其次是 Node 的连接地址 */
function ipOf(c: any): string {
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? c.env?.incoming?.socket?.remoteAddress ?? '';
}

async function verifyTurnstile(doFetch: typeof fetch, secret: string, token: string, ip: string) {
  if (!token) return false;
  try {
    const form = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
    const r = await doFetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    return !!((await r.json()) as any).success;
  } catch { return false; }
}
