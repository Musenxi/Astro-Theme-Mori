import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// 自定义的颜色名、字号名要告诉 tailwind-merge，否则 text-soft-foreground 会被当成字号、text-13 会被当成颜色，互相顶掉
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: ['background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground', 'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground', 'accent', 'accent-foreground', 'destructive', 'destructive-foreground', 'border', 'input', 'ring', 'muted-hover', 'soft-foreground', 'border-strong', 'input-hover', 'brand', 'brand-foreground', 'success', 'warning', 'overlay', 'focus-line', 'console', 'console-foreground'],
      text: ['10-5', '11', '11-5', '12', '12-5', '13', '13-5', '14', '14-5', '15', '16', '17', '21', '30', '32', '64', 'smaller', 'sup', 'em-80', 'em-85', 'em-112'],
      leading: ['1-65', '1-7'],
      blur: ['3xs'],
      ease: ['plain'],
      shadow: ['panel', 'soft', 'pop', 'knob', 'focus-line'],
      radius: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3', '11', '22'],
    },
  },
});

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
