import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/** 几个互斥的选项排成一行：浅色轨道里，当前项是一颗浮起来的胶囊。必须选一个（再点当前项不会取消） */
export function Segmented<T extends string>({ value, onValueChange, options, className, size = 'md' }: { value: T; onValueChange: (v: T) => void; options: Array<{ value: T; label: string }>; className?: string; size?: 'sm' | 'md' }) {
  return (
    <ToggleGroup type="single" value={value} onValueChange={(v) => v && onValueChange(v as T)} className={className}>
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} size={size}>{o.label}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
