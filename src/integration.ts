import type { AstroIntegration } from 'astro';
import { statSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { resolveConfig, type MoriUserConfig } from './config.ts';

export { defineMoriConfig } from './config.ts';
export type { MoriUserConfig, MoriCategory, MoriNavItem, MoriAction, MoriPublish, MoriComments } from './config.ts';

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
 * 主题的 Astro 集成（astro.config.mjs 里用）：把 mori.config.ts 解析后的配置做成虚拟模块 virtual:mori/config，接上 Tailwind。
 * 页面是普通的文件路由，在 src/pages 里。
 */
export default function mori(userConfig: MoriUserConfig): AstroIntegration {
  const config = resolveConfig(userConfig);
  return {
    name: 'astro-mori',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
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
      },
    },
  };
}
