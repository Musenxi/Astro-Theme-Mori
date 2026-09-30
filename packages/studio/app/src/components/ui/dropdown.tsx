import { DropdownMenu as M } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ children, align = 'end' }: { children: ReactNode; align?: 'start' | 'end' | 'center' }) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={6} className="z-[80] min-w-[10.5rem] origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-xl bg-lift p-1.5 shadow-pop data-[state=open]:animate-pop">{children}</M.Content>
    </M.Portal>
  );
}

export function MenuItem({ children, danger, onSelect, icon }: { children: ReactNode; danger?: boolean; onSelect?: () => void; icon?: ReactNode }) {
  return (
    <M.Item onSelect={onSelect} className={cn('flex cursor-default select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] outline-none', danger ? 'text-danger data-[highlighted]:bg-ink/[.06]' : 'text-ink-2 data-[highlighted]:bg-ink/[.06] data-[highlighted]:text-ink')}>
      {icon && <span className="grid w-4 place-items-center">{icon}</span>}
      {children}
    </M.Item>
  );
}
export const MenuSeparator = () => <M.Separator className="mx-1 my-1.5 h-px bg-rule" />;
