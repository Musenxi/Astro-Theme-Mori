import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/**
 * 填充式输入框：平时是一块浅色底，聚焦时变亮，边缘出现一圈很淡的墨色（不用主题色）。
 * Textarea、Select 的触发器和标签输入共用这一套。
 */
const fieldVariants = cn(
  'rounded-md border border-transparent bg-input [box-shadow:var(--input-shadow)] transition-[background-color,border-color,box-shadow] ease-plain',
  'not-disabled:hover:bg-input-hover',
  '[&:is(:focus,:focus-within,[data-state=open])]:border-focus-line [&:is(:focus,:focus-within,[data-state=open])]:bg-popover [&:is(:focus,:focus-within,[data-state=open])]:[box-shadow:0_0_0_4px_color-mix(in_srgb,var(--foreground)_7%,transparent)] [&:is(:focus,:focus-within,[data-state=open])]:outline-none',
);

/** mono 等宽（网址名、文件名）；title 编辑器里的大标题，平时融进背景；pill / search 胶囊形的搜索框 */
const inputVariants = cva('', {
  variants: {
    variant: {
      default: '',
      mono: 'mono',
      title: 'serif h-auto rounded-xl bg-transparent px-3 py-2 text-30 leading-tight font-medium hover:bg-foreground/[.035] focus:bg-transparent',
      pill: 'rounded-full px-4',
      search: 'rounded-full pl-9',
    },
  },
  defaultVariants: { variant: 'default' },
});

function Input({ className, type, variant, ...props }: ComponentProps<'input'> & VariantProps<typeof inputVariants>) {
  return <input type={type} data-slot="input" className={cn(fieldVariants, 'h-9 w-full px-3 text-13-5 placeholder:text-muted-foreground/80 disabled:opacity-50 aria-invalid:text-destructive', inputVariants({ variant }), className)} {...props} />;
}

export { Input, fieldVariants, inputVariants };
