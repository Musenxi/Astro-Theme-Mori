-- MORI 评论：文末评论和划词引用评论是同一种评论，区别只是有没有“钉”在文字上（block 不为空的就是引用评论）
CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entry       TEXT    NOT NULL,              -- posts/<id>（普通文章和游记都在 posts 下）
  block       TEXT,                          -- 引用评论：钉在哪个块（段落）上；文末评论为空
  start       INTEGER,                       -- 引用评论：选区在这个块文字里的起止字符位置
  "end"       INTEGER,
  quote       TEXT,                          -- 引用评论：被选中的原文，和前后各几十个字（文章改动后靠它重新定位）
  prefix      TEXT,
  suffix      TEXT,
  body        TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  email_hash  TEXT,                          -- 邮箱只存哈希
  ip_hash     TEXT,                          -- IP 只存加盐哈希，用来限流
  created_at  INTEGER NOT NULL,              -- 毫秒时间戳
  status      TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden')),
  parent_id   INTEGER REFERENCES comments(id)
);
CREATE INDEX IF NOT EXISTS idx_comments_entry ON comments (entry, status, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_ip ON comments (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments (status, created_at);

-- 游记并入文章之前评论记的是 travels/<id>，改成 posts/<id>（可重复执行）
UPDATE comments SET entry = 'posts/' || substr(entry, 9) WHERE entry LIKE 'travels/%';
