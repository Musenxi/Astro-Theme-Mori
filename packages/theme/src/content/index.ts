import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { entrySchema, pageSchema, friendSchema } from './schema.ts';

export * from './schema.ts';

/**
 * 在用户项目的 src/content.config.ts 里：
 *   import { moriCollections } from 'astro-mori/content';
 *   export const collections = moriCollections();
 * 内容都是 JSON：
 *   src/content/posts/*.json    文章（普通文章和游记）
 *   src/content/pages/*.json    独立页面（关于、留言……），网址是 /<文件名>/
 *   src/content/friends.json    友人帐（一个数组，每位一项，要有 id）
 */
export function moriCollections(base = './src/content') {
  return {
    posts: defineCollection({ loader: glob({ pattern: '**/*.json', base: `${base}/posts` }), schema: entrySchema }),
    pages: defineCollection({ loader: glob({ pattern: '**/*.json', base: `${base}/pages` }), schema: pageSchema }),
    friends: defineCollection({ loader: file(`${base}/friends.json`), schema: friendSchema }),
  };
}
