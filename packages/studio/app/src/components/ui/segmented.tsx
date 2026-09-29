import { ToggleGroup } from 'radix-ui';
import { cn } from '@/lib/cn';

/** 几个互斥的选项排成一行，当前的反白。必须选一个（再点当前项不会取消） */
export function Segmented<T extends string>({ value, onValueChange, options, className, size = 'md' }: { value: T; onValueChange: (v: T) => void; options: Array<{ value: T; label: string }>; className?: string; size?: 'sm' | 'md' }) {
  return (
    <ToggleGroup.Root type="single" value={value} onValueChange={(v) => v && onValueChange(v as T)} className={cn('inline-flex border border-rule-2', className)}>
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className={cn('-ml-px px-3 text-[13px] text-ink-2 transition-colors first:ml-0 hover:bg-sunk data-[state=on]:bg-ink data-[state=on]:text-paper', size === 'sm' ? 'h-6 px-2.5 text-[12.5px]' : 'h-8')}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
