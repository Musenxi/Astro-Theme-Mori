import { plugin as shadcn } from '@shadcn/lint';
import tsParser from '@typescript-eslint/parser';
import * as astroParser from 'astro-eslint-parser';
import { defineConfig } from 'eslint/config';

/**
 * 检查主题里的 Tailwind 类名。Tailwind 入口是 src/styles/mori.css（components.json 里指过）。
 * 这是一套手工排的刊物版式：字号、字距、行距、留白都是排出来的精确值（clamp、em、px），所以这些类别允许写任意值；
 * 颜色一律走令牌（不许 bg-pink-500，也不许任意色值）。
 */
const hooks = [
  // 脚本（scripts/*.ts）用来找元素的类名，没有样式
  'dg', 'dot', 'f-sec', 'f-sh', 'fcon', 'fo-more', 'he', 'he-item', 'here', 'itin', 'lab', 'lb-img', 'map', 'mark', 'route-p', 't-end', 't-hero',
];

export default defineConfig([
  {
    files: ['src/**/*.astro'],
    languageOptions: { parser: astroParser, parserOptions: { parser: tsParser, extraFileExtensions: ['.astro'] } },
    plugins: { shadcn },
    rules: {
      'shadcn/no-unknown-classes': ['error', { allow: hooks }],
      'shadcn/no-raw-colors': 'error',
      'shadcn/no-arbitrary-values': ['error', { allow: ['typography', 'spacing', 'shape', 'effects', 'motion', 'layout'] }],
      'shadcn/no-inline-styles': 'error',
      'shadcn/require-static-classes': 'error',
    },
  },
]);
