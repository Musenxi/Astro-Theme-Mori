import { Switch as S } from 'radix-ui';
import { cn } from '@/lib/cn';

export function Switch({ checked, onCheckedChange, label, className }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: string; className?: string }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-2', className)}>
      <S.Root checked={checked} onCheckedChange={onCheckedChange} className="relative h-[22px] w-[38px] shrink-0 rounded-full bg-ink/[.14] transition-colors duration-200 data-[state=checked]:bg-ink">
        <S.Thumb className="block h-[18px] w-[18px] translate-x-[2px] rounded-full bg-lift shadow-[0_1px_3px_rgb(0_0_0/.3)] transition-transform duration-200 ease-out data-[state=checked]:translate-x-[18px]" />
      </S.Root>
      {label}
    </label>
  );
}
