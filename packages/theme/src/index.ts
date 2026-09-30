import type { AstroIntegration } from 'astro';
import { statSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { resolveConfig, type MoriUserConfig } from './config.ts';

export { defineMoriConfig } from './config.ts';
export type { MoriUserConfig, MoriCategory, MoriNavItem, MoriPublish, MoriComments } from './config.ts';

const VIRTUAL = 'virtual:mori/config';

/**
 * 读 mori.config.ts。astro.config.mjs 里用它代替普通的 import：
 *   integrations: [mori(await loadMoriConfig(new URL('./mori.config.ts', import.meta.url)))]
 * 原因：`astro dev` 在配置文件变了以后是原地重启的，普通 import 进来的 mori.config.ts 会被缓存，
 * 在 Studio 里改了设置（订阅内容、主题色……）预览读到的还是旧的。这里按文件的修改时间换一个地址去导入，每次重启都读到最新的。
 */
export async function loadMoriConfig(file: URL): Promise<MoriUserConfig> {
  return (await import(`${file.href}?v=${statSync(fileURLToPath(file)).mtimeMs}`)).default;
}

/**
 * astro.config.mjs：
 *   import mori from 'astro-mori';
 *   export default defineConfig({ integrations: [mori(moriConfig)] });
 * 页面由主题包注入，用户项目里只放内容（src/content）和配置。
 */
export default function mori(userConfig: MoriUserConfig): AstroIntegration {
  const config = resolveConfig(userConfig);
  return {
    name: 'astro-mori',
    hooks: {
      'astro:config:setup': ({ injectRoute, updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [
              tailwindcss(),
              {
                name: 'mori-config',
                resolveId: (id) => (id === VIRTUAL ? `\0${VIRTUAL}` : undefined),
                load: (id) => (id === `\0${VIRTUAL}` ? `export default ${JSON.stringify(config)}` : undefined),
              },
            ],
          },
        });
        injectRoute({ pattern: '/', entrypoint: 'astro-mori/pages/index.astro' });
        injectRoute({ pattern: '/search', entrypoint: 'astro-mori/pages/search.astro' });
        injectRoute({ pattern: '/search.json', entrypoint: 'astro-mori/pages/search.json.ts' });
        // 订阅地址是 /feed；/rss.xml 保留为同一份内容的别名，已经订阅了旧地址的读者不受影响
        injectRoute({ pattern: '/feed', entrypoint: 'astro-mori/pages/rss.xml.ts' });
        injectRoute({ pattern: '/rss.xml', entrypoint: 'astro-mori/pages/rss.xml.ts' });
        injectRoute({ pattern: '/sitemap.xml', entrypoint: 'astro-mori/pages/sitemap.xml.ts' });
        injectRoute({ pattern: '/robots.txt', entrypoint: 'astro-mori/pages/robots.txt.ts' });
        injectRoute({ pattern: '/favicon.svg', entrypoint: 'astro-mori/pages/favicon.svg.ts' });
        injectRoute({ pattern: '/404', entrypoint: 'astro-mori/pages/404.astro' });
        injectRoute({ pattern: '/posts/[slug]', entrypoint: 'astro-mori/pages/post.astro' });
        injectRoute({ pattern: '/posts', entrypoint: 'astro-mori/pages/posts-index.astro' });
        // 游记并入文章以后网址是 /posts/<id>/；旧的 /travels/… 跳转过去，收藏和外链不失效
        injectRoute({ pattern: '/travels', entrypoint: 'astro-mori/pages/legacy-travels.astro' });
        injectRoute({ pattern: '/travels/[slug]', entrypoint: 'astro-mori/pages/legacy-travel.astro' });
        injectRoute({ pattern: '/archive', entrypoint: 'astro-mori/pages/archive.astro' });
        // 独立页面：/<文件名>/（静态路由优先，所以不会盖住上面这些）
        injectRoute({ pattern: '/[page]', entrypoint: 'astro-mori/pages/page.astro' });
        injectRoute({ pattern: '/category/[id]', entrypoint: 'astro-mori/pages/category.astro' });
      },
    },
  };
}
