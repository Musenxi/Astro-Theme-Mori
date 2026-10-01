import { defineConfig } from 'astro/config';
import mori, { loadMoriConfig } from './src/integration.ts';

export default defineConfig({
  integrations: [mori(await loadMoriConfig(new URL('./mori.config.ts', import.meta.url)))],
});
