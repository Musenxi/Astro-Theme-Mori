import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, EyeOff, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, api, type CommentRow } from '@/lib/api';
import { cn } from '@/lib/cn';
import { avatarUrl } from 'astro-mori/avatar';
import { useProject, useRefresh } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/confirm';
import { Input } from '@/components/ui/input';
import { Body, Empty, PageHeader } from '@/components/page';
import { Segmented } from '@/components/segmented';

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
        <Body><p className="text-soft-foreground">没有启用自建评论。</p></Body>
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
            <p className="mono text-muted-foreground">{c.endpoint}</p>
            <Button variant="default" className="mt-3" onClick={() => save('dev-token')}>使用 dev-token</Button>
          </div>
        ) : <p className="mono mb-6 text-muted-foreground">{c.endpoint}</p>}
        {wrong && <p className="mb-4 rounded-lg bg-muted px-3.5 py-2.5 text-destructive">令牌不对，评论服务拒绝了。{local && '如果你是自己用别的令牌启动的服务，请填那个。'}</p>}
        <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); if (token) void save(token); }}>
          <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="管理令牌" />
          <Button type="submit" disabled={!token}>保存</Button>
        </form>
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
      <PageHeader title="评论" actions={<Button variant="ghost" size="sm" onClick={() => void reload()}><RefreshCw size={14} className={cn(list.isFetching && 'animate-spin')} />刷新</Button>} />
      <Body>
        <Segmented className="mb-4" value={tab} onValueChange={setTab} options={TABS.map(([k, n]) => ({ value: k, label: stats.data && stats.data[k] ? `${n} ${stats.data[k]}` : n }))} />
        {list.error && !(list.error instanceof ApiError && list.error.status === 401) && <p className="my-4 rounded-lg bg-muted px-3.5 py-2.5 text-destructive">{(list.error as Error).message}</p>}
        <div className="space-y-3">
          {rows.map((m) => (
            <article key={m.id} className="flex gap-3.5 rounded-2xl bg-muted/70 p-4 transition-colors hover:bg-muted">
              <Avatar name={m.name} src={avatarUrl(project?.comments.avatar, m.avatar)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
                  {m.url && /^https?:\/\//i.test(m.url)
                    ? <a href={m.url} target="_blank" rel="noopener noreferrer nofollow" title={m.url} className="font-medium text-foreground underline decoration-foreground/25 underline-offset-2 transition-colors hover:decoration-foreground">{m.name}</a>
                    : <b className="font-medium text-foreground">{m.name}</b>}
                  <span className="mono text-11-5">{when(m.createdAt)}</span>
                  <span className="text-12-5">{title(m.entry)}</span>
                  {m.parentId && <span className="mono rounded-full bg-foreground/[.06] px-2 py-px text-11">回复 #{m.parentId}</span>}
                </div>
                {m.quote && <blockquote className="my-2.5 rounded-lg bg-foreground/[.05] px-3.5 py-2 text-13 text-soft-foreground">{m.quote}</blockquote>}
                <p className="my-1.5 whitespace-pre-wrap break-words">{m.body}</p>
                <div className="-ml-2.5 mt-2 flex gap-1">
                  {m.status !== 'approved' && <Button variant="ghost" size="sm" onClick={() => act(() => api.setCommentStatus(m.id, 'approved'))}><Check size={14} />通过</Button>}
                  {m.status !== 'hidden' && <Button variant="ghost" size="sm" onClick={() => act(() => api.setCommentStatus(m.id, 'hidden'))}><EyeOff size={14} />隐藏</Button>}
                  <Button variant="ghost-danger" size="sm" onClick={async () => { if (await confirm({ title: '永久删除这条评论？', description: '它下面的回复也会一起删除，不能恢复。', confirmLabel: '删除', danger: true })) void act(() => api.removeComment(m.id)); }}><Trash2 size={14} />删除</Button>
                </div>
              </div>
            </article>
          ))}
        </div>
        {!list.isPending && rows.length === 0 && <Empty>这里没有评论。</Empty>}
      </Body>
    </>
  );
}

/** 头像：评论服务给的哈希 + 站点选的头像服务；没有头像、或图片打不开，就退回名字的第一个字 */
function Avatar({ name, src }: { name: string; src: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/[.07] text-14 font-medium text-soft-foreground">
      {src && !broken ? <img src={src} alt="" width={36} height={36} referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-full w-full object-cover" /> : [...(name || '?')][0]}
    </span>
  );
}
