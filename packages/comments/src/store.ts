export type Status = 'pending' | 'approved' | 'hidden';

/** 数据库里的一行（驼峰命名，字段含义见 schema.sql） */
export interface CommentRow {
  id: number;
  entry: string;
  block: string | null;
  start: number | null;
  end: number | null;
  quote: string | null;
  prefix: string | null;
  suffix: string | null;
  body: string;
  name: string;
  emailHash: string | null;
  avatarHash: string | null;
  url: string | null;
  ipHash: string | null;
  createdAt: number;
  status: Status;
  parentId: number | null;
}

export type NewComment = Omit<CommentRow, 'id'>;

/**
 * 存储层的接口：Node 用 SQLite，Cloudflare Workers 用 D1，SQL 是同一套。
 * 全部是异步的（D1 只有异步接口）。
 */
export interface Store {
  init(): Promise<void>;
  insert(c: NewComment): Promise<number>;
  get(id: number): Promise<CommentRow | null>;
  /** 某篇文章下已通过的评论，按时间从早到晚 */
  listApproved(entry: string): Promise<CommentRow[]>;
  /** 管理用：按状态、按文章筛选（都不给就是全部），新的在前 */
  listAdmin(status: Status | undefined, limit: number, entry?: string): Promise<CommentRow[]>;
  countByStatus(): Promise<Record<Status, number>>;
  setStatus(id: number, status: Status): Promise<boolean>;
  /** 删除；有回复时回复一起删 */
  remove(id: number): Promise<boolean>;
  /** 这个 IP 在 since 之后发了几条（限流用） */
  countRecentByIp(ipHash: string, since: number): Promise<number>;
  /** 这个人以前有没有被通过的评论（决定要不要先审后发） */
  hasApprovedBefore(emailHash: string | null, name: string, ipHash: string | null): Promise<boolean>;

  /* 阅读量（在线访客不进数据库，见 presence.ts） */
  /** 这位读者上一次被计数地读这一篇是什么时候；没有就是 null */
  lastView(visitor: string, entry: string): Promise<number | null>;
  /** 记一次阅读：这一篇的次数加一，记下时间 */
  addView(visitor: string, entry: string, at: number): Promise<void>;
  /** 删掉 before 之前的“最近阅读”记录 */
  pruneViews(before: number): Promise<void>;
  viewsOf(entry: string): Promise<number>;
  /** 全站阅读量 */
  totalViews(): Promise<number>;
  /** 每篇的阅读量，多的在前 */
  listViews(): Promise<Array<{ entry: string; views: number }>>;
}

/** SQL 的公共部分：SQLite 和 D1 都是 `?` 占位符 */
export const SQL = {
  insert: `INSERT INTO comments (entry, block, start, "end", quote, prefix, suffix, body, name, email_hash, avatar_hash, url, ip_hash, created_at, status, parent_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  get: `SELECT * FROM comments WHERE id = ?`,
  listApproved: `SELECT * FROM comments WHERE entry = ? AND status = 'approved' ORDER BY created_at ASC, id ASC`,
  // 筛选条件传 NULL 表示不限；SQLite 和 D1 都是同一条语句
  listAdmin: `SELECT * FROM comments WHERE (? IS NULL OR status = ?) AND (? IS NULL OR entry = ?) ORDER BY created_at DESC, id DESC LIMIT ?`,
  count: `SELECT status, COUNT(*) AS n FROM comments GROUP BY status`,
  setStatus: `UPDATE comments SET status = ? WHERE id = ?`,
  remove: `DELETE FROM comments WHERE id = ? OR parent_id = ?`,
  countRecentByIp: `SELECT COUNT(*) AS n FROM comments WHERE ip_hash = ? AND created_at > ?`,
  approvedByEmail: `SELECT 1 AS x FROM comments WHERE email_hash = ? AND status = 'approved' LIMIT 1`,
  approvedByNameIp: `SELECT 1 AS x FROM comments WHERE name = ? AND ip_hash = ? AND status = 'approved' LIMIT 1`,

  lastView: `SELECT at FROM view_recent WHERE visitor = ? AND entry = ?`,
  markView: `INSERT INTO view_recent (visitor, entry, at) VALUES (?, ?, ?) ON CONFLICT (visitor, entry) DO UPDATE SET at = excluded.at`,
  addView: `INSERT INTO views (entry, count) VALUES (?, 1) ON CONFLICT (entry) DO UPDATE SET count = count + 1`,
  pruneViews: `DELETE FROM view_recent WHERE at < ?`,
  viewsOf: `SELECT count FROM views WHERE entry = ?`,
  listViews: `SELECT entry, count AS views FROM views ORDER BY count DESC, entry ASC`,
  totalViews: `SELECT COALESCE(SUM(count), 0) AS n FROM views`,
};

/** 数据库列 → 驼峰 */
export const fromDb = (r: any): CommentRow => ({
  id: r.id, entry: r.entry, block: r.block, start: r.start, end: r.end, quote: r.quote, prefix: r.prefix, suffix: r.suffix,
  body: r.body, name: r.name, emailHash: r.email_hash, avatarHash: r.avatar_hash ?? null, url: r.url ?? null, ipHash: r.ip_hash, createdAt: r.created_at, status: r.status, parentId: r.parent_id,
});

export const insertArgs = (c: NewComment) => [c.entry, c.block, c.start, c.end, c.quote, c.prefix, c.suffix, c.body, c.name, c.emailHash, c.avatarHash, c.url, c.ipHash, c.createdAt, c.status, c.parentId];

export const statusCounts = (rows: Array<{ status: Status; n: number }>): Record<Status, number> => {
  const out: Record<Status, number> = { pending: 0, approved: 0, hidden: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
};
