import { Tooltip as T } from 'radix-ui';
import type { ReactNode } from 'react';

export const TooltipProvider = ({ children }: { children: ReactNode }) => <T.Provider delayDuration={350} skipDelayDuration={200}>{children}</T.Provider>;

export function Tip({ label, children, side = 'top' }: { label: ReactNode; children: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-[90] border border-rule-2 bg-surface px-2 py-1 text-[12px] text-ink-2 data-[state=delayed-open]:animate-fade-in">
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
