import type { AstroIntegration } from 'astro';
import { resolveConfig, type MoriUserConfig } from './config.ts';

export { defineMoriConfig } from './config.ts';
export type { MoriUserConfig, MoriCategory, MoriNavItem } from './config.ts';

const VIRTUAL = 'virtual:mori/config';

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
              {
                name: 'mori-config',
                resolveId: (id) => (id === VIRTUAL ? `\0${VIRTUAL}` : undefined),
                load: (id) => (id === `\0${VIRTUAL}` ? `export default ${JSON.stringify(config)}` : undefined),
              },
            ],
          },
        });
        injectRoute({ pattern: '/', entrypoint: 'astro-mori/pages/index.astro' });
        injectRoute({ pattern: '/posts/[slug]', entrypoint: 'astro-mori/pages/post.astro' });
        injectRoute({ pattern: '/travels/[slug]', entrypoint: 'astro-mori/pages/travel.astro' });
        injectRoute({ pattern: '/posts', entrypoint: 'astro-mori/pages/posts-index.astro' });
        injectRoute({ pattern: '/travels', entrypoint: 'astro-mori/pages/travels-index.astro' });
        injectRoute({ pattern: '/archive', entrypoint: 'astro-mori/pages/archive.astro' });
        injectRoute({ pattern: '/category/[id]', entrypoint: 'astro-mori/pages/category.astro' });
      },
    },
  };
}
