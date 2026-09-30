import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { wan } from '@/lib/format';
import { useProject } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Body, PageHeader } from '@/components/ui/page';

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
  const drafts = entries.filter((e) => e.draft).length;

  return (
    <>
      <PageHeader title="仪表盘" actions={<Button variant="ghost" size="sm" onClick={() => refetch()}><RefreshCw size={14} className={cn(isFetching && 'animate-spin')} />刷新</Button>} />
      <Body wide>
        {error ? <p className="text-danger">{(error as Error).message}</p> : (
          <>
            {/* 主角：全站字数，只靠字号说话 */}
            <div className="px-2 pb-8 pt-4">
              <div className="text-[13px] text-ink-3">全站字数</div>
              <div className="mt-1 text-[64px] font-semibold leading-none tracking-tighter [font-feature-settings:'tnum']">{s ? wan(s.words) : <span className="text-ink-3/40">·</span>}</div>
              <p className="mt-4 text-[13px] text-ink-3">
                共 {entries.length} 篇文章{drafts > 0 && <>，其中 {drafts} 篇还是草稿</>}
              </p>
            </div>

            {/* 其余统计：一整块浅色面，数字之间只留白 */}
            <dl className="grid grid-cols-2 gap-1 rounded-2xl bg-sunk/70 p-2 md:grid-cols-3">
              {cells.map((cell) => {
                const inner = (
                  <>
                    <dt className="flex items-center gap-1.5 text-[13px] text-ink-3">
                      {cell.label}
                      {cell.alert && <i aria-label="有新评论" className="h-1.5 w-1.5 rounded-full bg-ink" />}
                      {cell.to && <ArrowUpRight size={13} className="ml-auto opacity-0 transition-opacity duration-200 group-hover:opacity-100" />}
                    </dt>
                    <dd className="mt-3 text-[32px] font-semibold leading-none tracking-tight [font-feature-settings:'tnum']">
                      {cell.value === undefined ? <span className="text-ink-3/40">·</span> : cell.value === null ? <span className="text-ink-3/50">—</span> : cell.value}
                    </dd>
                    <p className="mt-2 h-4 text-[11.5px] text-ink-3">{cell.value === null && cell.hint}</p>
                  </>
                );
                const cls = 'group block rounded-xl px-5 py-4 transition-colors duration-150';
                return cell.to
                  ? <Link key={cell.label} to={cell.to} className={cn(cls, 'hover:bg-lift')}>{inner}</Link>
                  : <div key={cell.label} className={cls}>{inner}</div>;
              })}
            </dl>
          </>
        )}
      </Body>
    </>
  );
}
