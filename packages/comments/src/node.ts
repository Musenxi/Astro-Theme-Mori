import { serve } from '@hono/node-server';
import { createApp, type AppOptions } from './app.ts';
import { sqliteStore } from './sqlite.ts';

/** Node + SQLite 版本（VPS 上用）。配置来自环境变量，见 bin/mori-comments.mjs */
export async function startNode(o: { dbPath: string; port: number } & Omit<AppOptions, 'store'>) {
  const store = sqliteStore(o.dbPath);
  await store.init();
  const app = createApp({ ...o, store });
  const server = serve({ fetch: app.fetch, port: o.port, hostname: '0.0.0.0' });
  return { app, store, server };
}
