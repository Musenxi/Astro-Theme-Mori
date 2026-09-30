import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Eye, ExternalLink, PanelRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useProject, useRefresh } from '@/lib/hooks';
import type { Doc, Kind } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { onCard } from '@/components/ui/page';
import { Segmented } from '@/components/ui/segmented';
import { InfoPanel } from '@/editor/info-panel';
import { Notices } from '@/editor/notices';
import { RawView } from '@/editor/raw-view';
import { useAutosave } from '@/editor/use-autosave';
import { isTravelDoc } from '@/lib/template.js';

const MarkdownView = lazy(() => import('@/editor/markdown-view').then((m) => ({ default: m.MarkdownView })));
const BlocksView = lazy(() => import('@/editor/blocks-view').then((m) => ({ default: m.BlocksView })));
const TravelLayout = lazy(() => import('@/editor/travel-layout').then((m) => ({ default: m.TravelLayout })));

type Mode = 'md' | 'blocks' | 'raw';
const MODE_KEY = 'mori-studio-mode';

export default function Editor({ kind }: { kind: 'post' | 'page' }) {
  const { id = '' } = useParams();
  const { data, error, isPending } = useQuery({ queryKey: ['entry', kind, id], queryFn: () => api.entry(kind, id), staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false });
  if (error) return <div className="grid h-full place-items-center px-8 text-center text-ink-3">{(error as Error).message}<Link to={kind === 'page' ? '/pages' : '/posts'} className="mt-3 underline">回到列表</Link></div>;
  if (isPending) return <div className="grid h-full place-items-center text-ink-3">读取中……</div>;
  return <Session key={`${kind}/${id}`} routeKind={kind} id={id} initial={data} />;
}

function Session({ routeKind, id, initial }: { routeKind: 'post' | 'page'; id: string; initial: Doc }) {
  const { data: project } = useProject();
  const refresh = useRefresh();
  const modes = useMemo<Array<{ value: Mode; label: string }>>(() => [{ value: 'md', label: 'Markdown' }, { value: 'blocks', label: '排版' }, { value: 'raw', label: '源码' }], []);
  const [mode, setModeState] = useState<Mode>(() => { try { const m = localStorage.getItem(MODE_KEY) as Mode | null; if (m && modes.some((x) => x.value === m)) return m; } catch { /* 存不了就用默认 */ } return modes[0].value; });
  const setMode = (m: Mode) => { setModeState(m); if (m !== 'raw') try { localStorage.setItem(MODE_KEY, m); } catch { /* 无所谓 */ } };
  const [panel, setPanel] = useState<'info' | 'preview' | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  const [doc, setDocState] = useState<Doc>(initial);
  // 普通文章还是游记，看内容本身：在“信息”里换了模版，这里跟着变
  const kind: Kind = routeKind === 'page' ? 'page' : isTravelDoc(doc) ? 'travel' : 'post';
  const setDoc = useCallback((fn: (d: Doc) => Doc) => setDocState((d) => fn(d)), []);
  const patch = useCallback((p: Doc) => setDocState((d) => {
    const next = { ...d, ...p };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]; // 清掉的字段不写进 JSON
    return next;
  }), []);

  const { state } = useAutosave(kind, id, doc, () => { void refresh(); setTimeout(() => setPreviewKey((k) => k + 1), 700); });

  const path = routeKind === 'page' ? `/${id}/` : `/posts/${id}/`;
  useEffect(() => { document.title = `${doc.title || id} · MORI Studio`; return () => { document.title = 'MORI Studio'; }; }, [doc.title, id]);

  const status = state.status === 'saving' ? '保存中……' : state.status === 'dirty' ? '未保存' : state.status === 'error' ? '保存失败' : state.errors.length ? `已保存 · ${state.errors.length} 处需要检查` : '已保存';

  return (
    <div className="flex h-full flex-col">
      <header className="flex min-h-[4rem] shrink-0 items-center gap-3 px-5 py-2">
        <Link to={routeKind === 'page' ? '/pages' : '/posts'} className="flex h-8 items-center gap-0.5 rounded-full pl-2 pr-3.5 text-ink-2 transition-colors hover:bg-ink/[.06] hover:text-ink"><ChevronLeft size={16} />{routeKind === 'page' ? '页面' : '文章'}</Link>
        <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">{doc.title || id}</h1>
        <span className={cn('flex items-center gap-2 rounded-full px-3 py-1 text-[12px] transition-colors', state.status === 'error' || state.errors.length ? 'bg-sunk text-danger' : 'bg-ink/[.05] text-ink-3')}>
          <i className={cn('h-1.5 w-1.5 rounded-full', state.status === 'saved' ? 'bg-ink-3/60' : state.status === 'error' ? 'bg-danger' : 'animate-pulse bg-ink-2')} />{status}
        </span>
        <Segmented size="sm" value={mode} onValueChange={setMode} options={modes} />
        <Button size="sm" className={cn(panel === 'info' && 'bg-ink/[.14] hover:bg-ink/[.18]')} onClick={() => setPanel(panel === 'info' ? null : 'info')}><PanelRight size={14} />信息</Button>
        <Button size="sm" className={cn(panel === 'preview' && 'bg-ink/[.14] hover:bg-ink/[.18]')} onClick={() => setPanel(panel === 'preview' ? null : 'preview')}><Eye size={14} />预览</Button>
      </header>
      <Notices state={state} />
      {state.status === 'error' && <p className="mx-5 mb-2 shrink-0 rounded-xl bg-sunk px-4 py-2.5 text-[12.5px] text-danger">没能保存：{state.message}。内容还在这个页面里，修好之后会自动重试。</p>}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <Suspense fallback={<div className="grid h-full place-items-center text-ink-3">载入编辑器……</div>}>
            {mode === 'md' && <MarkdownView key={kind} doc={doc} setDoc={setDoc} travel={kind === 'travel'} />}
            {mode === 'blocks' && (kind === 'travel' ? <TravelLayout doc={doc} setDoc={setDoc} /> : <BlocksView key={kind} kind={kind} doc={doc} patch={patch} setDoc={setDoc} />)}
            {mode === 'raw' && <RawView doc={doc} setDoc={setDoc} />}
          </Suspense>
        </div>
        {panel === 'info' && (
          <aside className={cn('mb-2 mr-2 w-[26rem] shrink-0 animate-slide-in overflow-y-auto rounded-2xl bg-sunk/60', onCard)}><InfoPanel kind={kind} doc={doc} set={patch} setDoc={setDoc} /></aside>
        )}
        {panel === 'preview' && project && (
          <aside className="mb-2 mr-2 w-[46%] min-w-[24rem] shrink-0 animate-slide-in overflow-hidden rounded-2xl bg-sunk/60">
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
          <p className="mb-4 text-ink-3">预览用的是站点自己的主题，真实渲染。</p>
          <Button variant="primary" onClick={start} disabled={starting}>{starting ? '正在启动……' : '启动预览'}</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="mono flex shrink-0 items-center gap-1 px-4 py-2 text-[11.5px] text-ink-3">
        <span className="flex-1 truncate rounded-full bg-ink/[.06] px-3 py-1">{path}</span>
        <button type="button" aria-label="刷新" className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-ink/[.08] hover:text-ink" onClick={onRefresh}><RefreshCw size={13} /></button>
        <a aria-label="在新窗口打开" className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-ink/[.08] hover:text-ink" href={`${base}${path}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /></a>
      </div>
      <iframe key={nonce} title="预览" src={`${base}${path}`} className="mx-2 mb-2 min-h-0 flex-1 rounded-xl bg-white" />
    </div>
  );
}
