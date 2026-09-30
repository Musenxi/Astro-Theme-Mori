import { Tooltip as T } from 'radix-ui';
import type { ReactNode } from 'react';

export const TooltipProvider = ({ children }: { children: ReactNode }) => <T.Provider delayDuration={350} skipDelayDuration={200}>{children}</T.Provider>;

export function Tip({ label, children, side = 'top' }: { label: ReactNode; children: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={8} className="z-[90] rounded-md bg-ink px-2.5 py-1 text-[12px] text-paper shadow-pop data-[state=delayed-open]:animate-fade-in">
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
