import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useMatch, useResolvedPath } from 'react-router';
import { ChevronRight, Search, Files, FileText, Gauge, MessageSquare, Moon, PanelTop, Paperclip, PenLine, Send, SlidersHorizontal, Sun, Tag, Users, Eye, FilePen, BookOpenText } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useProject } from '@/lib/hooks';
import { Tip } from '@/components/tip';

const ICON = 17;

function Row({ to, icon, label, badge, end, child, onClick }: { to?: string; icon: ReactNode; label: string; badge?: number | string; end?: boolean; child?: boolean; onClick?: () => void }) {
  // 是否选中在这里算好、传字符串：Tooltip 的 asChild 会把 className 拼成字符串，传函数会变成一串源码
  const resolved = useResolvedPath(to ?? '.');
  const isActive = !!to && !!useMatch({ path: resolved.pathname, end: !!end });
  const cls = cn(
    'group relative flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-13-5 transition-[background-color,color,box-shadow] duration-150 max-lg:h-10 max-lg:justify-center max-lg:px-0',
    child && 'h-8 pl-10 text-13 max-lg:h-10 max-lg:pl-0',
    isActive ? 'bg-popover font-medium text-foreground shadow-soft' : 'text-soft-foreground hover:bg-foreground/[.05] hover:text-foreground',
  );
  const inner = (
    <>
      <span className={cn('grid shrink-0 place-items-center transition-colors', isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-soft-foreground')}>{icon}</span>
      <span className="flex-1 truncate max-lg:hidden">{label}</span>
      {badge ? <span className="mono grid h-4.5 min-w-4.5 place-items-center rounded-full bg-primary px-1.5 text-10-5 text-primary-foreground max-lg:absolute max-lg:right-1.5 max-lg:top-1.5 max-lg:h-4 max-lg:min-w-4 max-lg:px-1">{badge}</span> : null}
    </>
  );
  const el = to ? <Link to={to} className={cls} aria-current={isActive ? 'page' : undefined} onClick={onClick}>{inner}</Link> : <button type="button" className={cls} onClick={onClick}>{inner}</button>;
  return <Tip label={label} side="right">{el}</Tip>;
}

function Group({ icon, label, open, onToggle, active, children }: { icon: ReactNode; label: string; open: boolean; onToggle: () => void; active: boolean; children: ReactNode }) {
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open} className={cn('group flex h-9 w-full items-center gap-3 rounded-lg px-3 text-13-5 transition-colors hover:bg-foreground/[.05] max-lg:hidden', active ? 'font-medium text-foreground' : 'text-soft-foreground hover:text-foreground')}>
        <span className={cn('grid shrink-0 place-items-center transition-colors', active ? 'text-foreground' : 'text-muted-foreground group-hover:text-soft-foreground')}>{icon}</span>
        <span className="flex-1 text-left">{label}</span>
        <ChevronRight size={14} className={cn('shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-90')} />
      </button>
      {/* 窄屏只有图标：子项直接平铺 */}
      <div className={cn('grid transition-[grid-template-rows] duration-200 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]', 'max-lg:grid-rows-[1fr]')}>
        <div className="overflow-hidden"><div className="space-y-0.5 pt-0.5">{children}</div></div>
      </div>
    </div>
  );
}

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const t = document.documentElement.dataset.theme as 'light' | 'dark' | undefined;
    return t ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('mori-studio-theme', theme); } catch { /* 隐私模式下存不了也没关系 */ }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))] as const;
}

export function Sidebar({ onCompose, onSearch }: { onCompose: () => void; onSearch: () => void }) {
  const { data: project } = useProject();
  const { pathname } = useLocation();
  const [theme, toggleTheme] = useTheme();
  const [open, setOpen] = useState<Record<string, boolean>>({ posts: true, pages: true });
  const inPosts = pathname.startsWith('/posts') || pathname.startsWith('/taxonomy');
  const inPages = pathname.startsWith('/pages') || pathname.startsWith('/nav');
  const drafts = project?.entries.filter((e) => e.draft || e.changed).length ?? 0;

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col max-lg:w-14">
      <div className="flex items-center gap-3 px-3 pb-4 pt-3 max-lg:justify-center max-lg:px-0">
        <span className="serif grid h-9 w-9 shrink-0 place-items-center rounded-11 bg-primary text-16 text-primary-foreground">{[...(project?.config.title ?? 'M')][0]}</span>
        <div className="min-w-0 max-lg:hidden">
          <div className="truncate text-14-5 font-semibold leading-tight tracking-tight" title={project?.root}>{project?.config.title ?? 'MORI'}</div>
          <div className="mono mt-0.5 text-10-5 leading-none text-muted-foreground">Studio{project?.dev ? ' · dev' : ''}</div>
        </div>
      </div>
      <div className="px-2 pb-3 max-lg:px-1.5">
        <Tip label="搜索文章、页面和功能" side="right">
          <button type="button" onClick={onSearch} className="flex h-9 w-full items-center gap-2.5 rounded-lg bg-foreground/[.05] px-3 text-left text-13 text-muted-foreground transition-colors hover:bg-foreground/[.08] hover:text-soft-foreground max-lg:h-10 max-lg:justify-center max-lg:px-0">
            <Search size={15} /><span className="flex-1 max-lg:hidden">搜索</span><kbd className="mono rounded-xs bg-foreground/[.06] px-1.5 py-px text-10-5 max-lg:hidden">⌘K</kbd>
          </button>
        </Tip>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2 max-lg:px-1.5">
        <Row to="/" end icon={<Gauge size={ICON} />} label="仪表盘" />
        <Group icon={<FileText size={ICON} />} label="文章" open={!!open.posts} active={inPosts} onToggle={() => setOpen({ ...open, posts: !open.posts })}>
          <Row to="/posts" end child icon={<Eye size={ICON} />} label="管理" />
          <Row child icon={<PenLine size={ICON} />} label="撰写" onClick={onCompose} />
          <Row to="/taxonomy" child icon={<Tag size={ICON} />} label="分类 / 标签" />
        </Group>
        <Group icon={<BookOpenText size={ICON} />} label="页面" open={!!open.pages} active={inPages} onToggle={() => setOpen({ ...open, pages: !open.pages })}>
          <Row to="/pages" end child icon={<Files size={ICON} />} label="管理" />
          <Row to="/nav" child icon={<PanelTop size={ICON} />} label="页头入口" />
        </Group>
        <Row to="/drafts" icon={<FilePen size={ICON} />} label="草稿箱" badge={drafts || undefined} />
        <Row to="/comments" icon={<MessageSquare size={ICON} />} label="评论" badge={project?.comments.pending || undefined} />
        <Row to="/files" icon={<Paperclip size={ICON} />} label="文件" />
        <Row to="/friends" icon={<Users size={ICON} />} label="友人帐" />
        <div className="min-h-6 flex-1" />
        <Row to="/publish" icon={<Send size={ICON} />} label="构建发布" />
        <Row to="/settings" icon={<SlidersHorizontal size={ICON} />} label="设定" />
        <Row icon={theme === 'dark' ? <Sun size={ICON} /> : <Moon size={ICON} />} label={theme === 'dark' ? '切换到亮色' : '切换到暗色'} onClick={toggleTheme} />
      </nav>
    </aside>
  );
}


