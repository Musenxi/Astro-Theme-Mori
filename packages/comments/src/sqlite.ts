import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { SQL, fromDb, insertArgs, statusCounts, type Store, type Status } from './store.ts';

/** Node + SQLite（Node 内置的 node:sqlite，不需要编译原生模块） */
export function sqliteStore(path: string): Store {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const all = (sql: string, ...args: any[]) => db.prepare(sql).all(...args) as any[];
  const one = (sql: string, ...args: any[]) => db.prepare(sql).get(...args) as any;
  return {
    async init() { db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')); },
    async insert(c) { return Number(db.prepare(SQL.insert).run(...insertArgs(c)).lastInsertRowid); },
    async get(id) { const r = one(SQL.get, id); return r ? fromDb(r) : null; },
    async listApproved(entry) { return all(SQL.listApproved, entry).map(fromDb); },
    async listAdmin(status, limit) { return (status ? all(SQL.listAdminBy, status, limit) : all(SQL.listAdminAll, limit)).map(fromDb); },
    async countByStatus() { return statusCounts(all(SQL.count)); },
    async setStatus(id, status: Status) { return Number(db.prepare(SQL.setStatus).run(status, id).changes) > 0; },
    async remove(id) { return Number(db.prepare(SQL.remove).run(id, id).changes) > 0; },
    async countRecentByIp(ip, since) { return one(SQL.countRecentByIp, ip, since).n; },
    async hasApprovedBefore(emailHash, name, ipHash) {
      if (emailHash) return !!one(SQL.approvedByEmail, emailHash);
      return ipHash ? !!one(SQL.approvedByNameIp, name, ipHash) : false;
    },
  };
}
