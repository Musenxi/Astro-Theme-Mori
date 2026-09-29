import { Switch as S } from 'radix-ui';
import { cn } from '@/lib/cn';

export function Switch({ checked, onCheckedChange, label, className }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: string; className?: string }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-2', className)}>
      <S.Root checked={checked} onCheckedChange={onCheckedChange} className="relative h-[18px] w-8 shrink-0 rounded-full border border-rule-2 bg-sunk transition-colors data-[state=checked]:border-ink data-[state=checked]:bg-ink">
        <S.Thumb className="block h-3 w-3 translate-x-[3px] rounded-full bg-ink-3 transition-[transform,background-color] duration-200 ease-out data-[state=checked]:translate-x-[16px] data-[state=checked]:bg-paper" />
      </S.Root>
      {label}
    </label>
  );
}
