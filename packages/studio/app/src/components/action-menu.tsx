import type { ReactNode } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export const Menu = DropdownMenu;
export const MenuTrigger = DropdownMenuTrigger;
export const MenuSeparator = DropdownMenuSeparator;

export function MenuContent({ children, align = 'end' }: { children: ReactNode; align?: 'start' | 'end' | 'center' }) {
  return <DropdownMenuContent align={align}>{children}</DropdownMenuContent>;
}

export function MenuItem({ children, danger, onSelect, icon }: { children: ReactNode; danger?: boolean; onSelect?: () => void; icon?: ReactNode }) {
  return (
    <DropdownMenuItem variant={danger ? 'destructive' : 'default'} onSelect={onSelect}>
      {icon && <span className="grid w-4 place-items-center">{icon}</span>}
      {children}
    </DropdownMenuItem>
  );
}
