# MORI

一个安静的、编辑排版式的 Astro 博客主题：竖排文字、横滚（任何一篇都能开竖向 / 混合 / 横向三种读法）、剪影地图（正文里标地点）、克莱因蓝的单一强调色。

> 状态：开发中（v0.0.x）。已经有：首页、文章（可开三种读法、剪影地图）、刻度页（归档 / 分类）、看大图、自建评论（含划词引用评论）、第三方评论接入、Studio 编辑器（Markdown 写作、页面与友人帐、文件、预览、评论管理、构建发布）。还没有：桌面版打包、专题地图（MapLibre）。已有站内搜索和四种界面语言（zh-CN / zh-TW / en / ja）。
> 需求与设计决定见 [docs/需求草案.md](docs/需求草案.md)，视觉的实物参照是 [design/style-probe](design/style-probe/index.html)。

## 开始使用

这个仓库本身就是一个站点：克隆下来就能跑，往 `src/content/` 里写内容就是你的博客。仓库里只有主题，内容目录是空的。

1. 在 GitHub 上点 **Use this template**（或 Fork），建一个自己的仓库，克隆到本机。
2. 安装并运行（需要 Node ≥ 22.12 和 pnpm）：

```bash
pnpm install
pnpm dev        # http://localhost:4321
```

