import { Select as S } from 'radix-ui';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface Option { value: string; label: string; hint?: string }

/** 下拉选择。value 不能是空字符串（Radix 的限制），要“无”就用一个占位值 */
export function Select({ value, onValueChange, options, placeholder, className, disabled }: { value?: string; onValueChange: (v: string) => void; options: Option[]; placeholder?: string; className?: string; disabled?: boolean }) {
  return (
    <S.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <S.Trigger className={cn('inline-flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-sm border border-rule-2 bg-surface px-2.5 text-left text-[13.5px] transition-colors hover:border-ink-3 focus:border-accent focus:outline-none data-[placeholder]:text-ink-3 disabled:opacity-50', className)}>
        <span className="truncate"><S.Value placeholder={placeholder} /></span>
        <S.Icon><ChevronDown size={14} className="text-ink-3" /></S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={4} className="z-[80] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden border border-rule-2 bg-surface data-[state=open]:animate-pop">
          <S.Viewport className="p-1">
            {options.map((o) => (
              <S.Item key={o.value} value={o.value} className="relative flex cursor-default select-none items-center gap-2 rounded-xs py-1.5 pl-7 pr-3 text-[13.5px] outline-none data-[highlighted]:bg-sunk">
                <S.ItemIndicator className="absolute left-2"><Check size={13} className="text-accent" /></S.ItemIndicator>
                <S.ItemText>{o.label}</S.ItemText>
                {o.hint && <span className="ml-auto pl-4 text-[12px] text-ink-3">{o.hint}</span>}
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
