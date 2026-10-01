import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { fieldVariants } from './input';

/** plain 平时融进背景（行内编辑）；code 代码块里的等宽写法 */
const textareaVariants = cva('', {
  variants: {
    variant: {
      default: '',
      plain: 'bg-transparent shadow-none hover:bg-foreground/[.04] focus:bg-popover',
      code: 'font-mono text-12-5 leading-1-65',
    },
  },
  defaultVariants: { variant: 'default' },
});

function Textarea({ className, variant, ...props }: ComponentProps<'textarea'> & VariantProps<typeof textareaVariants>) {
  return <textarea data-slot="textarea" className={cn(fieldVariants, 'min-h-18 w-full px-3 py-2 text-13-5 leading-relaxed placeholder:text-muted-foreground/80 disabled:opacity-50', textareaVariants({ variant }), className)} {...props} />;
}

export { Textarea, textareaVariants };
