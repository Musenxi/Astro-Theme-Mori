import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowDown, ArrowUp, Eye, FilePen, MoreHorizontal, PenLine, Pencil, Search, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { wan } from '@/lib/format';
import { useProject, useRefresh } from '@/lib/hooks';
import type { EntrySummary } from '@/lib/types';
import { NewEntryDialog } from '@/components/new-entry';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/confirm';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/action-menu';
import { Input } from '@/components/ui/input';
import { Body, Empty, PageHeader } from '@/components/page';
import { Segmented } from '@/components/segmented';
import { OptionSelect } from '@/components/option-select';

type SortKey = 'title' | 'category' | 'date' | 'words';
const ALL = '__all__';

export default function PostList({ view }: { view: 'all' | 'draft' }) {
  const { data: project } = useProject();
  const refresh = useRefresh();
  const confirm = useConfirm();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(ALL);
  const [tag, setTag] = useState(ALL);
  const [status, setStatus] = useState<'all' | 'pub' | 'draft'>('all');
  const [sort, setSort] = useState<[SortKey, 1 | -1]>(['date', -1]);
  const [compose, setCompose] = useState(false);

  const cats = useMemo(() => project?.config.categories ?? [], [project?.config.categories]);
  const catName = useCallback((id?: string) => cats.find((c) => c.id === id)?.zh ?? id ?? '', [cats]);
  const base = useMemo(() => (project?.entries ?? []).filter((e) => (view === 'draft' ? e.draft || e.changed : true)), [project, view]);
  const tags = useMemo(() => [...new Set(base.flatMap((e) => e.tags))].sort((a, b) => a.localeCompare(b, 'zh')), [base]);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = base.filter((e) =>
      (!term || e.title.toLowerCase().includes(term) || e.id.toLowerCase().includes(term)) &&
      (cat === ALL || e.category === cat) && (tag === ALL || e.tags.includes(tag)) &&
      (view === 'draft' || status === 'all' || (status === 'draft') === (e.draft || e.changed)));
    const [key, dir] = sort;
    const val = (e: EntrySummary) => (key === 'category' ? catName(e.category) : e[key]);
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'zh')) * dir;
    });
  }, [base, q, cat, tag, status, sort, view, catName]);

  const toggleDraft = async (e: EntrySummary) => {
    try {
      if (e.draft) await api.publishEntry(e.kind, e.id); else await api.unpublishEntry(e.kind, e.id);
      await refresh();
      toast.success(e.draft ? `《${e.title}》已发布` : `《${e.title}》已转为草稿`);
    } catch (x) { toast.error((x as Error).message); }
  };
  const discard = async (e: EntrySummary) => {
    if (!(await confirm({ title: `删除《${e.title}》的草稿？`, description: '没发布的修改会丢掉，回到上次发布的版本。', confirmLabel: '删除草稿', danger: true }))) return;
    try { await api.discardDraft(e.kind, e.id); await refresh(); toast.success('已删除草稿'); } catch (x) { toast.error((x as Error).message); }
  };
  const remove = async (e: EntrySummary) => {
    if (!(await confirm({ title: `删除《${e.title}》？`, description: '文件不会彻底删除，会保留在项目的回收站文件夹里。', confirmLabel: '删除', danger: true }))) return;
    try { await api.removeEntry(e.kind, e.id); await refresh(); toast.success('已删除'); } catch (x) { toast.error((x as Error).message); }
  };

  const head = (key: SortKey, label: string, cls = '') => (
    <button type="button" onClick={() => setSort(([k, d]) => (k === key ? [key, (-d) as 1 | -1] : [key, key === 'title' || key === 'category' ? 1 : -1]))} className={cn('flex items-center gap-1 text-left text-12 font-medium text-muted-foreground transition-colors hover:text-foreground', sort[0] === key && 'text-foreground', cls)}>
      {label}{sort[0] === key && (sort[1] < 0 ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
    </button>
  );

  const grid = 'grid grid-cols-[minmax(0,1fr)_5rem_9rem_6rem_3.5rem_4.5rem_2rem] items-center gap-x-4 px-4 max-xl:grid-cols-[minmax(0,1fr)_5rem_6rem_3.5rem_2rem]';

  return (
    <>
      <PageHeader
        title={view === 'draft' ? '草稿箱' : '文章'}
        sub={rows.length === base.length ? `${base.length}` : `${rows.length} / ${base.length}`}
        actions={view === 'all' && <Button variant="default" onClick={() => setCompose(true)}><PenLine size={14} />撰写</Button>}
      />
      <Body wide>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索标题或地址名" variant="search" />
          </div>
          <OptionSelect className="w-32" value={cat} onValueChange={setCat} options={[{ value: ALL, label: '全部分类' }, ...cats.map((c) => ({ value: c.id, label: c.zh }))]} />
          {tags.length > 0 && <OptionSelect className="w-32" value={tag} onValueChange={setTag} options={[{ value: ALL, label: '全部标签' }, ...tags.map((t) => ({ value: t, label: t }))]} />}
          {view === 'all' && <Segmented size="sm" className="ml-auto" value={status} onValueChange={setStatus} options={[{ value: 'all', label: '全部' }, { value: 'pub', label: '已发布' }, { value: 'draft', label: '草稿' }]} />}
        </div>

        <div>
          <div className={cn(grid, 'py-2')}>
            {head('title', '标题')}{head('category', '分类')}
            <span className="max-xl:hidden text-12 font-medium text-muted-foreground">标签</span>
            {head('date', '日期')}{head('words', '字数', 'justify-end')}
            <span className="max-xl:hidden text-12 font-medium text-muted-foreground">状态</span><span />
          </div>
          {rows.map((e) => (
            <div key={e.id} className={cn(grid, 'group rounded-xl py-3 transition-colors hover:bg-foreground/[.045]')}>
              <Link to={`/posts/${e.id}`} className={cn('flex min-w-0 items-baseline gap-2 truncate', (e.draft || e.changed) && 'text-muted-foreground')}>
                <span className="truncate font-medium">{e.title}</span>
                {e.pinned && <span className="shrink-0 rounded-full bg-foreground/[.07] px-2 py-px text-11 font-normal not-italic text-soft-foreground">置顶</span>}
              </Link>
              <span className="truncate text-soft-foreground">{catName(e.category)}</span>
              <span className="max-xl:hidden flex min-w-0 gap-1 overflow-hidden">{e.tags.slice(0, 3).map((t) => <button key={t} type="button" onClick={() => setTag(t)} className="shrink-0 rounded-full bg-foreground/[.06] px-2.5 py-px text-11-5 text-soft-foreground transition-colors hover:bg-foreground/[.12] hover:text-foreground">{t}</button>)}</span>
              <span className="mono text-soft-foreground">{e.date}</span>
              <span className="mono text-right text-soft-foreground">{e.broken ? '' : wan(e.words)}</span>
              <span className={cn('max-xl:hidden flex items-center gap-1.5 text-12-5', e.draft || e.changed ? 'text-soft-foreground' : 'text-muted-foreground')}><i className={cn('h-1.5 w-1.5 rounded-full', e.draft || e.changed ? 'border border-soft-foreground' : 'bg-muted-foreground/60')} />{e.draft ? '草稿' : e.changed ? '有草稿' : '已发布'}</span>
              <Menu>
                <MenuTrigger asChild><button type="button" aria-label="更多" className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground opacity-0 transition-[opacity,background-color] hover:bg-foreground/[.08] hover:text-foreground focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"><MoreHorizontal size={16} /></button></MenuTrigger>
                <MenuContent>
                  <MenuItem icon={<Pencil size={14} />} onSelect={() => nav(`/posts/${e.id}`)}>编辑</MenuItem>
                  <MenuItem icon={e.draft ? <Send size={14} /> : <FilePen size={14} />} onSelect={() => toggleDraft(e)}>{e.draft ? '发布' : '转为草稿'}</MenuItem>
                  {e.changed && <MenuItem icon={<Trash2 size={14} />} onSelect={() => discard(e)}>删除草稿</MenuItem>}
                  {project?.preview.url && <MenuItem icon={<Eye size={14} />} onSelect={() => window.open(`${project.preview.url}/posts/${e.id}/`, '_blank')}>在预览里打开</MenuItem>}
                  <MenuSeparator />
                  <MenuItem danger icon={<Trash2 size={14} />} onSelect={() => remove(e)}>删除</MenuItem>
                </MenuContent>
              </Menu>
            </div>
          ))}
          {rows.length === 0 && <Empty>{base.length ? '没有符合条件的。' : view === 'draft' ? '草稿箱是空的。' : '还没有文章。点右上角“撰写”开始第一篇。'}</Empty>}
        </div>
      </Body>
      <NewEntryDialog open={compose} onOpenChange={setCompose} />
    </>
  );
}
