import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Eye, ExternalLink, PanelRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useProject, useRefresh } from '@/lib/hooks';
import type { Doc, Kind } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/confirm';
import { onCard } from '@/components/page';
import { Segmented } from '@/components/segmented';
import { InfoPanel } from '@/editor/info-panel';
import { Notices } from '@/editor/notices';
import { RawView } from '@/editor/raw-view';
import { useAutosave } from '@/editor/use-autosave';
import { normalizeDoc } from 'astro-mori/flow';

const MarkdownView = lazy(() => import('@/editor/markdown-view').then((m) => ({ default: m.MarkdownView })));
const BlocksView = lazy(() => import('@/editor/blocks-view').then((m) => ({ default: m.BlocksView })));
const LayoutView = lazy(() => import('@/editor/layout-view').then((m) => ({ default: m.LayoutView })));

type Mode = 'md' | 'blocks' | 'raw';

export default function Editor({ kind }: { kind: 'post' | 'page' }) {
  const { id = '' } = useParams();
  const { data, error, isPending } = useQuery({ queryKey: ['entry', kind, id], queryFn: () => api.entry(kind, id), staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false });
  if (error) return <div className="grid h-full place-items-center px-8 text-center text-muted-foreground">{(error as Error).message}<Link to={kind === 'page' ? '/pages' : '/posts'} className="mt-3 underline">回到列表</Link></div>;
  if (isPending) return <div className="grid h-full place-items-center text-muted-foreground">读取中……</div>;
  // 以前的游记（stops + 每个块属于一站）打开时转成现在的结构；改动保存时才写回文件
  return <Session key={`${kind}/${id}`} routeKind={kind} id={id} initial={kind === 'post' ? normalizeDoc(data) : data} />;
}

