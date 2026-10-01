import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api, assetUrl, type AssetInfo } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useRefresh } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/confirm';
import { Input } from '@/components/ui/input';
import { Body, Empty, PageHeader } from '@/components/page';
import { Segmented } from '@/components/segmented';

const size = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const href = (r: AssetInfo['usedBy'][number]) => (r.kind === 'page' ? `/pages/${r.id}` : r.kind === 'friends' ? '/friends' : `/posts/${r.id}`);

export default function Files() {
  const refresh = useRefresh();
  const confirm = useConfirm();
  const { data, refetch } = useQuery({ queryKey: ['assets'], queryFn: api.assets, staleTime: 0 });
  const [q, setQ] = useState('');
  const [view, setView] = useState<'all' | 'unused'>('all');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const all = useMemo(() => data?.assets ?? [], [data?.assets]);
  const list = useMemo(() => all.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()) && (view === 'all' || a.usedBy.length === 0)), [all, q, view]);
  const unused = all.filter((a) => a.usedBy.length === 0).length;

  const upload = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return toast.error('只能上传图片');
    setBusy(true);
    try { for (const f of imgs) await api.upload(f); await Promise.all([refetch(), refresh()]); toast.success(`已上传 ${imgs.length} 张`); } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  const remove = async (a: AssetInfo) => {
    const used = a.usedBy.length;
    if (!(await confirm({ title: `删除 ${a.name}？`, description: used ? `它正被 ${used} 处内容使用，删掉之后那里会找不到图片、构建会报错。文件会保留在项目的回收站文件夹里。` : '文件不会彻底删除，会保留在项目的回收站文件夹里。', confirmLabel: '删除', danger: true }))) return;
    try { await api.removeAsset(a.name); await Promise.all([refetch(), refresh()]); toast.success('已删除'); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false); }} onDrop={(e) => { e.preventDefault(); setOver(false); void upload([...e.dataTransfer.files]); }} className="min-h-full">
      <PageHeader title="文件" sub={`${all.length} 张 · ${unused} 张没被引用`} actions={<>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { void upload([...(e.target.files ?? [])]); e.target.value = ''; }} />
        <Button variant="default" onClick={() => input.current?.click()} disabled={busy}><Upload size={14} />{busy ? '上传中……' : '上传图片'}</Button>
      </>} />
      <Body wide className={cn('rounded-2xl transition-[background-color,box-shadow]', over && 'bg-foreground/[.03] ring-2 ring-foreground/20')}>
        <div className="mb-5 flex items-center gap-3">
          <Input variant="pill" className="w-56" value={q} onChange={(e) => setQ(e.target.value)} placeholder="按文件名找" />
          <Segmented size="sm" value={view} onValueChange={setView} options={[{ value: 'all', label: '全部' }, { value: 'unused', label: '没被引用' }]} />
          <span className="ml-auto text-12 text-muted-foreground">{over ? '松手上传' : ''}</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] gap-4">
          {list.map((a) => (
            <figure key={a.name} className="group rounded-2xl bg-muted/70 p-2 transition-colors hover:bg-muted">
              <div className="relative overflow-hidden rounded-xl bg-muted-hover">
                <img loading="lazy" src={assetUrl(a.name, 360)} alt="" className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-103" />
                <button type="button" aria-label={`删除 ${a.name}`} onClick={() => remove(a)} className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-popover/90 text-soft-foreground opacity-0 shadow-soft backdrop-blur transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"><Trash2 size={13} /></button>
              </div>
              <figcaption className="px-1.5 pb-1 pt-2">
                <div className="mono truncate text-11-5" title={a.name}>{a.name}</div>
                <div className="mono text-10-5 text-muted-foreground">{a.width && a.height ? `${a.width}×${a.height} · ` : ''}{size(a.size)}</div>
                <div className="mt-0.5 text-12">
                  {a.usedBy.length === 0 ? <span className="text-muted-foreground">没被引用</span> : (
                    <span className="text-soft-foreground">被引用：{a.usedBy.slice(0, 2).map((r, i) => <span key={r.kind + r.id}>{i > 0 && '、'}<Link to={href(r)} className="text-foreground underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground">{r.title}</Link></span>)}{a.usedBy.length > 2 && ` 等 ${a.usedBy.length} 处`}</span>
                  )}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
        {list.length === 0 && <Empty>{all.length ? '没有符合条件的图片。' : '还没有图片。点右上角“上传图片”，或直接拖进来。'}</Empty>}
      </Body>
    </div>
  );
}
