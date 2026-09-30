import { useRef, useState } from 'react';
import { ImagePlus, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, assetUrl } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useProject, useRefresh } from '@/lib/hooks';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { Input } from './ui/input';

/** 内容 JSON 里图片的相对路径 ⇄ 图片文件名 */
export const assetPath = (name: string) => `../../assets/${name}`;
export const assetName = (p?: string) => (p ? p.split('/').pop() ?? '' : '');

/** 图库：选一张已有的，或拖入 / 选择新图片 */
export function AssetDialog({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (name: string) => void }) {
  const { data: project } = useProject();
  const refresh = useRefresh();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const assets = (project?.assets ?? []).filter((n) => n.toLowerCase().includes(q.toLowerCase()));

  const upload = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return toast.error('只能上传图片');
    setBusy(true);
    try {
      let last = '';
      for (const f of imgs) last = (await api.upload(f)).name;
      await refresh();
      if (imgs.length === 1 && last) onPick(last);
      else toast.success(`已上传 ${imgs.length} 张`);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title="图库" description={`${project?.assets.length ?? 0} 张图片`}>
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void upload([...e.dataTransfer.files]); }}
          className={cn('flex items-center gap-3 rounded-xl bg-sunk px-4 py-3 text-[13px] text-ink-3 transition-[background-color,color,box-shadow]', over && 'bg-sunk-2 text-ink ring-2 ring-ink/25')}
        >
          <Upload size={16} />
          <span className="flex-1">{busy ? '上传中……' : '把图片拖到这里，或'}</span>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { void upload([...(e.target.files ?? [])]); e.target.value = ''; }} />
          <Button size="sm" variant="secondary" onClick={() => input.current?.click()} disabled={busy}>选择文件</Button>
        </div>
        {(project?.assets.length ?? 0) > 8 && <Input className="mt-3" value={q} onChange={(e) => setQ(e.target.value)} placeholder="按文件名找" />}
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3">
          {assets.map((n) => (
            <button key={n} type="button" onClick={() => onPick(n)} className="group text-left">
              <img loading="lazy" src={assetUrl(n, 240)} alt="" className="aspect-[4/3] w-full rounded-lg bg-sunk object-cover transition-[box-shadow,transform] duration-200 group-hover:ring-2 group-hover:ring-ink/60 group-active:scale-[.98]" />
              <span className="mono mt-1 block truncate text-[11px] text-ink-3">{n}</span>
            </button>
          ))}
        </div>
        {assets.length === 0 && <p className="py-10 text-center text-ink-3">{project?.assets.length ? '没有匹配的图片。' : '还没有图片。'}</p>}
      </DialogContent>
    </Dialog>
  );
}

/** 图片字段：缩略图 + 选择 / 清除。value 是内容里的相对路径 */
export function ImageField({ value, onChange, optional = true }: { value?: string; onChange: (v: string | undefined) => void; optional?: boolean }) {
  const [open, setOpen] = useState(false);
  const name = assetName(value);
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => setOpen(true)} className="grid h-14 w-[4.5rem] shrink-0 place-items-center overflow-hidden rounded-lg bg-sunk text-ink-3 transition-[box-shadow] hover:ring-2 hover:ring-ink/25">
        {name ? <img src={assetUrl(name, 160)} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={18} />}
      </button>
      <div className="min-w-0 text-[12.5px]">
        <div className="mono truncate text-ink-3">{name || '未选择'}</div>
        <div className="mt-0.5 flex gap-3">
          <button type="button" className="text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink" onClick={() => setOpen(true)}>{name ? '更换' : '选择图片'}</button>
          {name && optional && <button type="button" className="inline-flex items-center gap-0.5 text-ink-3 hover:text-danger" onClick={() => onChange(undefined)}><X size={12} />清除</button>}
        </div>
      </div>
      <AssetDialog open={open} onOpenChange={setOpen} onPick={(n) => { onChange(assetPath(n)); setOpen(false); }} />
    </div>
  );
}
