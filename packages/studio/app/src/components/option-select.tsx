import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface Option { value: string; label: string; hint?: string }

/** 下拉选择：传一组选项就行。value 不能是空字符串（Radix 的限制），要“无”就用一个占位值 */
export function OptionSelect({ value, onValueChange, options, placeholder, className, disabled }: { value?: string; onValueChange: (v: string) => void; options: Option[]; placeholder?: string; className?: string; disabled?: boolean }) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value} hint={o.hint}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
