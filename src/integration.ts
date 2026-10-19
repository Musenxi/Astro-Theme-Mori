import type { AstroIntegration } from 'astro';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { resolveConfig, type MoriUserConfig } from './config.ts';
import { scanEmoji } from './lib/emoji.mjs';

export { defineMoriConfig } from './config.ts';
export type { MoriUserConfig, MoriCategory, MoriNavItem, MoriAction, MoriPublish, MoriComments } from './config.ts';

const VIRTUAL = 'virtual:mori/config';
const VIRTUAL_EMOJI = 'virtual:mori/emoji';

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
      'astro:config:setup': ({ config: astro, command, logger, updateConfig }) => {
        const publicDir = fileURLToPath(astro.publicDir);
        if (command === 'build' && !config.site && !astro.site) logger.warn('mori.config.ts 没填 site（站点网址），RSS、sitemap 里的链接会是 http://localhost:4321');
        updateConfig({
          vite: {
            plugins: [
              tailwindcss(),
              {
                name: 'mori-config',
                resolveId: (id) => (id === VIRTUAL ? `\0${VIRTUAL}` : undefined),
                load: (id) => (id === `\0${VIRTUAL}` ? `export default ${JSON.stringify(config)}` : undefined),
              },
              {
                // 表情包：public/emoji/ 里有增删就重新扫描
                name: 'mori-emoji',
                resolveId: (id) => (id === VIRTUAL_EMOJI ? `\0${VIRTUAL_EMOJI}` : undefined),
                load: (id) => (id === `\0${VIRTUAL_EMOJI}` ? `export default ${JSON.stringify(scanEmoji(publicDir, (m) => logger.warn(m)))}` : undefined),
                configureServer(server) {
                  const dir = join(publicDir, 'emoji');
                  server.watcher.add(dir);
                  const changed = (f: string) => {
                    if (!f.startsWith(dir)) return;
                    const mod = server.moduleGraph.getModuleById(`\0${VIRTUAL_EMOJI}`);
                    if (mod) server.moduleGraph.invalidateModule(mod);
                    server.ws.send({ type: 'full-reload' });
                  };
                  for (const ev of ['add', 'unlink', 'change'] as const) server.watcher.on(ev, changed);
                },
              },
            ],
          },
        });
      },
      'astro:build:done': ({ dir, logger }) => {
        dropUploadedOriginals(fileURLToPath(dir), logger);
        stripHtmlComments(fileURLToPath(dir));
      },
    },
  };
}

/**
 * 上传到图床的图，页面里用的是图床外链；但内容集合引用的图片 Astro 构建时总会把原图复制进 _astro/。
 * 这里把这些原图删掉：名字对得上图床清单里的图（原名.哈希.扩展名），并且产物里没有任何文件引用它
 */
function dropUploadedOriginals(out: string, logger: { info: (m: string) => void }) {
  const manifest = join(process.cwd(), 'src/assets/cdn.json');
  const astroDir = join(out, '_astro');
  if (!existsSync(manifest) || !existsSync(astroDir)) return;
  const uploaded = new Set(Object.keys((JSON.parse(readFileSync(manifest, 'utf8')) as { images: Record<string, unknown> }).images).map((p) => `${basename(p, extname(p))}|${extname(p).toLowerCase()}`));
  const candidates = readdirSync(astroDir).filter((f) => {
    const m = /^(.+)\.[\w-]{8}(\.[a-z0-9]+)$/i.exec(f);
    return m && uploaded.has(`${m[1]}|${m[2].toLowerCase()}`);
  });
  if (!candidates.length) return;
  // 产物里的文本文件（页面、订阅、脚本、样式）有没有提到它
  const texts: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(html|xml|json|js|css|txt)$/.test(e.name)) texts.push(readFileSync(f, 'utf8')); } };
  walk(out);
  const unused = candidates.filter((f) => !texts.some((t) => t.includes(f)));
  for (const f of unused) rmSync(join(astroDir, f));
  if (unused.length) logger.info(`图床：去掉 ${unused.length} 张已上传的原图`);
}

/** 模板里的 HTML 注释是写给自己看的，构建后的页面里去掉（保留 IE 条件注释） */
function stripHtmlComments(out: string) {
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith('.html')) {
        const src = readFileSync(f, 'utf8');
        const next = src.replace(/<!--(?!\[if|<!)[\s\S]*?-->/g, '');
        if (next !== src) writeFileSync(f, next);
      }
    }
  };
  walk(out);
}
