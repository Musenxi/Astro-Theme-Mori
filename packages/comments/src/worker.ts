/**
 * Cloudflare Workers 入口。绑定见 wrangler.example.toml：D1 库 `DB`，在线访客的 Durable Object `ONLINE`，
 * 环境变量 ADMIN_TOKEN、TURNSTILE_SECRET、ALLOW_ORIGIN、SALT。
 */
import { createApp, isBot, visitorKey, originAllowed, ipFrom, type AppOptions } from './app.ts';
import { d1Store, type D1Like } from './d1.ts';

export { OnlinePresence } from './presence-do.ts';

interface Env {
  DB: D1Like;
  /** 没绑定就没有在线人数 */
  ONLINE?: { idFromName(name: string): unknown; get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> } };
  ADMIN_TOKEN?: string;
  TURNSTILE_SECRET?: string;
  ALLOW_ORIGIN?: string;
  SALT?: string;
  AUTO_APPROVE?: AppOptions['autoApprove'];
}

export default {
  async fetch(req: Request, env: Env, ctx: unknown) {
    // 全站只有一个在线名单
    const presence = env.ONLINE ? env.ONLINE.get(env.ONLINE.idFromName('site')) : null;
    const url = new URL(req.url);

    // 在线访客的 WebSocket：交给 Durable Object（规则同 node.ts）
    if (url.pathname === '/online/ws') {
      if (!presence) return new Response('没有绑定在线访客的 Durable Object（ONLINE）', { status: 501 });
      const ua = req.headers.get('user-agent') ?? '';
      const watch = url.searchParams.has('watch') || isBot(ua);
      if (!watch && !originAllowed(env.ALLOW_ORIGIN, req.headers.get('origin'))) return new Response('Forbidden', { status: 403 });
      const visitor = watch ? '' : await visitorKey(env.SALT ?? 'mori', url.searchParams.get('visitor'), ipFrom((k) => req.headers.get(k)), ua);
      return presence.fetch(`https://online/ws?visitor=${visitor}`, { headers: req.headers });
    }

    const app = createApp({
      store: d1Store(env.DB), adminToken: env.ADMIN_TOKEN, turnstileSecret: env.TURNSTILE_SECRET,
      allowOrigin: env.ALLOW_ORIGIN, salt: env.SALT, autoApprove: env.AUTO_APPROVE,
      online: presence ? async () => ((await (await presence.fetch('https://online/count')).json()) as { online: number }).online : undefined,
      onView: presence ? async (views) => { await presence.fetch('https://online/views', { method: 'POST', body: String(views) }); } : undefined,
    });
    return app.fetch(req, env, ctx as any);
  },
};
