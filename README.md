# MORI

一个安静的、编辑排版式的 Astro 博客主题：竖排文字、游记（竖向 / 混合 / 横向三种读法）、剪影地图、克莱因蓝的单一强调色。

> 状态：开发中（v0.0.x）。已经有：首页、文章、游记（三种读法、剪影地图）、刻度页（归档 / 栏目）、看大图、自建评论（含划词批注）、第三方评论接入、Studio 编辑器（文章 / 游记表单、预览、评论管理、构建发布）。还没有：桌面版打包、专题地图（MapLibre）。已有站内搜索和四种界面语言（zh-CN / zh-TW / en / ja）。
> 需求与设计决定见 [docs/需求草案.md](docs/需求草案.md)，视觉的实物参照是 [design/style-probe](design/style-probe/index.html)。

## 目录

```
packages/theme     主题包 astro-mori（Astro 集成：注入页面、样式、脚本、字体）
packages/studio    Studio：本地写作与排版编辑器（读写项目里的内容文件）
packages/comments  自建评论服务（Hono；Node + SQLite / Cloudflare Workers + D1）
deploy             VPS 的 Docker Compose + Caddy 模板、GitHub Actions 模板
examples/demo      示例站：只有内容（src/content）和配置（mori.config.ts）
design/style-probe 风格试样（所有视觉决定的实物参照）
docs               需求草案、写作指南
```

## 本地跑起来

需要 Node ≥ 22.12 和 pnpm。

```bash
pnpm install
pnpm dev        # 开发模式：示例站 http://localhost:4321 + 本地评论服务 http://127.0.0.1:8787 + Studio http://127.0.0.1:4400（一起启动）
pnpm site       # 只跑示例站
pnpm build      # 静态构建到 examples/demo/dist
pnpm studio     # 只跑 Studio（正常模式），http://127.0.0.1:4400
pnpm comments   # 只跑评论服务（开发用管理令牌是 dev-token，数据库在 packages/comments/.data/）
pnpm check      # 主题包的 TypeScript 检查
pnpm test       # 各包的测试（Studio、评论服务、批注定位）
```

## 在自己的站里使用

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import mori, { loadMoriConfig } from 'astro-mori';

export default defineConfig({
  integrations: [mori(await loadMoriConfig(new URL('./mori.config.ts', import.meta.url)))],
});
```

用 `loadMoriConfig` 读配置，而不是直接 `import`：`astro dev` 在配置变了以后是原地重启的，直接 import 的 `mori.config.ts` 会被缓存，在 Studio 里改了设置，预览读到的还是旧的。

```ts
// src/content.config.ts
import { moriCollections } from 'astro-mori/content';
export const collections = moriCollections();
```

```ts
// mori.config.ts
import { defineMoriConfig } from 'astro-mori';

