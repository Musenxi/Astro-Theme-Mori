import { Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root data-slot="switch" className={cn('relative h-5.5 w-9.5 shrink-0 rounded-full bg-foreground/[.14] transition-colors duration-200 data-[state=checked]:bg-primary', className)} {...props}>
      <SwitchPrimitive.Thumb data-slot="switch-thumb" className="block h-4.5 w-4.5 translate-x-0.5 rounded-full bg-popover shadow-knob transition-transform duration-200 ease-out data-[state=checked]:translate-x-4.5" />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
