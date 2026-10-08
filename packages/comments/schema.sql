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
  email_hash  TEXT,                          -- 邮箱只存哈希（加盐的，用来判断“是不是老朋友”）
  avatar_hash TEXT,                          -- 头像哈希：小写邮箱的 MD5（Gravatar / Cravatar 认的那种）；老评论没有
  url         TEXT,                          -- 读者留的网址（可选，只接受 http / https）
  ip_hash     TEXT,                          -- IP 只存加盐哈希，用来限流
  created_at  INTEGER NOT NULL,              -- 毫秒时间戳
  status      TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden')),
  parent_id   INTEGER REFERENCES comments(id)
);
CREATE INDEX IF NOT EXISTS idx_comments_entry ON comments (entry, status, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_ip ON comments (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments (status, created_at);

-- 阅读量：每篇一行，累计次数。entry 和评论的一样：posts/<id>、pages/<id>
CREATE TABLE IF NOT EXISTS views (
  entry  TEXT    PRIMARY KEY,
  count  INTEGER NOT NULL DEFAULT 0
);
-- 最近一次被计数的阅读：同一位读者短时间内重复打开同一篇只算一次；过期的行随时删掉
CREATE TABLE IF NOT EXISTS view_recent (
  visitor TEXT    NOT NULL,                  -- 读者标识的加盐哈希（浏览器里随机生成的 id；没有就用 IP + UA）
  entry   TEXT    NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (visitor, entry)
);
CREATE INDEX IF NOT EXISTS idx_view_recent_at ON view_recent (at);

-- 游记并入文章之前评论记的是 travels/<id>，改成 posts/<id>（可重复执行）
UPDATE comments SET entry = 'posts/' || substr(entry, 9) WHERE entry LIKE 'travels/%';
