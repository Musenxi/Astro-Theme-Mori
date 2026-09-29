import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { postSchema, travelSchema } from './schema.ts';

export * from './schema.ts';

/**
 * 在用户项目的 src/content.config.ts 里：
 *   import { moriCollections } from 'astro-mori/content';
 *   export const collections = moriCollections();
 * 文章是 JSON 文件：src/content/posts/*.json、src/content/travels/*.json
 */
export function moriCollections(base = './src/content') {
  return {
    posts: defineCollection({ loader: glob({ pattern: '**/*.json', base: `${base}/posts` }), schema: postSchema }),
    travels: defineCollection({ loader: glob({ pattern: '**/*.json', base: `${base}/travels` }), schema: travelSchema }),
  };
}
