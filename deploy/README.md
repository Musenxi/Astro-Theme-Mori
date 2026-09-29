# 部署

MORI 输出的是纯静态文件（`dist/`），有两条路：Cloudflare Pages，或者一台 VPS。评论服务（自建）是可选的。

> **这里的模板还没有在真实的服务器 / Cloudflare 账号上跑过。** rsync 发布用本地目录实测过；Docker Compose、Caddyfile、GitHub Actions、wrangler 相关的部分只是按各家文档写的，第一次部署请留意报错。

## 一、Cloudflare Pages

- 在 `mori.config.ts` 里加 `publish: { target: 'cloudflare-pages', project: '项目名' }`，本机先 `wrangler login`，然后在 Studio 里点“构建并发布”（直接上传 `dist/`，不需要 git）。
- 限制：免费版每个站点最多 20,000 个文件、单个文件 25 MiB。游记图片会按多种尺寸输出，照片很多时接近上限——把图片放到 R2、页面留在 Pages（Studio 的分步上传还没做）。
- 自建评论跑在 Workers + D1：见 `packages/comments/wrangler.example.toml` 顶部的四步。

## 二、VPS（Docker Compose）

一台机器搞定：Caddy 自动 HTTPS、静态站、自建评论服务。

```bash
cd deploy
cp .env.example .env        # 填 SITE_DOMAIN、ADMIN_TOKEN、SALT
mkdir site                  # 站点文件放这里
docker compose up -d --build
```

- 域名要先解析到这台机器，Caddy 会自动申请证书。
- 发布：在 `mori.config.ts` 里加 `publish: { target: 'rsync', dest: 'user@host:/path/to/deploy/site/' }`，Studio 里点“构建并发布”。
- 评论服务放在同一个域名的 `/_comments` 下（不跨域）：站点配置里 `comments: { provider: 'mori', endpoint: 'https://你的域名/_comments' }`。
- 备份：评论在 Docker 卷 `comments_data` 里的 `comments.db`（SQLite）。

## 三、GitHub Actions（可选）

习惯用 git 的话，把 `github-actions/deploy.yml` 放到站点项目的 `.github/workflows/` 下，按文件顶部的说明加 Secrets。
