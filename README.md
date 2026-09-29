# MORI

一个安静的、编辑排版式的 Astro 博客主题：竖排文字、游记（竖向 / 混合 / 横向三种读法）、剪影地图、克莱因蓝的单一强调色。

> 状态：开发中（v0.0.x）。主题骨架已经可用：首页、文章、游记、刻度页（归档 / 栏目）。Studio 编辑器、自建评论还没做。
> 需求与设计决定见 [docs/需求草案.md](docs/需求草案.md)，视觉的实物参照是 [design/style-probe](design/style-probe/index.html)。

## 目录

```
packages/theme     主题包 astro-mori（Astro 集成：注入页面、样式、脚本、字体）
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
pnpm check      # 主题包的 TypeScript 检查
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

## 从 Markdown 迁移

```bash
pnpm exec mori-md import 旧文章.md --out src/content/posts --category essays
pnpm exec mori-md export src/content/posts/某篇.json --out 备份目录
```

只处理普通文章（段落、标题、引用、图片、列表、代码、行内粗斜体链接、脚注）。游记的位置参数、自由排布没有 Markdown 对应物。

## 许可

代码：GPL-3.0。示例内容里的图片是程序生成的占位图。地图数据来自 Natural Earth（公有领域）。西文字体 Cormorant Garamond：SIL OFL 1.1。
