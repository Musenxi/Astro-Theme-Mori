import { ToggleGroup } from 'radix-ui';
import { cn } from '@/lib/cn';

/** 几个互斥的选项排成一行：浅色轨道里，当前项是一颗浮起来的胶囊。必须选一个（再点当前项不会取消） */
export function Segmented<T extends string>({ value, onValueChange, options, className, size = 'md' }: { value: T; onValueChange: (v: T) => void; options: Array<{ value: T; label: string }>; className?: string; size?: 'sm' | 'md' }) {
  return (
    <ToggleGroup.Root type="single" value={value} onValueChange={(v) => v && onValueChange(v as T)} className={cn('inline-flex gap-0.5 rounded-full bg-ink/[.07] p-0.5', className)}>
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            'rounded-full px-3.5 text-[13px] text-ink-2 transition-[background-color,color,box-shadow] duration-150 hover:text-ink data-[state=on]:bg-lift data-[state=on]:text-ink data-[state=on]:shadow-soft',
            size === 'sm' ? 'h-7 px-3 text-[12.5px]' : 'h-8',
          )}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
