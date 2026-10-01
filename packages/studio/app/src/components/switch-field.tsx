import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';

/** 开关加一句标签，点标签也能切换 */
export function SwitchField({ checked, onCheckedChange, label, className }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: string; className?: string }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2.5 text-13 text-soft-foreground', className)}>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
      {label}
    </label>
  );
}
