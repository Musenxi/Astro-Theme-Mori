import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap text-13 font-medium transition-[background-color,color,box-shadow,transform,opacity] duration-150 active:scale-97 disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/85',
        secondary: 'bg-foreground/[.06] text-foreground hover:bg-foreground/10',
        ghost: 'text-soft-foreground hover:bg-foreground/[.06] hover:text-foreground',
        danger: 'bg-foreground/[.06] text-destructive hover:bg-foreground/10',
        destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
        link: 'h-8 rounded-md px-2.5 text-soft-foreground hover:bg-foreground/[.06] hover:text-foreground',
        'ghost-danger': 'text-soft-foreground hover:bg-foreground/[.06] hover:text-destructive',
      },
      size: { default: 'h-9 rounded-md px-4', sm: 'h-8 rounded-md px-3', icon: 'h-9 w-9 rounded-full', 'icon-sm': 'h-8 w-8 rounded-full' },
      shape: { pill: 'rounded-full' },
      /** 开着的状态（比如打开的侧栏对应的按钮） */
      active: { true: 'bg-foreground/[.14] hover:bg-foreground/[.18]' },
      /** 平时看不见，悬停所在的组（group / group/block）或聚焦时才出现 */
      reveal: {
        group: 'opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100',
        block: 'opacity-0 transition-opacity focus-visible:opacity-100 group-focus-within/block:opacity-100 group-hover/block:opacity-100',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'default' },
  },
);

function Button({ className, variant, size, shape, active, reveal, asChild = false, type = 'button', ...props }: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp data-slot="button" type={asChild ? undefined : type} className={cn(buttonVariants({ variant, size, shape, active, reveal }), className)} {...props} />;
}

export { Button, buttonVariants };
