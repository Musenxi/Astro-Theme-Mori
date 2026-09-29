/**
 * Cloudflare Workers 入口。绑定见 wrangler.example.toml：D1 库 `DB`，环境变量 ADMIN_TOKEN、TURNSTILE_SECRET、ALLOW_ORIGIN、SALT。
 */
import { createApp, type AppOptions } from './app.ts';
import { d1Store, type D1Like } from './d1.ts';

interface Env {
  DB: D1Like;
  ADMIN_TOKEN?: string;
  TURNSTILE_SECRET?: string;
  ALLOW_ORIGIN?: string;
  SALT?: string;
  AUTO_APPROVE?: AppOptions['autoApprove'];
}

export default {
  fetch(req: Request, env: Env, ctx: unknown) {
    const app = createApp({
      store: d1Store(env.DB), adminToken: env.ADMIN_TOKEN, turnstileSecret: env.TURNSTILE_SECRET,
      allowOrigin: env.ALLOW_ORIGIN, salt: env.SALT, autoApprove: env.AUTO_APPROVE,
    });
    return app.fetch(req, env, ctx as any);
  },
};
