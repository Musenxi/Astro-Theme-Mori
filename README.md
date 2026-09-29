# MORI

一个安静的、编辑排版式的 Astro 博客主题：竖排文字、游记（竖向 / 混合 / 横向三种读法）、剪影地图、克莱因蓝的单一强调色。

> 状态：开发中（v0.0.x）。主题已经可用：首页、文章、游记（三种读法、剪影地图）、刻度页（归档 / 栏目）、看大图。Studio 编辑器有了雏形。自建评论还没做。
> 需求与设计决定见 [docs/需求草案.md](docs/需求草案.md)，视觉的实物参照是 [design/style-probe](design/style-probe/index.html)。

## 目录

```
packages/theme     主题包 astro-mori（Astro 集成：注入页面、样式、脚本、字体）
packages/studio    Studio：本地写作与排版编辑器（读写项目里的内容文件）
examples/demo      示例站：只有内容（src/content）和配置（mori.config.ts）
design/style-probe 风格试样（所有视觉决定的实物参照）
docs               需求草案、写作指南
```

## 本地跑起来

需要 Node ≥ 22.12 和 pnpm。

```bash
pnpm install
pnpm dev        # 示例站，http://localhost:4321
pnpm build      # 静态构建到 examples/demo/dist
pnpm studio     # Studio 编辑器，http://127.0.0.1:4400
pnpm check      # 主题包的 TypeScript 检查
pnpm test       # Studio 的测试
```

## 在自己的站里使用

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import mori from 'astro-mori';
import moriConfig from './mori.config.ts';

export default defineConfig({ integrations: [mori(moriConfig)] });
```

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
  accent: '#002fa7',                   // 唯一的强调色；亮暗两个版本由 OKLCH 自动推出
  categories: [                        // 栏目；文章的 category 引用这里的 id
    { id: 'journeys', zh: '游记', en: 'Journeys', empty: '没写游记' },
    { id: 'essays', zh: '随笔', en: 'Essays' },
  ],
  home: { direction: 'h', editorNote: '……' },   // 首页排法：h 横排 / v 竖排；目次旁的编者按
  archive: { direction: 'h' },                   // 归档 / 栏目刻度页的排法
});
```

内容放在 `src/content/posts/*.json`（普通文章）和 `src/content/travels/*.json`（游记）。格式见 [写作指南](docs/写作指南.md)。
站点会生成：`/`、`/posts/`、`/posts/<id>/`、`/travels/`、`/travels/<id>/`、`/archive/`、`/category/<id>/`、`/rss.xml`、`/sitemap.xml`、`/robots.txt`、`/favicon.svg`。

## Studio

```bash
pnpm studio          # 在站点项目里运行；默认 http://127.0.0.1:4400
```

- 读写项目里的内容 JSON，自动保存；保存时用主题同一份 schema 校验，问题会列出来（不阻止保存）。删除是移进 `.mori-trash/`。
- 普通文章：块编辑（拖动排序）、行内标记（`**粗**`、`{文字|note:n1}` 旁注……）、旁注脚注、置顶设置。
- 游记：站点、读法、七种块的表单；自由排布可以在画布上直接拖动图片。
- “预览”用项目自己的 `astro dev` 渲染真实主题（项目已经在跑 dev 就直接复用）；图库支持拖入图片。
- 设置：刊名、简介、主题色（亮暗两个版本实时预览），只改 `mori.config.ts` 里对应的那一行。
- 构建与发布：在 `mori.config.ts` 里加发布目标，然后在 Studio 里点“构建并发布”：

```ts
publish: { target: 'rsync', dest: 'user@host:/var/www/site/' }                  // VPS（需要本机能 ssh 过去）
publish: { target: 'cloudflare-pages', project: 'my-site' }                      // 先在本机 wrangler login
```

## 从 Markdown 迁移

```bash
pnpm exec mori-md import 旧文章.md --out src/content/posts --category essays
pnpm exec mori-md export src/content/posts/某篇.json --out 备份目录
```

只处理普通文章（段落、标题、引用、图片、列表、代码、行内粗斜体链接、脚注）。游记的位置参数、自由排布没有 Markdown 对应物。

## 许可

代码：GPL-3.0。示例内容里的图片是程序生成的占位图。地图数据来自 Natural Earth（公有领域）。西文字体 Cormorant Garamond：SIL OFL 1.1。
