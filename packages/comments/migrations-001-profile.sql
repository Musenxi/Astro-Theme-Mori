-- 给已经建好的 D1 数据库补上“头像”和“网址”两列（新建的库直接用 schema.sql，不需要这个）。
-- 只执行一次：wrangler d1 execute <库名> --file=migrations-001-profile.sql
-- （Node + SQLite 的评论服务启动时会自动补，不用手动执行。）
ALTER TABLE comments ADD COLUMN avatar_hash TEXT;
ALTER TABLE comments ADD COLUMN url TEXT;