function Session({ routeKind, id, initial }: { routeKind: 'post' | 'page'; id: string; initial: Doc }) {
  const { data: project } = useProject();
  const refresh = useRefresh();
  const confirm = useConfirm();
  const nav = useNavigate();
  const qc = useQueryClient();
  const modes = useMemo<Array<{ value: Mode; label: string }>>(() => [{ value: 'md', label: 'Markdown' }, { value: 'blocks', label: '排版' }, { value: 'raw', label: '源码' }], []);
  const [mode, setMode] = useState<Mode>('md');
  const [panel, setPanel] = useState<'info' | 'preview' | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  const [doc, setDocState] = useState<Doc>(initial);
  const kind: Kind = routeKind;
  const setDoc = useCallback((fn: (d: Doc) => Doc) => setDocState((d) => fn(d)), []);
  const patch = useCallback((p: Doc) => setDocState((d) => {
    const next = { ...d, ...p };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]; // 清掉的字段不写进 JSON
    return next;
  }), []);

  // “信息”里的改动不自动保存：记下改了哪些字段，自动保存时这些字段仍写上次保存的值，点保存 / 发布才一起写
  const docRef = useRef(doc);
  docRef.current = doc;
  const held = useRef(new Set<string>());
  const savedRef = useRef<Doc>(initial);
  const [heldCount, setHeldCount] = useState(0);
  const strip = useCallback((d: Doc) => {
    if (!held.current.size) return d;
    const out = { ...d };
    for (const k of held.current) { if (k in savedRef.current) out[k] = savedRef.current[k]; else delete out[k]; }
    return out;
  }, []);
  const infoPatch = useCallback((p: Doc) => {
    for (const k of Object.keys(p)) held.current.add(k);
    setHeldCount(held.current.size);
    patch(p);
  }, [patch]);

  const { state, flush, cancel } = useAutosave(kind, id, doc, (sent, manual) => {
    savedRef.current = sent;
    if (manual) { held.current.clear(); setHeldCount(0); }
    void refresh(); setTimeout(() => setPreviewKey((k) => k + 1), 700);
  }, strip);

  const [busy, setBusy] = useState(false);
  const save = async (next?: Doc, done?: string) => {
    setBusy(true);
    if (next) setDocState(next);
    const r = await flush(next ?? true);
    setBusy(false);
    if (r) toast.success(done ?? '已保存');
  };
  /** 公开度选的是草稿时，这个按钮是“转为草稿”：站上撤下；否则是“发布” */
  const toDraft = !!doc.draft;
  const publish = async () => {
    const next = { ...doc };
    if (!toDraft) delete next.draft;
    setBusy(true);
    setDocState(next);
    try {
      if (!(await flush(next))) throw new Error('没能保存');
      const kind = routeKind === 'page' ? 'page' : 'post';
      if (toDraft) await api.unpublishEntry(kind, id); else await api.publishEntry(kind, id);
      await refresh();
      toast.success(toDraft ? '已转为草稿' : '已发布');
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  const summary = routeKind === 'page' ? project?.pages.find((p) => p.id === id) : project?.entries.find((e) => e.id === id);
  const hasDraft = !!summary?.changed; // 和上次发布的比有改动才有可删的草稿
  const discard = async () => {
    if (!(await confirm({ title: '删除草稿？', description: '没发布的修改会丢掉，回到上次发布的版本。', confirmLabel: '删除草稿', danger: true }))) return;
    try {
      cancel();
      const r = await api.discardDraft(routeKind === 'page' ? 'page' : 'post', id);
      await refresh();
      qc.removeQueries({ queryKey: ['entry', routeKind, id] });
      toast.success('已删除草稿');
      nav(routeKind === 'page' ? '/pages' : '/posts');
      void r;
    } catch (e) { toast.error((e as Error).message); }
  };

  const path = routeKind === 'page' ? `/${id}/` : `/posts/${id}/`;
  useEffect(() => { document.title = `${doc.title || id} · MORI Studio`; return () => { document.title = 'MORI Studio'; }; }, [doc.title, id]);

  const unsaved = state.status === 'dirty' || (state.status === 'saved' && heldCount > 0);
  const status = state.status === 'saving' ? '保存中……' : unsaved ? '未保存' : state.status === 'error' ? '保存失败' : state.errors.length ? `已保存 · ${state.errors.length} 处需要检查` : '已保存';

  return (
    <div className="flex h-full flex-col">
      <header className="flex min-h-16 shrink-0 items-center gap-3 px-5 py-2">
        <Link to={routeKind === 'page' ? '/pages' : '/posts'} className="flex h-8 items-center gap-0.5 rounded-full pl-2 pr-3.5 text-soft-foreground transition-colors hover:bg-foreground/[.06] hover:text-foreground"><ChevronLeft size={16} />{routeKind === 'page' ? '页面' : '文章'}</Link>
        <h1 className="min-w-0 flex-1 truncate text-17 font-semibold tracking-tight">{doc.title || id}</h1>
        <span className={cn('flex items-center gap-2 rounded-full px-3 py-1 text-12 transition-colors', state.status === 'error' || state.errors.length ? 'bg-muted text-destructive' : 'bg-foreground/[.05] text-muted-foreground')}>
          <i className={cn('h-1.5 w-1.5 rounded-full', state.status === 'saved' && !unsaved ? 'bg-muted-foreground/60' : state.status === 'error' ? 'bg-destructive' : 'animate-pulse bg-soft-foreground')} />{status}
        </span>
        <Segmented size="sm" value={mode} onValueChange={setMode} options={modes} />
        <Button size="sm" onClick={() => void save()} disabled={busy}>保存</Button>
        {hasDraft && <Button size="sm" variant="ghost-danger" onClick={() => void discard()} disabled={busy}>删除草稿</Button>}
        <Button size="sm" variant="default" onClick={() => void publish()} disabled={busy}>{toDraft ? '转为草稿' : '发布'}</Button>
        <Button size="sm" active={panel === 'info'} onClick={() => setPanel(panel === 'info' ? null : 'info')}><PanelRight size={14} />信息</Button>
        <Button size="sm" active={panel === 'preview'} onClick={() => setPanel(panel === 'preview' ? null : 'preview')}><Eye size={14} />预览</Button>
      </header>
      <Notices state={state} />
      {state.status === 'error' && <p className="mx-5 mb-2 shrink-0 rounded-xl bg-muted px-4 py-2.5 text-12-5 text-destructive">没能保存：{state.message}。内容还在这个页面里，修好之后会自动重试。</p>}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <Suspense fallback={<div className="grid h-full place-items-center text-muted-foreground">载入编辑器……</div>}>
            {mode === 'md' && <MarkdownView doc={doc} setDoc={setDoc} />}
            {mode === 'blocks' && (kind === 'post' ? <LayoutView doc={doc} setDoc={setDoc} /> : <BlocksView doc={doc} patch={patch} setDoc={setDoc} />)}
            {mode === 'raw' && <RawView doc={doc} setDoc={setDoc} />}
          </Suspense>
        </div>
        {panel === 'info' && (
          <aside className={cn('mb-2 mr-2 w-104 shrink-0 animate-slide-in overflow-y-auto rounded-2xl bg-muted/60', onCard)}><InfoPanel kind={kind} doc={doc} set={infoPatch} edit={setDoc} /></aside>
        )}
        {panel === 'preview' && project && (
          <aside className="mb-2 mr-2 w-[46%] min-w-96 shrink-0 animate-slide-in overflow-hidden rounded-2xl bg-muted/60">
            <Preview base={project.preview.url} path={path} nonce={previewKey} onRefresh={() => setPreviewKey((k) => k + 1)} onStarted={() => void refresh()} />
          </aside>
        )}
      </div>
    </div>
  );
}

function Preview({ base, path, nonce, onRefresh, onStarted }: { base: string | null; path: string; nonce: number; onRefresh: () => void; onStarted: () => void }) {
  const [starting, setStarting] = useState(false);
  const start = async () => {
    setStarting(true);
    try {
      const r = await api.previewStart();
      if (!r.up) toast.error('预览没能启动（等了 30 秒仍没有响应）。请确认项目已安装好依赖，然后再试。');
      onStarted();
    } catch (e) { toast.error((e as Error).message); }
    setStarting(false);
  };
  if (!base) {
    return (
      <div className="grid h-full place-items-center px-8 text-center">
        <div>
          <Button variant="default" onClick={start} disabled={starting}>{starting ? '正在启动……' : '启动预览'}</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="mono flex shrink-0 items-center gap-1 px-4 py-2 text-11-5 text-muted-foreground">
        <span className="flex-1 truncate rounded-full bg-foreground/[.06] px-3 py-1">{path}</span>
        <button type="button" aria-label="刷新" className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-foreground/[.08] hover:text-foreground" onClick={onRefresh}><RefreshCw size={13} /></button>
        <a aria-label="在新窗口打开" className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-foreground/[.08] hover:text-foreground" href={`${base}${path}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /></a>
      </div>
      <iframe key={nonce} title="预览" src={`${base}${path}`} className="mx-2 mb-2 min-h-0 flex-1 rounded-xl bg-white" />
    </div>
  );
}
