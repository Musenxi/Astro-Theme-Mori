import type { InputHTMLAttributes, ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/cn';

/** 表单一行：左边标签，右边控件，下面一行小字说明 */
export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-1 py-2', className)}>
      <Label variant="field">{label}</Label>
      <div className="min-w-0">
        {children}
        {hint && <p className="mt-1.5 text-12 leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

/** 数字输入：清空就是“没有值”（undefined），不是 0 */
export function NumInput({ value, onChange, className, ...p }: { value?: number; onChange: (v: number | undefined) => void; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return <Input type="number" step="any" className={className} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : +e.target.value)} {...p} />;
}
