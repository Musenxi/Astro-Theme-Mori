import { Select as SelectPrimitive } from 'radix-ui';
import { Check, ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { fieldVariants } from './input';

function Select(props: ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}
function SelectValue(props: ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(fieldVariants, 'inline-flex h-9 w-full min-w-0 items-center justify-between gap-2 px-3 text-left text-13-5 data-[placeholder]:text-muted-foreground disabled:opacity-50', className)}
      {...props}
    >
      <span className="truncate">{children}</span>
      <SelectPrimitive.Icon><ChevronDown size={14} className="text-muted-foreground" /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({ className, children, position = 'popper', ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        sideOffset={6}
        className={cn('z-80 max-h-72 min-w-(--radix-select-trigger-width) origin-(--radix-select-content-transform-origin) overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-pop data-[state=open]:animate-pop', className)}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1.5">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({ className, children, hint, ...props }: ComponentProps<typeof SelectPrimitive.Item> & { hint?: string }) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn('relative flex cursor-default select-none items-center gap-2 rounded-md py-2 pl-8 pr-3 text-13-5 outline-none data-[highlighted]:bg-accent', className)}
      {...props}
    >
      <SelectPrimitive.ItemIndicator className="absolute left-2.5"><Check size={13} /></SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      {hint && <span className="ml-auto pl-4 text-12 text-muted-foreground">{hint}</span>}
    </SelectPrimitive.Item>
  );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
