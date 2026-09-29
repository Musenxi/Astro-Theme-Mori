import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, EyeOff, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, api, type CommentRow } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useProject, useRefresh } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Body, Empty, PageHeader } from '@/components/ui/page';

const TABS = [['pending', '待审'], ['approved', '已通过'], ['hidden', '已隐藏']] as const;
type Tab = (typeof TABS)[number][0];
const when = (t: number) => { const d = new Date(t); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

export default function Comments() {
  const { data: project } = useProject();
  const c = project?.comments;
  if (!c) return null;
  if (c.provider !== 'mori') {
    return (
      <>
        <PageHeader title="评论" />
        <Body><p className="max-w-xl leading-relaxed text-ink-2">还没有启用 MORI 自带的评论（支持读者划词批注）。要启用，需要先部署评论服务，再把它的地址填进站点的配置文件。如果用的是 Giscus、Waline、Twikoo 或 Artalk，评论在它们各自的后台里管理。</p></Body>
      </>
    );
  }
  return c.hasToken ? <List /> : <Token />;
}

function Token({ wrong }: { wrong?: boolean }) {
  const { data: project } = useProject();
  const refresh = useRefresh();
  const [token, setToken] = useState('');
  const c = project!.comments;
  const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(c.endpoint);
  const save = async (v: string) => { try { await api.setCommentToken(v); await refresh(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <>
      <PageHeader title="评论" sub="管理令牌" />
      <Body>
        {local ? (
          <div className="mb-6">
            <p className="leading-relaxed text-ink-2">评论服务运行在这台电脑上（<span className="mono">{c.endpoint}</span>）。如果是用开发模式启动的，管理令牌是 <b className="mono font-normal text-ink">dev-token</b>。</p>
            <Button variant="primary" className="mt-3" onClick={() => save('dev-token')}>使用 dev-token</Button>
          </div>
        ) : <p className="mb-6 leading-relaxed text-ink-2">评论服务：<span className="mono">{c.endpoint}</span>。管理令牌是部署评论服务时设置的那一个。</p>}
        {wrong && <p className="mb-4 border border-danger/40 px-3 py-2 text-danger">令牌不对，评论服务拒绝了。{local && '如果你是自己用别的令牌启动的服务，请填那个。'}</p>}
        <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); if (token) void save(token); }}>
          <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="管理令牌" />
          <Button type="submit" disabled={!token}>保存</Button>
        </form>
        <p className="mono mt-4 text-[11.5px] text-ink-3">令牌只保存在这台电脑上，不会被发布或上传。</p>
      </Body>
    </>
  );
}

function List() {
  const { data: project } = useProject();
  const refresh = useRefresh();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('pending');
  const list = useQuery({ queryKey: ['comments', tab], queryFn: () => api.comments(tab), staleTime: 0 });
  const stats = useQuery({ queryKey: ['comment-stats'], queryFn: api.commentStats, staleTime: 0 });
  const title = (entry: string) => project?.entries.find((e) => e.id === entry.split('/')[1])?.title ?? project?.pages.find((p) => p.id === entry.split('/')[1])?.title ?? entry;

  // 打开这一页就算“看过了”：未读数清零
  useEffect(() => { if (list.isSuccess) void api.markCommentsSeen().then(refresh).catch(() => {}); }, [list.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps
  if (list.error instanceof ApiError && list.error.status === 401) return <Token wrong />;

  const reload = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['comments'] }), qc.invalidateQueries({ queryKey: ['comment-stats'] }), refresh()]); };
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { toast.error((e as Error).message); } };
  const rows: CommentRow[] = list.data?.comments ?? [];

  return (
    <>
      <PageHeader title="评论" sub={stats.data ? `待审 ${stats.data.pending} · 已通过 ${stats.data.approved} · 已隐藏 ${stats.data.hidden}` : undefined} actions={<Button variant="ghost" size="sm" onClick={() => void reload()}><RefreshCw size={14} className={cn(list.isFetching && 'animate-spin')} />刷新</Button>} />
      <Body>
        <div className="mb-2 flex gap-6 border-b border-rule">
          {TABS.map(([k, n]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={cn('-mb-px border-b-2 pb-2 text-[13.5px] transition-colors', tab === k ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink')}>
              {n}{stats.data && stats.data[k] ? <span className="mono ml-1.5 text-[11px] text-ink-3">{stats.data[k]}</span> : null}
            </button>
          ))}
        </div>
        {list.error && !(list.error instanceof ApiError && list.error.status === 401) && <p className="my-4 border border-danger/40 px-3 py-2 text-danger">{(list.error as Error).message}</p>}
        {rows.map((m) => (
          <article key={m.id} className="border-b border-rule py-4">
            <div className="flex flex-wrap items-baseline gap-x-3 text-ink-3">
              <b className="font-normal text-ink">{m.name}</b>
              <span className="mono text-[11.5px]">{when(m.createdAt)}</span>
              <span className="text-[12.5px]">{title(m.entry)}</span>
              {m.block && <span className="mono text-[11px] text-accent">批注</span>}
              {m.parentId && <span className="mono text-[11px]">回复 #{m.parentId}</span>}
            </div>
            {m.quote && <blockquote className="my-2 border-l border-accent pl-3 text-[13px] text-ink-2">{m.quote}</blockquote>}
            <p className="my-1.5 whitespace-pre-wrap break-words">{m.body}</p>
            <div className="mt-2 flex gap-4">
              {m.status !== 'approved' && <Button variant="link" onClick={() => act(() => api.setCommentStatus(m.id, 'approved'))}><Check size={13} />通过</Button>}
              {m.status !== 'hidden' && <Button variant="link" onClick={() => act(() => api.setCommentStatus(m.id, 'hidden'))}><EyeOff size={13} />隐藏</Button>}
              <Button variant="link" onClick={async () => { if (await confirm({ title: '永久删除这条评论？', description: '它下面的回复也会一起删除，不能恢复。', confirmLabel: '删除', danger: true })) void act(() => api.removeComment(m.id)); }}><Trash2 size={13} />删除</Button>
            </div>
          </article>
        ))}
        {!list.isPending && rows.length === 0 && <Empty>这里没有评论。</Empty>}
      </Body>
    </>
  );
}
