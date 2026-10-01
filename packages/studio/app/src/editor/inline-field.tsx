import { useLayoutEffect, useRef, useState } from 'react';
import { asSpans, compact, spansToText, textToSpans } from '@/lib/inline.js';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/cn';

/**
 * 行内文字输入：编辑框里是轻量标记（**粗** *斜* [链接](地址) {文字|note:n1} ……），存回去是“文字 + 标注”。
 * value 只在挂载时读一次（内容 id 稳定，块不会换人），之后编辑框自己管文本。
 */
export function InlineField({ value, onChange, rows = 2, placeholder, className }: { value: unknown; onChange: (v: unknown) => void; rows?: number; placeholder?: string; className?: string }) {
  const [text, setText] = useState<string>(() => spansToText(asSpans(value)));
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; } }, [text]);
  return (
    <Textarea
      ref={ref} rows={rows} value={text} placeholder={placeholder} spellCheck={false}
      variant="plain"
      className={cn('resize-none overflow-hidden', className)}
      onChange={(e) => { setText(e.target.value); onChange(compact(textToSpans(e.target.value))); }}
    />
  );
}
