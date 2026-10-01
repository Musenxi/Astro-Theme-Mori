import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

function ToggleGroup({ className, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return <ToggleGroupPrimitive.Root data-slot="toggle-group" className={cn('inline-flex gap-0.5 rounded-full bg-foreground/[.07] p-0.5', className)} {...props} />;
}

const toggleGroupItemVariants = cva('rounded-full text-13 text-soft-foreground transition-[background-color,color,box-shadow] duration-150 hover:text-foreground data-[state=on]:bg-popover data-[state=on]:text-foreground data-[state=on]:shadow-soft', {
  variants: { size: { md: 'h-8 px-3.5', sm: 'h-7 px-3 text-12-5' } },
  defaultVariants: { size: 'md' },
});

function ToggleGroupItem({ className, size, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof toggleGroupItemVariants>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(toggleGroupItemVariants({ size }), className)}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
