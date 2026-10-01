import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Hammer, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useProject, useRefresh } from '@/lib/hooks';
import type { PublishConfig } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/confirm';
import { Field } from '@/components/field';
import { Input } from '@/components/ui/input';
import { Body, Card, PageHeader, Section } from '@/components/page';
import { Segmented } from '@/components/segmented';

const TARGETS = { git: 'GitHub 仓库', 'cloudflare-pages': 'Cloudflare Pages', rsync: '自己的服务器', local: '本地文件夹' } as const;
const describe = (p: PublishConfig | null) => {
  if (!p) return '';
  if (p.target === 'git') return `Git 仓库 · ${p.branch ? `${p.branch} 分支` : '当前分支'}`;
  if (p.target === 'cloudflare-pages') return `Cloudflare Pages · ${p.project}${p.branch ? `（${p.branch} 分支）` : ''}`;
  if (p.target === 'local') return `本地文件夹 → ${p.dest}`;
  return `服务器 → ${p.dest}`;
};

export default function Publish() {
  const { data: project } = useProject();
  const refresh = useRefresh();
  const confirm = useConfirm();
  const pub = project?.publish ?? null;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PublishConfig>({ target: 'git' });
  const [log, setLog] = useState('');
  const [busy, setBusy] = useState<'build' | 'publish' | null>(null);
  const [code, setCode] = useState<number | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  useEffect(() => { setEditing(!pub); if (pub) setForm(pub); }, [pub === null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [log]);

  const savePublish = async (value: PublishConfig | null) => {
    try { await api.setPublish(value); await refresh(); if (value) { setEditing(false); toast.success('已保存'); } } catch (e) { toast.error((e as Error).message); }
  };
  const run = async (kind: 'build' | 'publish') => {
    if (kind === 'publish' && !(await confirm({ title: '发布到线上？', description: `会把当前内容发布到：${describe(pub)}。线上的站点会随之更新。`, confirmLabel: '构建并发布' }))) return;
    setBusy(kind); setCode(null); setLog('');
    const c = await (kind === 'publish' ? api.publish : api.build)(setLog);
    setCode(c); setBusy(null);
    if (c === 0) toast.success(kind === 'publish' ? '已发布' : '构建完成'); else toast.error('没有成功，看下面的输出');
  };
  const set = (p: Partial<PublishConfig>) => setForm({ ...form, ...p });
  const targets = (Object.keys(TARGETS) as Array<keyof typeof TARGETS>).filter((k) => k !== 'local' || project?.dev || pub?.target === 'local');

  return (
    <>
      <PageHeader title="构建与发布" actions={code !== null && <span className={cn('rounded-full px-3 py-1 text-12', code ? 'bg-muted text-destructive' : 'bg-muted text-soft-foreground')}>{code ? `失败（退出码 ${code}）` : '完成'}</span>} />
      <Body>
        <Section title="发布到哪里"><Card>
          {!editing && pub ? (
            <div className="flex items-center gap-2"><Send size={16} className="ml-1 text-muted-foreground" /><span className="ml-1 flex-1 font-medium">{describe(pub)}</span>
              <Button variant="ghost" size="sm" onClick={() => { setForm(pub); setEditing(true); }}>修改</Button>
              <Button variant="ghost-danger" size="sm" onClick={async () => { if (await confirm({ title: '清除发布设置？', description: '不会影响已经发布的站点。', confirmLabel: '清除', danger: true })) void savePublish(null); }}>清除</Button>
            </div>
          ) : (
            <div>
              <Segmented value={form.target} onValueChange={(t) => setForm({ target: t })} options={targets.map((k) => ({ value: k, label: TARGETS[k] }))} />
              <div className="mt-3">
                {form.target === 'git' && <GitForm form={form} set={set} />}
                {form.target === 'local' && (<>
                  <Field label="文件夹"><Input value={form.dest ?? ''} onChange={(e) => set({ dest: e.target.value })} /></Field>
                </>)}
                {form.target === 'cloudflare-pages' && (<>
                  <Field label="项目名"><Input value={form.project ?? ''} onChange={(e) => set({ project: e.target.value })} /></Field>
                  <Field label="分支"><Input value={form.branch ?? ''} onChange={(e) => set({ branch: e.target.value })} /></Field>
                  <p className="pl-30 text-12 text-muted-foreground">先在终端运行 <span className="mono select-all">npx wrangler login</span></p>
                </>)}
                {form.target === 'rsync' && (<>
                  <Field label="服务器路径"><Input value={form.dest ?? ''} onChange={(e) => set({ dest: e.target.value })} /></Field>
                  <p className="pl-30 text-12 text-muted-foreground">服务器目录里多余的文件会被删除</p>
                </>)}
              </div>
              <div className="mt-4 flex gap-2 pl-30"><Button variant="default" onClick={() => savePublish(form)}>保存</Button>{pub && <Button onClick={() => setEditing(false)}>取消</Button>}</div>
            </div>
          )}
        </Card></Section>

        <Section title="更新站点"><Card>
          <div className="flex gap-2">
            <Button variant="default" disabled={!!busy || !pub} title={pub ? undefined : '先在上面设置发布到哪里'} onClick={() => run('publish')}><Send size={14} />{busy === 'publish' ? '发布中……' : '构建并发布'}</Button>
            <Button disabled={!!busy} onClick={() => run('build')}><Hammer size={14} />{busy === 'build' ? '构建中……' : '只构建'}</Button>
          </div>
          {log && <pre ref={logRef} className="mono mt-4 max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-xl bg-console p-4 text-11-5 leading-relaxed text-console-foreground ring-1 ring-white/5">{log}</pre>}
        </Card></Section>
      </Body>
    </>
  );
}

/** Git 目标：显示仓库状态；还没连就填地址连上；连上了选分支、写提交说明 */
function GitForm({ form, set }: { form: PublishConfig; set: (p: Partial<PublishConfig>) => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: info, refetch } = useQuery({ queryKey: ['git'], queryFn: api.git, staleTime: 0 });
  if (!info) return <p className="text-muted-foreground">读取仓库状态……</p>;
  const connect = async () => { setBusy(true); try { await api.gitInit(url.trim(), form.branch || 'main'); await refetch(); } catch (e) { toast.error((e as Error).message); } setBusy(false); };
  const origin = info.remotes?.find((r) => r.name === (form.remote || 'origin')) ?? info.remotes?.[0];
  if (!info.isRepo || !info.remotes?.length) {
    return (<>
      <Field label="仓库地址"><Input value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
      <div className="pl-30"><Button disabled={busy || !url.trim()} onClick={connect}>{busy ? '连接中……' : '连接仓库'}</Button></div>
    </>);
  }
  return (<>
    <p className="mb-2 text-12-5 leading-relaxed text-muted-foreground">
      已连接 {origin?.url.replace(/^https?:\/\/|\.git$/g, '')}（{info.branch} 分支）<br />
      {info.changed ? `有 ${info.changed} 处改动还没发布` : '没有未发布的改动'}{info.last ? `　最近一次提交：${info.last}` : ''}
      {info.nested && <><br />这个项目放在另一个仓库的文件夹里，发布会推送到那个仓库。</>}
    </p>
    <Field label="分支"><Input value={form.branch ?? ''} onChange={(e) => set({ branch: e.target.value })} placeholder={`默认 ${info.branch}`} /></Field>
    <Field label="提交说明"><Input value={form.message ?? ''} onChange={(e) => set({ message: e.target.value })} /></Field>
  </>);
}
