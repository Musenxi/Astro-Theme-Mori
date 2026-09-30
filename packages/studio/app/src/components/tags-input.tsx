import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/** 标签输入：回车 / 逗号确认，退格删最后一个；已有的标签会作为建议 */
export function TagsInput({ value, onChange, known = [], placeholder = '输入后回车' }: { value: string[]; onChange: (v: string[]) => void; known?: string[]; placeholder?: string }) {
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const add = (raw: string) => {
    const t = raw.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setText('');
  };
  const suggestions = known.filter((k) => !value.includes(k) && (!text || k.includes(text))).slice(0, 6);
  return (
    <div>
      <div onClick={() => input.current?.focus()} className={cn('field flex min-h-9 flex-wrap items-center gap-1.5 px-2 py-1')}>
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-lift py-px pl-2.5 pr-1.5 text-[12.5px] shadow-soft">
            {t}
            <button type="button" aria-label={`删除标签 ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="text-ink-3 hover:text-danger"><X size={11} /></button>
          </span>
        ))}
        <input
          ref={input} value={text} placeholder={value.length ? '' : placeholder}
          onChange={(e) => { const v = e.target.value; if (/[,，、]$/.test(v)) add(v.slice(0, -1)); else setText(v); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(text); }
            else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => add(text)}
          className="min-w-16 flex-1 bg-transparent px-1 py-0.5 text-[13px] outline-none placeholder:text-ink-3/70"
        />
      </div>
      {suggestions.length > 0 && text && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {suggestions.map((s) => <button key={s} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)} className="rounded-full bg-ink/[.05] px-2.5 py-px text-[12px] text-ink-3 transition-colors hover:bg-ink/[.1] hover:text-ink">{s}</button>)}
        </div>
      )}
    </div>
  );
}
