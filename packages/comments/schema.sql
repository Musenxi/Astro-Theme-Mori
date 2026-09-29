-- MORI 评论：文末评论和划词批注是同一种评论，区别只是有没有“钉”在文字上（block 不为空的就是批注）
CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entry       TEXT    NOT NULL,              -- posts/<id> 或 travels/<id>
  block       TEXT,                          -- 批注：钉在哪个块（段落）上；文末评论为空
  start       INTEGER,                       -- 批注：选区在这个块文字里的起止字符位置
  "end"       INTEGER,
  quote       TEXT,                          -- 批注：被选中的原文，和前后各几十个字（文章改动后靠它重新定位）
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
