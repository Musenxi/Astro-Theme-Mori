import { Label as LabelPrimitive } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** field：表单一行里放在左边的标签，和右边第一行控件的文字对齐 */
const labelVariants = cva('text-12 text-muted-foreground', {
  variants: { variant: { default: '', field: 'pt-2' } },
  defaultVariants: { variant: 'default' },
});

function Label({ className, variant, ...props }: ComponentProps<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>) {
  return <LabelPrimitive.Root data-slot="label" className={cn(labelVariants({ variant }), className)} {...props} />;
}

export { Label };
