import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Body, PageHeader } from '@/components/ui/page';
import { cn } from '@/lib/cn';

const wan = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, '')}万` : n.toLocaleString('zh-CN'));

export default function Dashboard() {
  const { data: s, isFetching, refetch, error } = useQuery({ queryKey: ['stats'], queryFn: api.stats, staleTime: 10_000 });
  const c = s?.comments;
  const cells: Array<{ label: string; value: string | number | null | undefined; to?: string; hint?: string }> = [
    { label: '页面', value: s?.pages, to: '/pages' },
    { label: '分类', value: s?.categories, to: '/taxonomy' },
    { label: '全部评论', value: c?.total, to: '/comments', hint: s && !c ? '评论服务未连接' : undefined },
    { label: '未读评论', value: c?.unread, to: '/comments', hint: s && !c ? '评论服务未连接' : undefined },
    { label: '全站字数', value: s ? wan(s.words) : undefined },
    { label: '总阅读量', value: s?.views, hint: s ? '暂未统计' : undefined },
    { label: '文章点赞', value: s?.likes, hint: s ? '暂未统计' : undefined },
  ];
  return (
    <>
      <PageHeader title="仪表盘" actions={<Button variant="ghost" size="sm" onClick={() => refetch()}><RefreshCw size={14} className={cn(isFetching && 'animate-spin')} />刷新</Button>} />
      <Body wide>
        {error ? <p className="text-danger">{(error as Error).message}</p> : (
          <dl className="grid grid-cols-2 border-t border-ink md:grid-cols-4">
            {cells.map((c, i) => {
              const inner = (
                <>
                  <dd className="serif min-h-[3rem] text-[38px] leading-[1.15] tracking-[.02em] [font-feature-settings:'tnum'] transition-colors group-hover:text-accent">
                    {c.value === undefined ? <span className="text-ink-3/40">·</span> : c.value === null ? <span className="text-ink-3/60">—</span> : c.value}
                  </dd>
                  <dt className="label mt-1">{c.label}</dt>
                  {c.value === null && c.hint && <p className="mono mt-1.5 text-[11px] text-ink-3/80">{c.hint}</p>}
                </>
              );
              const cls = cn('group block border-b border-rule px-5 py-6 first:pl-0 md:[&:nth-child(4n+1)]:pl-0', i % 2 === 1 && 'max-md:border-l', i % 4 !== 0 && 'md:border-l');
              return c.to ? <Link key={c.label} to={c.to} className={cls}>{inner}</Link> : <div key={c.label} className={cls}>{inner}</div>;
            })}
          </dl>
        )}
      </Body>
    </>
  );
}