3. 改 `mori.config.ts`（刊名、分类、主题色……只写要改的项，其余用默认值，每一项的说明在 `src/config.ts`）。
4. 在 `src/content/` 里写文章，图片放 `src/assets/`。可以直接编辑 JSON（格式见 [写作指南](docs/写作指南.md)），也可以用 [Studio](#studio)。
5. 以后主题有更新：`pnpm theme:update`（从模板仓库拉更新，合并到当前分支）。

## 目录

```
src/content/       内容（仓库里是空的）：文章（posts/）、独立页面（pages/）、友人帐（friends.json）
src/assets/        内容里用到的图片
mori.config.ts     站点配置
src/               主题：页面（pages/，普通的 Astro 文件路由）、组件、样式、脚本、内容格式（schema/）
public/            原样复制到站点根目录的文件
deploy/            VPS 的 Docker Compose + Caddy 模板、GitHub Actions 模板
design/style-probe 风格试样（所有视觉决定的实物参照）
docs/              需求草案、写作指南
```

## 命令

```bash
pnpm dev           # 站点 http://localhost:4321
pnpm build         # 静态构建到 dist/
pnpm preview       # 预览构建结果
pnpm check         # TypeScript 检查
pnpm lint          # Tailwind 类名检查（@shadcn/lint：不存在的类名、原始色值、行内样式）
pnpm test          # 测试
pnpm theme:update  # 从模板仓库合并主题更新
```

## 配置

```ts
// mori.config.ts
import { defineMoriConfig } from './src/config.ts';

export default defineMoriConfig({
  title: 'MORI',                       // 刊名，页头左上角
  lang: 'zh-CN',                       // 界面语言：zh-CN / zh-TW / en / ja（英文站自动关闭竖排和手卷方向）
  accent: '#002fa7',                   // 唯一的强调色；亮暗两个版本由 OKLCH 自动推出
  categories: [                        // 分类；文章的 category 引用这里的 id
    { id: 'journeys', zh: '游记', en: 'Journeys', empty: '没写游记' },
    { id: 'essays', zh: '随笔', en: 'Essays' },
  ],
  home: { style: 'quote', count: 4, direction: 'h', editorNote: '……' },   // 首页版式：quote 引文开篇 / cover 封面版 / list 文章列表；count 展示几篇（1–8），置顶的排前面，不够用最新的补；排法：h 横排 / v 竖排；目次旁的编者按
  archive: { direction: 'h' },                   // 归档 / 分类刻度页的排法
  head: `<script async src="https://www.googletagmanager.com/gtag/js?id=G-…"></script>`,   // 原样插进每页 <head> 的代码（统计脚本之类），只在构建出的站点里有；Studio 设定页里也能改
});
```

文章都放在 `src/content/posts/*.json`，只有一种结构：横滚（读法）和地图是每篇自己的设置，地点是正文里标出来的（不绑定标题）。以前的游记文件（有 `stops`）不用改，读取时自动转成现在的结构。
站点会生成：`/`、`/posts/`、`/posts/<id>/`（旧的 `/travels/…` 会跳转过来）、`/archive/`、`/category/<id>/`、`/<页面名>/`、`/search/`、`/feed`（RSS 订阅，`/rss.xml` 是它的别名）、`/sitemap.xml`、`/robots.txt`、`/favicon.svg`。

## Studio

写作与排版编辑器是单独的项目 [Mori-Studio](https://github.com/Musenxi/Mori-Studio)：

```bash
node <Mori-Studio 目录>/bin/mori-studio.mjs --root .
```

“构建并发布”的目标写在 `mori.config.ts` 里：

```ts
publish: { target: 'rsync', dest: 'user@host:/var/www/site/' }                  // VPS（需要本机能 ssh 过去）
publish: { target: 'cloudflare-pages', project: 'my-site' }                      // 先在本机 wrangler login
```

## 评论

二选一，互相隔离，在 `mori.config.ts` 里配：

```ts
comments: { provider: 'mori', endpoint: 'https://你的域名/_comments', turnstileSiteKey: '…' }   // 自建：文末评论 + 划词引用评论
comments: { provider: 'giscus', repo: '…', repoId: '…', category: '…', categoryId: '…' }        // 第三方：只有文末评论
// 也支持 waline（serverURL）、twikoo（envId）、artalk（server、site）
```

- **自建评论**（单独的项目 [Mori-Comment](https://github.com/Musenxi/Mori-Comment)，部署和升级见那边）：读者选中正文里的一段文字就能针对这段发表评论；引用评论和普通评论一起显示在文末评论区，带着引用的原文，点一下回到正文并临时高亮，正文里不留记号。文章改动后按“块 id + 位置 → 原文 + 前后文”重新定位，找不到的引用旁标“原文已修改”。
- 第一次留言的人先审后发；蜜罐、按 IP 限流、可选 Turnstile。邮箱和 IP 只存加盐哈希。
- **昵称、邮箱、网站**：读者留言时昵称和邮箱必填（表单里带 `*`），网站可不填（只收 http / https，名字会带上链接，`nofollow ugc`）。邮箱用来显示头像，不公开；头像用 Gravatar 那一套：评论服务对外只给“小写邮箱的 MD5”，站点按 `comments.avatar` 拼图片地址——`'cravatar'`（默认，Gravatar 的国内镜像）、`'gravatar'`、`'none'`（不显示），或含 `{hash}` 的自己的服务地址（如 `'https://avatars.example.com/{hash}'`）；没设过头像的读者显示几何图案（identicon）。也可以在 Studio 的“设定 → 评论”里选。注意：头像哈希是公开的，和 Gravatar 一样，知道某个邮箱的人能核对它是不是这位读者。
- **阅读量、在线访客**：也记在自建评论服务里。文章、页面打开时记一次阅读（同一位读者半小时内重复打开只算一次，爬虫不计），阅读量显示在文章页头。在线访客用 WebSocket：页面开着就连着 `/online/ws`，连着就算在线，人数一变就推送，Studio 仪表盘上实时显示。读者只用浏览器里随机生成的 id 区分，服务端存的是加盐哈希。Node 版在线名单放在内存里；Cloudflare 版要绑定一个 Durable Object（见 `wrangler.example.toml`），反向代理要放行 WebSocket（Caddy 默认就行）。
- 管理在 Studio 的“评论”页：待审列表、通过 / 隐藏 / 删除；保存文章时，如果改动会让已有引用评论找不到原文，会先提醒。

## 从 Markdown 迁移

```bash
pnpm exec mori-md import 旧文章.md --out src/content/posts --category essays
pnpm exec mori-md export src/content/posts/某篇.json --out 备份目录
```

处理段落、标题、引用、图片、列表、代码、行内粗斜体链接、脚注和地点（`[地名](geo:纬度,经度)`）。图组里的图导出成一行行图片；位置、缩放、竖排、自由排布、地图没有 Markdown 对应物，不导出。

## 许可

代码：MIT。地图数据来自 Natural Earth（公有领域）。