export default defineMoriConfig({
  title: 'MORI',                       // 刊名，页头左上角
  lang: 'zh-CN',                       // 界面语言：zh-CN / zh-TW / en / ja（英文站自动关闭竖排和手卷方向）
  accent: '#002fa7',                   // 唯一的强调色；亮暗两个版本由 OKLCH 自动推出
  categories: [                        // 栏目；文章的 category 引用这里的 id
    { id: 'journeys', zh: '游记', en: 'Journeys', empty: '没写游记' },
    { id: 'essays', zh: '随笔', en: 'Essays' },
  ],
  home: { style: 'quote', direction: 'h', editorNote: '……' },   // 首页版式：quote 引文开篇 / cover 封面版；排法：h 横排 / v 竖排；目次旁的编者按
  archive: { direction: 'h' },                   // 归档 / 栏目刻度页的排法
});
```

文章都放在 `src/content/posts/*.json`：普通文章和游记同属“文章”，游记只是多了 `"kind": "travel"`（不写的话，有 `stops` 的就是游记）。格式见 [写作指南](docs/写作指南.md)。
站点会生成：`/`、`/posts/`、`/posts/<id>/`（普通文章和游记同一个网址结构；旧的 `/travels/…` 会跳转过来）、`/archive/`、`/category/<id>/`、`/feed`（RSS 订阅，`/rss.xml` 是它的别名）、`/sitemap.xml`、`/robots.txt`、`/favicon.svg`。

## Studio

```bash
pnpm studio          # 在站点项目里运行（正常模式）；默认 http://127.0.0.1:4400
pnpm studio:dev      # 开发模式，等于 mori-studio --dev（在 monorepo 里是 pnpm dev 的一部分）
```

开发模式和正常模式的区别：开发模式下，构建（或构建并发布）完成后会自动重启预览用的 `astro dev`，发布目标里多一个“本地文件夹”，用来在本机试发布流程；正常模式没有这两项。

- 读写项目里的内容 JSON，自动保存；保存时用主题同一份 schema 校验，问题会列出来（不阻止保存）。删除是移进 `.mori-trash/`。
- 普通文章：块编辑（拖动排序）、行内标记（`**粗**`、`{文字|note:n1}` 旁注……）、旁注脚注、置顶设置。
- 游记：站点、读法、七种块的表单；自由排布可以在画布上直接拖动图片；可以导入 GPX 轨迹，或从图库照片的 EXIF（GPS + 拍摄时间）建议站点（按位置和日期聚类，站名自己填）。
- “预览”用项目自己的 `astro dev` 渲染真实主题（项目已经在跑 dev 就直接复用）；图库支持拖入图片。
- 设置：刊名、简介、首页版式（引文版 / 封面版）和排法（横 / 竖）、主题色（亮暗两个版本实时预览），只改 `mori.config.ts` 里对应的那一行。
- 构建与发布：在 `mori.config.ts` 里加发布目标，然后在 Studio 里点“构建并发布”：

```ts
publish: { target: 'rsync', dest: 'user@host:/var/www/site/' }                  // VPS（需要本机能 ssh 过去）
publish: { target: 'cloudflare-pages', project: 'my-site' }                      // 先在本机 wrangler login
```

## 评论

二选一，互相隔离，在 `mori.config.ts` 里配：

```ts
comments: { provider: 'mori', endpoint: 'https://你的域名/_comments', turnstileSiteKey: '…' }   // 自建：文末评论 + 划词批注
comments: { provider: 'giscus', repo: '…', repoId: '…', category: '…', categoryId: '…' }        // 第三方：只有文末评论
// 也支持 waline（serverURL）、twikoo（envId）、artalk（server、site）
```

- **自建评论**（`packages/comments`）：读者选中正文里的一段文字就能针对这段发表评论；批注和普通评论一起显示在文末评论区，带着引用的原文，点一下回到正文并临时高亮，正文里不留记号。文章改动后按“块 id + 位置 → 原文 + 前后文”重新定位，找不到的引用旁标“原文已修改”。
- 第一次留言的人先审后发；蜜罐、按 IP 限流、可选 Turnstile。邮箱和 IP 只存加盐哈希。
- 本地开发：`pnpm dev` 会一起启动评论服务（管理令牌 `dev-token`，Studio 的“评论”页里填这个）。正式部署用环境变量 `ADMIN_TOKEN`。部署：VPS 见 [deploy/](deploy/README.md)，Cloudflare 见 `packages/comments/wrangler.example.toml`。
- 管理在 Studio 的“评论”页：待审列表、通过 / 隐藏 / 删除；保存文章时，如果改动会让已有批注找不到原文，会先提醒。

## 从 Markdown 迁移

```bash
pnpm exec mori-md import 旧文章.md --out src/content/posts --category essays
pnpm exec mori-md export src/content/posts/某篇.json --out 备份目录
```

只处理普通文章（段落、标题、引用、图片、列表、代码、行内粗斜体链接、脚注）。游记的位置参数、自由排布没有 Markdown 对应物。

## 许可

代码：GPL-3.0。示例内容里的图片是程序生成的占位图。地图数据来自 Natural Earth（公有领域）。西文字体 Cormorant Garamond：SIL OFL 1.1。
