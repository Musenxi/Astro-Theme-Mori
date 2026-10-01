import { plugin as shadcn } from '@shadcn/lint';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';

/** 检查 Studio 界面里的 Tailwind 类名（app/components.json 指向 app/src/index.css） */
export default defineConfig([
  {
    files: ['app/src/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { shadcn, 'react-hooks': reactHooks },
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
      'shadcn/no-unknown-classes': 'error',
      'shadcn/no-raw-colors': 'error',
      'shadcn/no-arbitrary-values': ['error', { allow: ['motion', 'effects', 'grid-cols-*', 'grid-rows-*', 'aspect-*', 'max-h-*', 'top-*', 'left-*', 'w-*', 'pl-[3.4rem]'] }],
      'shadcn/no-inline-styles': 'error',
      'shadcn/require-static-classes': 'error',
      'shadcn/no-restyle': ['error', { allow: ['layout'] }],
    },
  },
  {
    // 排版视图照着主题的读法版式排：em、字距、行距都是主题里的原值
    files: ['app/src/editor/travel-layout.tsx'],
    rules: { 'shadcn/no-arbitrary-values': 'off' },
  },
]);
