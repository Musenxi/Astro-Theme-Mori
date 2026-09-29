import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// 自定义的颜色名要告诉 tailwind-merge，否则 text-paper 会被当成字号，和 text-[13px] 互相顶掉
const twMerge = extendTailwindMerge({
  extend: {
    theme: { color: ['paper', 'surface', 'sunk', 'ink', 'ink-2', 'ink-3', 'rule', 'rule-2', 'accent', 'danger', 'ok', 'warn'] },
  },
});

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
