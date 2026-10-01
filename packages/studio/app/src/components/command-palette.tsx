import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { BookOpenText, CornerDownLeft, FileText, Files, Gauge, MessageSquare, PanelTop, Paperclip, PenLine, Search, Send, SlidersHorizontal, Tag, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useProject } from '@/lib/hooks';

interface Item { key: string; label: string; hint?: string; icon: typeof Gauge; run: () => void; group: string }

/** ⌘K：按名字快速跳到任意文章、页面或功能。在编辑器里 ⌘K 是“插入链接”，所以那里不响应 */
export function CommandPalette({ open, onOpenChange, onCompose }: { open: boolean; onOpenChange: (o: boolean) => void; onCompose: () => void }) {
  const { data: project } = useProject();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) return;
      if ((e.target as HTMLElement | null)?.closest?.('.cm-editor')) return;
      e.preventDefault();
      onOpenChange(true);
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [onOpenChange]);
  useEffect(() => { if (open) { setQ(''); setActive(0); } }, [open]);

  const go = (to: string) => () => { onOpenChange(false); nav(to); };
  const items = useMemo<Item[]>(() => {
    const cmds: Item[] = [
      { key: 'c-dash', group: '前往', label: '仪表盘', icon: Gauge, run: go('/') },
      { key: 'c-posts', group: '前往', label: '文章管理', icon: FileText, run: go('/posts') },
      { key: 'c-new', group: '前往', label: '撰写新文章', icon: PenLine, run: () => { onOpenChange(false); onCompose(); } },
      { key: 'c-tax', group: '前往', label: '分类 / 标签', icon: Tag, run: go('/taxonomy') },
      { key: 'c-pages', group: '前往', label: '页面管理', icon: Files, run: go('/pages') },
      { key: 'c-nav', group: '前往', label: '页头入口', icon: PanelTop, run: go('/nav') },
      { key: 'c-drafts', group: '前往', label: '草稿箱', icon: BookOpenText, run: go('/drafts') },
      { key: 'c-cm', group: '前往', label: '评论', icon: MessageSquare, run: go('/comments') },
      { key: 'c-files', group: '前往', label: '文件', icon: Paperclip, run: go('/files') },
      { key: 'c-fr', group: '前往', label: '友人帐', icon: Users, run: go('/friends') },
      { key: 'c-pub', group: '前往', label: '构建发布', icon: Send, run: go('/publish') },
      { key: 'c-set', group: '前往', label: '设定', icon: SlidersHorizontal, run: go('/settings') },
    ];
    const posts: Item[] = (project?.entries ?? []).map((e) => ({ key: `p-${e.id}`, group: '文章', label: e.title, hint: `${e.date}${e.draft ? ' · 草稿' : ''}`, icon: FileText, run: go(`/posts/${e.id}`) }));
    const pages: Item[] = (project?.pages ?? []).map((p) => ({ key: `g-${p.id}`, group: '页面', label: p.title, hint: `/${p.id}/`, icon: Files, run: go(`/pages/${p.id}`) }));
    return [...cmds, ...posts, ...pages];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items.filter((i) => i.group === '前往').concat(items.filter((i) => i.group !== '前往').slice(0, 6));
    return items.filter((i) => i.label.toLowerCase().includes(t) || i.hint?.toLowerCase().includes(t)).slice(0, 30);
  }, [items, q]);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); shown[active]?.run(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} flush className="top-[14vh] max-h-none overflow-hidden">
        <DialogTitle className="sr-only">搜索</DialogTitle>
        <div className="flex items-center gap-3 border-b border-border px-5">
          <Search size={16} className="text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="跳到文章、页面或功能……" className="h-14 flex-1 bg-transparent text-15 outline-none placeholder:text-muted-foreground/70" />
          <kbd className="mono rounded-xs bg-foreground/[.06] px-1.5 py-px text-10-5 text-muted-foreground">esc</kbd>
        </div>
        <div ref={list} className="max-h-[52vh] overflow-y-auto p-2">
          {shown.length === 0 && <p className="px-3 py-8 text-center text-muted-foreground">没有匹配的。</p>}
          {shown.map((it, i) => (
            <div key={it.key}>
              {(i === 0 || shown[i - 1].group !== it.group) && <div className="px-3 pb-1.5 pt-3 text-11-5 font-medium text-muted-foreground">{it.group}</div>}
              <button type="button" data-active={i === active} onMouseMove={() => setActive(i)} onClick={it.run} className={cn('flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left transition-colors', i === active ? 'bg-foreground/[.06] text-foreground' : 'text-soft-foreground')}>
                <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-md transition-colors', i === active ? 'bg-foreground/[.08] text-foreground' : 'bg-foreground/[.04] text-muted-foreground')}><it.icon size={14} /></span>
                <span className="flex-1 truncate">{it.label}</span>
                {it.hint && <span className="mono shrink-0 text-11 text-muted-foreground">{it.hint}</span>}
                {i === active && <CornerDownLeft size={13} className="shrink-0 text-muted-foreground" />}
              </button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
