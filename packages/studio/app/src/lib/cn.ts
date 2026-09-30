import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// 自定义的颜色名要告诉 tailwind-merge，否则 text-paper 会被当成字号，和 text-[13px] 互相顶掉
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: ['paper', 'surface', 'sunk', 'sunk-2', 'lift', 'ink', 'ink-2', 'ink-3', 'rule', 'rule-2', 'accent', 'on-accent', 'danger', 'ok', 'warn', 'scrim'],
      shadow: ['panel', 'soft', 'pop'],
      radius: ['xs', 'sm', 'md', 'lg', 'xl', '2xl'],
    },
  },
});

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
