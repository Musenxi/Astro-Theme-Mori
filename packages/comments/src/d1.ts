import { SQL, fromDb, insertArgs, statusCounts, type Store, type Status } from './store.ts';

/** Cloudflare D1。表要先建好：`wrangler d1 execute <库名> --file=schema.sql` */
export interface D1Like {
  prepare(sql: string): { bind(...args: any[]): { all(): Promise<{ results: any[] }>; first(): Promise<any>; run(): Promise<{ meta: { changes: number; last_row_id: number } }> } };
}

export function d1Store(db: D1Like): Store {
  const all = async (sql: string, ...a: any[]) => (await db.prepare(sql).bind(...a).all()).results;
  const one = (sql: string, ...a: any[]) => db.prepare(sql).bind(...a).first();
  const run = (sql: string, ...a: any[]) => db.prepare(sql).bind(...a).run();
  return {
    async init() { /* 表由 wrangler d1 execute 建好 */ },
    async insert(c) { return (await run(SQL.insert, ...insertArgs(c))).meta.last_row_id; },
    async get(id) { const r = await one(SQL.get, id); return r ? fromDb(r) : null; },
    async listApproved(entry) { return (await all(SQL.listApproved, entry)).map(fromDb); },
    async listAdmin(status, limit, entry) { return (await all(SQL.listAdmin, status ?? null, status ?? null, entry ?? null, entry ?? null, limit)).map(fromDb); },
    async countByStatus() { return statusCounts(await all(SQL.count)); },
    async setStatus(id, status: Status) { return (await run(SQL.setStatus, status, id)).meta.changes > 0; },
    async remove(id) { return (await run(SQL.remove, id, id)).meta.changes > 0; },
    async countRecentByIp(ip, since) { return (await one(SQL.countRecentByIp, ip, since)).n; },
    async hasApprovedBefore(emailHash, name, ipHash) {
      if (emailHash) return !!(await one(SQL.approvedByEmail, emailHash));
      return ipHash ? !!(await one(SQL.approvedByNameIp, name, ipHash)) : false;
    },
  };
}
