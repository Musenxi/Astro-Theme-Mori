import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const STUDIO = process.env.MORI_STUDIO_URL ?? 'http://127.0.0.1:4400';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: '../dist', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 900 },
  // 开发时：界面走 Vite（热更新），接口和项目里的图片转给本机的 Studio 服务
  server: { port: 5173, proxy: { '/api': STUDIO, '/asset': STUDIO } },
});
