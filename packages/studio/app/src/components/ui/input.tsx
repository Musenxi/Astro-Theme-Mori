import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const field = 'w-full rounded-sm border border-rule-2 bg-surface px-2.5 text-[13.5px] transition-colors placeholder:text-ink-3/70 hover:border-ink-3 focus:border-accent focus:outline-none disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(field, 'h-8', className)} {...p} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(field, 'min-h-[4.5rem] py-1.5 leading-relaxed', className)} {...p} />
));
Textarea.displayName = 'Textarea';

/** 表单一行：左边标签，右边控件，下面一行小字说明 */
export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-1 py-2', className)}>
      <label className="label pt-1.5">{label}</label>
      <div className="min-w-0">
        {children}
        {hint && <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{hint}</p>}
      </div>
    </div>
  );
}

/** 数字输入：清空就是“没有值”（undefined），不是 0 */
export function NumInput({ value, onChange, className, ...p }: { value?: number; onChange: (v: number | undefined) => void; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return <Input type="number" step="any" className={className} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : +e.target.value)} {...p} />;
}
