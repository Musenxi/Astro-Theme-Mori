import { existsSync, readdirSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import type { Loader } from 'astro/loaders';
import { entrySchema, pageSchema, friendSchema } from './schema.ts';
import schemaSource from './schema.ts?raw';
import flowSource from '../lib/flow.mjs?raw';

/**
 * Astro 的内容缓存只看 content.config.ts 有没有变，schema（和旧游记的转换）变了它不会重新解析没改过的文件，
 * 页面就会拿着旧结构的数据渲染。这里给每个集合的 loader 套一层：schema 的源码变了，就清掉这个集合的缓存。
 */
const schemaVersion = createHash('md5').update(schemaSource).update(flowSource).digest('hex').slice(0, 12);
const fresh = (loader: Loader): Loader => ({
  ...loader,
  async load(ctx) {
    if (ctx.meta.get('mori-schema') !== schemaVersion) {
      ctx.store.clear();
      ctx.meta.set('mori-schema', schemaVersion);
    }
    return loader.load(ctx);
  },
});

export * from './schema.ts';

/**
 * 内容集合（src/content.config.ts 用）。内容都是 JSON：
 *   src/content/posts/*.json    文章（普通文章和游记）
 *   src/content/pages/*.json    独立页面（关于、留言……），网址是 /<文件名>/
 *   src/content/friends.json    友人帐（一个数组，每位一项，要有 id）；没有这个文件就是空的
 */
export function moriCollections(base = './src/content') {
  // 构建（astro build）读已发布的版本 src/published；开发时读正在写的 src/content。没有发布过的旧内容（没标草稿的）先补一份
  const building = process.argv.includes('build');
  if (building) seedPublished(base, './src/published');
  const live = building ? './src/published' : base;
  return {
    posts: defineCollection({ loader: fresh(glob({ pattern: '**/*.json', base: `${live}/posts` })), schema: entrySchema }),
    pages: defineCollection({ loader: fresh(glob({ pattern: '**/*.json', base: `${live}/pages` })), schema: pageSchema }),
    friends: defineCollection({ loader: existsSync(`${base}/friends.json`) ? fresh(file(`${base}/friends.json`)) : () => [], schema: friendSchema }),
  };
}

function seedPublished(from: string, to: string) {
  for (const dir of ['posts', 'pages']) {
    mkdirSync(`${to}/${dir}`, { recursive: true });
    if (!existsSync(`${from}/${dir}`)) continue;
    for (const f of readdirSync(`${from}/${dir}`).filter((f) => f.endsWith('.json'))) {
      if (existsSync(`${to}/${dir}/${f}`)) continue;
      try {
        if (!JSON.parse(readFileSync(`${from}/${dir}/${f}`, 'utf8')).draft) copyFileSync(`${from}/${dir}/${f}`, `${to}/${dir}/${f}`);
      } catch { /* 语法错误的文件让 Astro 自己报 */ }
    }
  }
}
