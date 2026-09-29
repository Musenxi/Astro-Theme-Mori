import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const button = cva(
  'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap text-[13px] transition-[background-color,color,border-color,transform,opacity] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-paper hover:bg-ink/85',
        secondary: 'border border-rule-2 hover:border-ink-3 hover:bg-sunk',
        ghost: 'text-ink-2 hover:bg-sunk hover:text-ink',
        danger: 'border border-danger/40 text-danger hover:bg-danger/10',
        link: 'h-auto px-0 text-ink-2 underline decoration-rule-2 underline-offset-4 hover:text-accent hover:decoration-accent',
      },
      size: { sm: 'h-7 rounded-sm px-2.5', md: 'h-8 rounded-sm px-3.5', icon: 'h-8 w-8 rounded-sm', 'icon-sm': 'h-7 w-7 rounded-sm' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={cn(button({ variant, size }), variant === 'link' && 'h-auto', className)} {...props} />
));
Button.displayName = 'Button';
