import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { api, type CommentRow } from '@/lib/api';
import { cn } from '@/lib/cn';
import { wan } from '@/lib/format';
import { useProject } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Body, PageHeader } from '@/components/page';

const RECENT = 6;
const when = (t: number) => { const d = new Date(t), p = (n: number) => String(n).padStart(2, '0'); return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const STATUS: Record<CommentRow['status'], string | null> = { pending: '待审', approved: null, hidden: '已隐藏' };

interface Cell { label: string; value: string | number | null | undefined; to?: string; hint?: string; alert?: boolean }

export default function Dashboard() {
  const { data: project } = useProject();
  const { data: s, isFetching, refetch, error } = useQuery({ queryKey: ['stats'], queryFn: api.stats, staleTime: 10_000 });
  const c = s?.comments;
  const offline = s && !c ? '评论服务未连接' : undefined;
  const cells: Cell[] = [
    { label: '页面', value: s?.pages, to: '/pages' },
    { label: '分类', value: s?.categories, to: '/taxonomy' },
    { label: '全部评论', value: s ? (c ? c.total : null) : undefined, to: '/comments', hint: offline },
    { label: '未读评论', value: s ? (c ? c.unread : null) : undefined, to: '/comments', hint: offline, alert: !!c?.unread },
    { label: '总阅读量', value: s?.views, hint: s ? '暂未统计' : undefined },
    { label: '文章点赞', value: s?.likes, hint: s ? '暂未统计' : undefined },
  ];
  const entries = project?.entries ?? [];
  const drafts = entries.filter((e) => e.draft || e.changed).length;
  const recent = entries.filter((e) => !e.broken && !e.draft).sort((a, b) => b.date.localeCompare(a.date)).slice(0, RECENT); // 已发布的，按发布日期
  const cm = project?.comments;
  const canList = cm?.provider === 'mori' && cm.hasToken;
  const replies = useQuery({ queryKey: ['comments', 'recent'], queryFn: () => api.comments(), enabled: !!canList, staleTime: 10_000 });
  const latest = [...(replies.data?.comments ?? [])].sort((a, b) => b.createdAt - a.createdAt).slice(0, RECENT);
  const titleOf = (entry: string) => { const id = entry.split('/')[1]; return entries.find((e) => e.id === id)?.title ?? project?.pages.find((p) => p.id === id)?.title ?? entry; };

  return (
    <>
      <PageHeader title="仪表盘" actions={<Button variant="ghost" size="sm" onClick={() => { void refetch(); void replies.refetch(); }}><RefreshCw size={14} className={cn(isFetching && 'animate-spin')} />刷新</Button>} />
      <Body wide>
        {error ? <p className="text-destructive">{(error as Error).message}</p> : (
          <>
            {/* 主角：全站字数，只靠字号说话 */}
            <div className="px-2 pb-8 pt-4">
              <div className="text-13 text-muted-foreground">全站字数</div>
              <div className="mt-1 text-64 font-semibold leading-none tracking-tighter tnum">{s ? wan(s.words) : <span className="text-muted-foreground/40">·</span>}</div>
              <p className="mt-4 text-13 text-muted-foreground">
                共 {entries.length} 篇文章{drafts > 0 && <>，其中 {drafts} 篇还是草稿</>}
              </p>
            </div>

            {/* 其余统计：一整块浅色面，数字之间只留白 */}
            <dl className="grid grid-cols-2 gap-1 rounded-2xl bg-muted/70 p-2 md:grid-cols-3">
              {cells.map((cell) => {
                const inner = (
                  <>
                    <dt className="flex items-center gap-1.5 text-13 text-muted-foreground">
                      {cell.label}
                      {cell.alert && <i aria-label="有新评论" className="h-1.5 w-1.5 rounded-full bg-primary" />}
                      {cell.to && <ArrowUpRight size={13} className="ml-auto opacity-0 transition-opacity duration-200 group-hover:opacity-100" />}
                    </dt>
                    <dd className="mt-3 text-32 font-semibold leading-none tracking-tight tnum">
                      {cell.value === undefined ? <span className="text-muted-foreground/40">·</span> : cell.value === null ? <span className="text-muted-foreground/50">—</span> : cell.value}
                    </dd>
                    <p className="mt-2 h-4 text-11-5 text-muted-foreground">{cell.value === null && cell.hint}</p>
                  </>
                );
                const cls = 'group block rounded-xl px-5 py-4 transition-colors duration-150';
                return cell.to
                  ? <Link key={cell.label} to={cell.to} className={cn(cls, 'hover:bg-popover')}>{inner}</Link>
                  : <div key={cell.label} className={cls}>{inner}</div>;
              })}
            </dl>

            {/* 最近：两栏并排，窄屏叠起来 */}
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <Recent title="最近发布的文章" more={{ to: '/posts', label: '全部文章' }}>
                {recent.length === 0 && <li className="px-3 py-3 text-13 text-muted-foreground">还没有发布过文章。</li>}
                {recent.map((e) => (
                  <li key={e.id}>
                    <Link to={`/posts/${e.id}`} className="flex items-baseline gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-popover">
                      <span className="min-w-0 flex-1 truncate">{e.title || e.id}</span>
                      <span className="mono shrink-0 text-11-5 text-muted-foreground">{e.date.replaceAll('-', '.')}</span>
                    </Link>
                  </li>
                ))}
              </Recent>
              <Recent title="最近得到的回复" more={canList ? { to: '/comments', label: '全部评论' } : undefined}>
                {!canList && <li className="px-3 py-3 text-13 text-muted-foreground">{cm?.provider === 'mori' ? '还没有填评论服务的管理令牌。' : '没有启用自建评论。'}</li>}
                {canList && replies.error && <li className="px-3 py-3 text-13 text-muted-foreground">评论服务没有连上。</li>}
                {canList && !replies.error && !replies.isPending && latest.length === 0 && <li className="px-3 py-3 text-13 text-muted-foreground">还没有人留言。</li>}
                {latest.map((m) => (
                  <li key={m.id}>
                    <Link to="/comments" className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-popover">
                      <div className="flex items-baseline gap-2 text-12-5 text-muted-foreground">
                        <b className="font-medium text-foreground">{m.name}</b>
                        {STATUS[m.status] && <span className="rounded-full bg-foreground/[.07] px-2 py-px text-11 text-soft-foreground">{STATUS[m.status]}</span>}
                        <span className="min-w-0 flex-1 truncate">{titleOf(m.entry)}</span>
                        <span className="mono shrink-0 text-11-5">{when(m.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 break-words text-13-5 text-soft-foreground">{m.body}</p>
                    </Link>
                  </li>
                ))}
              </Recent>
            </div>
          </>
        )}
      </Body>
    </>
  );
}

function Recent({ title, more, children }: { title: string; more?: { to: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-muted/70 p-2">
      <div className="flex items-center px-3 pb-1 pt-2.5">
        <h2 className="text-13 text-muted-foreground">{title}</h2>
        {more && <Link to={more.to} className="ml-auto flex items-center gap-0.5 text-12 text-muted-foreground transition-colors hover:text-foreground">{more.label}<ArrowUpRight size={12} /></Link>}
      </div>
      <ul>{children}</ul>
    </section>
  );
}
