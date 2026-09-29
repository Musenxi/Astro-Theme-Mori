import { DropdownMenu as M } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ children, align = 'end' }: { children: ReactNode; align?: 'start' | 'end' | 'center' }) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={4} className="z-[80] min-w-[9.5rem] border border-rule-2 bg-surface p-1 data-[state=open]:animate-pop">{children}</M.Content>
    </M.Portal>
  );
}

export function MenuItem({ children, danger, onSelect, icon }: { children: ReactNode; danger?: boolean; onSelect?: () => void; icon?: ReactNode }) {
  return (
    <M.Item onSelect={onSelect} className={cn('flex cursor-default select-none items-center gap-2.5 rounded-xs px-2.5 py-1.5 text-[13px] outline-none data-[highlighted]:bg-sunk', danger ? 'text-danger' : 'text-ink-2 data-[highlighted]:text-ink')}>
      {icon && <span className="grid w-4 place-items-center">{icon}</span>}
      {children}
    </M.Item>
  );
}
export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-rule" />;
