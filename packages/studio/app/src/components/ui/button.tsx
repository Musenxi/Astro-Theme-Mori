import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const button = cva(
  'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap text-[13px] font-medium transition-[background-color,color,box-shadow,transform,opacity] duration-150 active:scale-[.97] disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-surface hover:bg-ink/85',
        secondary: 'bg-ink/[.06] text-ink hover:bg-ink/[.1]',
        ghost: 'text-ink-2 hover:bg-ink/[.06] hover:text-ink',
        danger: 'bg-ink/[.06] text-danger hover:bg-ink/[.1]',
        destructive: 'bg-danger text-surface hover:opacity-90',
        link: 'h-8 rounded-md px-2.5 text-ink-2 hover:bg-ink/[.06] hover:text-ink',
      },
      size: { sm: 'h-8 rounded-md px-3', md: 'h-9 rounded-md px-4', icon: 'h-9 w-9 rounded-full', 'icon-sm': 'h-8 w-8 rounded-full' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={cn(button({ variant, size }), className)} {...props} />
));
Button.displayName = 'Button';
