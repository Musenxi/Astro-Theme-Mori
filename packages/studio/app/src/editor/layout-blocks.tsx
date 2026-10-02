import { useRef, useState } from 'react';
import { Compass, Plus, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api, assetUrl } from '@/lib/api';
import { cn } from '@/lib/cn';
import { assetName, assetPath, AssetDialog, ImageField } from '@/components/asset-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumInput } from '@/components/field';
import { OptionSelect } from '@/components/option-select';
import type { Doc } from '@/lib/types';
import { appendPlace } from '@/lib/places.js';
import { InlineField } from './inline-field';

const Row = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="flex items-center gap-2 text-12 text-muted-foreground" title={hint}><span className="shrink-0">{label}</span><span className="min-w-0 flex-1">{children}</span></label>
);

function Images({ b, patch, extra, removable }: { b: Doc; patch: (p: Doc) => void; extra?: (im: Doc, i: number) => React.ReactNode; removable?: boolean }) {
  const list: Doc[] = b.images;
  const put = (i: number, p: Doc) => patch({ images: list.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  return (
    <>
      {list.map((im, i) => (
        <div key={i} className="mb-2 space-y-2 rounded-xl bg-foreground/[.035] p-3">
          <ImageField value={im.src} onChange={(v) => put(i, { src: v })} optional={false} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="替代文字" value={im.alt ?? ''} onChange={(e) => put(i, { alt: e.target.value })} />
            <Input placeholder="图注" value={im.caption ?? ''} onChange={(e) => put(i, { caption: e.target.value || undefined })} />
          </div>
          {extra?.(im, i)}
          {removable && list.length > 2 && <Button variant="link" onClick={() => patch({ images: list.filter((_, k) => k !== i) })}>移除这张</Button>}
        </div>
      ))}
    </>
  );
}

/** 排版视图里选中一块的细节（文字在 Markdown 里写，这里只有图片和长卷的块） */
export function LayoutBlockBody({ b, patch }: { b: Doc; patch: (p: Doc) => void }) {
  switch (b.type) {
    case 'image':
      return (
        <>
          <ImageField value={b.src} onChange={(v) => patch({ src: v })} optional={false} />
          <div className="mt-2 grid grid-cols-[1fr_9rem] gap-2">
            <Input placeholder="替代文字" value={b.alt ?? ''} onChange={(e) => patch({ alt: e.target.value })} />
            <OptionSelect value={b.layout ?? 'wide'} onValueChange={(v) => patch({ layout: v })} options={[{ value: 'wide', label: '通栏' }, { value: 'inline', label: '内缩' }]} />
          </div>
          <Input className="mt-2" placeholder="图注" value={b.caption ?? ''} onChange={(e) => patch({ caption: e.target.value || undefined })} />
        </>
      );
    case 'pair':
      return <Images b={b} patch={patch} />;
    case 'grid':
      return <><Images b={b} patch={patch} removable /><Button variant="link" onClick={() => patch({ images: [...b.images, { alt: '' }] })}><Plus size={14} />添加一张</Button></>;
    case 'strip':
      return (
        <>
          <Images b={b} patch={patch} removable extra={(im, i) => (
            <div className="grid grid-cols-2 gap-2">
              <Row label="缩放"><NumInput value={im.scale} onChange={(v) => patch({ images: b.images.map((x: Doc, k: number) => (k === i ? { ...x, scale: v ?? 1 } : x)) })} /></Row>
              <Row label="上下错开"><NumInput value={im.offset} onChange={(v) => patch({ images: b.images.map((x: Doc, k: number) => (k === i ? { ...x, offset: v ?? 0 } : x)) })} /></Row>
            </div>
          )} />
          <Button variant="link" onClick={() => patch({ images: [...b.images, { alt: '', scale: 1, offset: 0 }] })}><Plus size={14} />添加一张</Button>
        </>
      );
    case 'map':
      return <OptionSelect value={b.scope ?? 'region'} onValueChange={(v) => patch({ scope: v })} options={[{ value: 'region', label: '所在区域' }, { value: 'route', label: '全程路线' }, { value: 'near', label: '只看读到的地点附近' }]} />;
    case 'free':
      return <FreeCanvas b={b} patch={patch} />;
  }
  return <span className="text-muted-foreground">不认识的块类型 {String(b.type)}</span>;
}

/* ───────────── 自由排布：在画布上直接拖动 ───────────── */

function FreeCanvas({ b, patch }: { b: Doc; patch: (p: Doc) => void }) {
  const [sel, setSel] = useState<number | null>(null);
  const [lib, setLib] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const items: Doc[] = b.items;
  const put = (i: number, p: Doc) => patch({ items: items.map((it, k) => (k === i ? { ...it, ...p } : it)) });
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  // 拖动：按指针移动量换算成占画布的比例
  const startDrag = (e: React.PointerEvent, i: number) => {
    e.preventDefault(); setSel(i);
    const r = box.current!.getBoundingClientRect(), it = items[i], sx = e.clientX, sy = e.clientY, x0 = it.x, y0 = it.y;
    const move = (ev: PointerEvent) => put(i, { x: round(clamp(x0 + (ev.clientX - sx) / r.width)), y: round(clamp(y0 + (ev.clientY - sy) / r.height)) });
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };
  const s = sel !== null ? items[sel] : null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-3"><Row label="画布宽高比"><NumInput className="w-24" value={b.ar} min={0.2} onChange={(v) => v && patch({ ar: v })} /></Row><span className="text-12 text-muted-foreground">拖动图片调整位置；下面调宽度和叠放</span></div>
      <div ref={box} className="relative w-full touch-none overflow-hidden rounded-xl bg-foreground/[.05] ring-1 ring-inset ring-foreground/10 aspect-(--ar)" style={{ '--ar': b.ar }}>
        {items.map((it, i) => it.kind === 'image' ? (
          <img key={i} src={assetUrl(assetName(it.src), 400)} draggable={false} alt="" onPointerDown={(e) => startDrag(e, i)}
            className={cn('absolute top-[calc(var(--y)*100%)] left-[calc(var(--x)*100%)] z-(--z) w-[calc(var(--w)*100%)] cursor-move rounded-xs', sel === i ? 'outline outline-2 outline-brand' : 'outline outline-1 outline-foreground/15')} style={{ '--x': it.x, '--y': it.y, '--w': it.w, '--z': it.z ?? 1 }} />
        ) : (
          <div key={i} onPointerDown={(e) => startDrag(e, i)} className={cn('mono absolute top-[calc(var(--y)*100%)] left-[calc(var(--x)*100%)] z-99 cursor-move rounded-xs bg-popover p-0.5 writing-vertical', sel === i ? 'outline outline-2 outline-brand' : 'outline outline-1 outline-dashed outline-muted-foreground')} style={{ '--x': it.x, '--y': it.y }}>文字</div>
        ))}
      </div>
      {s && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Row label="x"><NumInput value={s.x} min={0} max={1} onChange={(v) => put(sel!, { x: v ?? 0 })} /></Row>
            <Row label="y"><NumInput value={s.y} min={0} max={1} onChange={(v) => put(sel!, { y: v ?? 0 })} /></Row>
            {s.kind === 'image' && <Row label="宽度"><NumInput value={s.w} min={0.05} max={1} onChange={(v) => put(sel!, { w: v ?? 0.3 })} /></Row>}
          </div>
          {s.kind === 'image' ? (
            <div className="grid grid-cols-[8rem_1fr] gap-2"><Row label="叠放"><NumInput value={s.z} onChange={(v) => put(sel!, { z: Math.round(v ?? 1) })} /></Row><Input placeholder="替代文字" value={s.alt ?? ''} onChange={(e) => put(sel!, { alt: e.target.value })} /></div>
          ) : (
            <InlineField key={sel} rows={2} value={s.text} onChange={(v) => put(sel!, { text: v })} placeholder="文字" />
          )}
          <Button variant="link" onClick={() => { patch({ items: items.filter((_, k) => k !== sel) }); setSel(null); }}>移除选中的</Button>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => setLib(true)}><Plus size={13} />加一张图</Button>
        <Button size="sm" onClick={() => patch({ items: [...items, { kind: 'text', text: '', x: 0.85, y: 0.1 }] })}><Plus size={13} />加一段竖排文字</Button>
      </div>
      <AssetDialog open={lib} onOpenChange={setLib} onPick={(n) => { patch({ items: [...items, { kind: 'image', src: assetPath(n), alt: '', x: 0.1, y: 0.1, w: 0.4, z: items.length + 1 }] }); setLib(false); }} />
    </div>
  );
}

/* ───────────── 路线数据：轨迹、按照片建议地点 ───────────── */

/** `set` 改文章的设置（轨迹）；`edit` 改正文（加地点是在文末加一段只有地名的文字） */
export function RouteData({ doc, set, edit }: { doc: Doc; set: (patch: Doc) => void; edit: (fn: (d: Doc) => Doc) => void }) {
  const [msg, setMsg] = useState('');
  const [sug, setSug] = useState<Awaited<ReturnType<typeof api.exif>> | null>(null);
  const [names, setNames] = useState<Record<number, string>>({});
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const file = useRef<HTMLInputElement>(null);
  const track = doc.track as unknown[] | undefined;

  const importGpx = async (f: File) => {
    setMsg('读取中……');
    try { const j = await api.importGpx(f); set({ track: j.track }); setMsg(`已导入：${j.points} 个点，简化成 ${j.simplified} 个`); } catch (e) { setMsg((e as Error).message); }
  };
  const suggest = async () => {
    setMsg('读取照片的拍摄地点……');
    try {
      const j = await api.exif();
      setSug(j); setPicked(Object.fromEntries(j.stops.map((_, i) => [i, true]))); setNames({});
      setMsg(j.stops.length ? `${j.photos} 张图里 ${j.withGps} 张带位置，建议 ${j.stops.length} 处` : `${j.photos} 张图里没有带位置的（GPS）`);
    } catch (e) { setMsg((e as Error).message); }
  };
  const addPins = () => {
    if (!sug) return;
    const chosen = sug.stops.map((s, i) => ({ s, i })).filter(({ i }) => picked[i]);
    edit((d) => chosen.reduce((acc, { s, i }) => appendPlace(acc, { name: (names[i] ?? '').trim() || `未命名 ${i + 1}`, lnglat: s.lnglat, date: s.date }), d));
    setSug(null); setMsg(`已在文末加入 ${chosen.length} 个地点`);
    toast.success(`已加入 ${chosen.length} 个地点`);
  };

  return (
    <div>
      <p className="mb-2 text-12 text-muted-foreground">{track ? `已有轨迹，${track.length} 个点` : '没有轨迹：地图上按地点顺序连线'}</p>
      <div className="flex flex-wrap gap-2">
        <input ref={file} type="file" accept=".gpx,application/gpx+xml,text/xml" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importGpx(f); e.target.value = ''; }} />
        <Button size="sm" onClick={() => file.current?.click()}><Upload size={13} />导入 GPX 轨迹</Button>
        {track && <Button size="sm" variant="ghost" onClick={() => { set({ track: undefined }); setMsg('已清除轨迹'); }}>清除轨迹</Button>}
        <Button size="sm" onClick={suggest}><Compass size={13} />按照片的拍摄地点建议</Button>
      </div>
      {msg && <p className="mt-2 text-12 text-muted-foreground">{msg}</p>}
      {sug && sug.stops.length > 0 && (
        <div className="mt-3 space-y-3 rounded-xl bg-popover p-3 shadow-soft">
          {sug.stops.map((s, i) => (
            <label key={i} className="block">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={!!picked[i]} onChange={(e) => setPicked({ ...picked, [i]: e.target.checked })} className="accent-foreground" />
                <span className="mono text-11 text-muted-foreground">{s.date ?? '无日期'} · {s.count} 张 · {s.lnglat[1].toFixed(2)}, {s.lnglat[0].toFixed(2)}</span>
              </span>
              <Input className="mt-1.5" placeholder="地名" value={names[i] ?? ''} onChange={(e) => setNames({ ...names, [i]: e.target.value })} />
            </label>
          ))}
          <div className="flex gap-2 pt-1"><Button size="sm" variant="default" onClick={addPins}>把选中的加入文末</Button><Button size="sm" variant="ghost" onClick={() => setSug(null)}>取消</Button></div>
        </div>
      )}
    </div>
  );
}
