import { useMemo, useState } from 'react';
import { Search, Type } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/segmented';
import { Tip } from '@/components/tip';
import { Glyph, useIcons } from '@/components/lucide';
import { cn } from '@/lib/cn';

/** 搜索框空着时列出的常用图标 */
const COMMON = ['house', 'book-open', 'archive', 'search', 'user', 'users', 'mail', 'rss', 'map', 'map-pin', 'compass', 'camera', 'image', 'tag', 'link', 'heart', 'star', 'pen-line', 'notebook', 'globe', 'info', 'sparkles', 'music', 'film', 'layers', 'bookmark', 'coffee', 'feather', 'flame', 'leaf', 'message-circle', 'phone'];
const LIMIT = 96;

/** 页头入口的样式：文字，或者一个 Lucide 图标。触发按钮显示当前的样子 */
export function IconPicker({ value, onChange, fallback = 'link' }: { value?: string; onChange: (icon: string | undefined) => void; fallback?: string }) {
  const lib = useIcons();
  const [q, setQ] = useState('');
  const all = useMemo(() => lib?.iconNames() ?? [], [lib]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/\s+/g, '-');
    if (!s) return COMMON;
    return all.filter((n) => n.includes(s)).slice(0, LIMIT);
  }, [all, q]);

  return (
    <Popover>
      <Tip label={value ? `图标：${value}` : '文字'}>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="icon-sm" aria-label="入口样式">{value ? <Glyph name={value} size={15} /> : <Type size={14} />}</Button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent align="start" className="w-80">
        <Segmented value={value ? 'icon' : 'text'} size="sm" onValueChange={(v) => onChange(v === 'icon' ? value ?? fallback : undefined)} options={[{ value: 'text', label: '文字' }, { value: 'icon', label: '图标' }]} />
        {value && (
          <>
            <div className="relative mt-3">
              <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input variant="search" value={q} placeholder="搜索图标，如 book" onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="mt-3 grid max-h-60 grid-cols-8 gap-1 overflow-y-auto">
              {shown.map((n) => (
                <Tip key={n} label={n}>
                  <button type="button" aria-label={n} onClick={() => onChange(n)} className={cn('grid h-8 place-items-center rounded-md text-soft-foreground transition-colors hover:bg-foreground/[.06] hover:text-foreground', n === value && 'bg-foreground/[.1] text-foreground')}><Glyph name={n} size={16} /></button>
                </Tip>
              ))}
              {!shown.length && <span className="col-span-8 py-6 text-center text-12 text-muted-foreground">没有匹配的图标</span>}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
