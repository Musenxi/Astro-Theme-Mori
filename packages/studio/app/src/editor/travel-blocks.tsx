import { useRef, useState } from 'react';
import { ChevronDown, Compass, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api, assetUrl } from '@/lib/api';
import { cn } from '@/lib/cn';
import { assetName, assetPath, AssetDialog, ImageField } from '@/components/asset-picker';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/dialog';
import { Input, NumInput } from '@/components/ui/input';
import { onCard, Section } from '@/components/ui/page';
import { Select } from '@/components/ui/select';
import type { Doc } from '@/lib/types';
import { asSpans } from '@/lib/inline.js';
import { InlineField } from './inline-field';
import { PostBlockBody } from './post-blocks';
import { SortableItem, SortableList } from './sortable';

export const TRAVEL_BLOCKS: Array<{ type: string; label: string; prefix: string; make: () => Doc }> = [
  { type: 'text', label: '文字', prefix: 't', make: () => ({ type: 'text', writing: 'h', paras: [] }) },
  { type: 'single', label: '单图', prefix: 's', make: () => ({ type: 'single', alt: '', layout: 'full' }) },
  { type: 'pair', label: '双图', prefix: 'p', make: () => ({ type: 'pair', images: [{ alt: '' }, { alt: '' }] }) },
  { type: 'strip', label: '图组', prefix: 'st', make: () => ({ type: 'strip', images: [{ alt: '', scale: 1, offset: 0 }, { alt: '', scale: 1, offset: 0 }] }) },
  { type: 'grid', label: '网格', prefix: 'g', make: () => ({ type: 'grid', images: [{ alt: '' }, { alt: '' }] }) },
  { type: 'free', label: '自由排布', prefix: 'f', make: () => ({ type: 'free', ar: 1.6, items: [] }) },
  { type: 'map', label: '地图', prefix: 'm', make: () => ({ type: 'map', scope: 'route' }) },
];

/** 文字块里一段可以是的类型（和文章里的块一致；游记里小标题只有一级） */
const PARA_TYPES = [{ value: 'p', label: '段落' }, { value: 'h', label: '小标题' }, { value: 'quote', label: '引用' }, { value: 'list', label: '列表' }, { value: 'code', label: '代码' }];

/** 换一段的类型：文字尽量带过去，带不过去的（列表的分项、代码的换行）就拼成一段 */
function convertPara(p: Doc, to: string): Doc {
  const spans = p.text ?? (p.type === 'list' ? (p.items as unknown[]).flatMap((it, k) => [...(k ? [{ t: '　' }] : []), ...asSpans(it)]) : [{ t: p.code ?? '' }]);
  const plain = (spans as Array<{ t: string }>).map((s) => s.t).join('');
  switch (to) {
    case 'h': return { id: p.id, type: 'h', text: spans };
    case 'quote': return { id: p.id, type: 'quote', text: spans };
    case 'list': return { id: p.id, type: 'list', ordered: false, items: p.type === 'list' ? p.items : [spans] };
    case 'code': return { id: p.id, type: 'code', code: p.type === 'code' ? p.code : plain };
    default: return { id: p.id, text: spans };
  }
}

const Row = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="flex items-center gap-2 text-[12px] text-ink-3" title={hint}><span className="shrink-0">{label}</span><span className="min-w-0 flex-1">{children}</span></label>
);

/** 每个游记块都有：属于哪一站，以及横滚时的上下位置和缩放 */
function Place({ b, patch, doc }: { b: Doc; patch: (p: Doc) => void; doc: Doc }) {
  return (
    <div className="mb-3 grid grid-cols-[1.4fr_1fr_1fr] gap-2">
      <Row label="站点"><Select value={b.stop} onValueChange={(v) => patch({ stop: v })} options={(doc.stops ?? []).map((s: Doc) => ({ value: s.id, label: s.name || s.id }))} /></Row>
      <Row label="y" hint="横滚时的上下位置：0 顶 1 底"><NumInput value={b.y} onChange={(v) => patch({ y: v })} min={0} max={1} placeholder="0.5" /></Row>
      <Row label="缩放" hint="横滚时的缩放"><NumInput value={b.scale} onChange={(v) => patch({ scale: v })} min={0.1} placeholder="1" /></Row>
    </div>
  );
}

function Images({ b, patch, extra, removable }: { b: Doc; patch: (p: Doc) => void; extra?: (im: Doc, i: number) => React.ReactNode; removable?: boolean }) {
  const list: Doc[] = b.images;
  const put = (i: number, p: Doc) => patch({ images: list.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  return (
    <>
      {list.map((im, i) => (
        <div key={i} className="mb-2 space-y-2 rounded-xl bg-ink/[.035] p-3">
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

export function TravelBlockBody({ b, patch, doc, ids, noPlace }: { b: Doc; patch: (p: Doc) => void; doc: Doc; ids: string[]; noPlace?: boolean }) {
  const place = noPlace ? null : <Place b={b} patch={patch} doc={doc} />;
  switch (b.type) {
    case 'text':
      return (
        <>
          {place}
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Select value={b.writing ?? 'h'} onValueChange={(v) => patch({ writing: v })} options={[{ value: 'h', label: '横排' }, { value: 'v', label: '竖排' }]} />
            <Select value={b.head === undefined ? 'auto' : String(b.head)} onValueChange={(v) => patch({ head: v === 'auto' ? undefined : v === 'true' })}
              options={[{ value: 'auto', label: '站点标题：自动（这一站第一个文字块）' }, { value: 'true', label: '站点标题：显示' }, { value: 'false', label: '站点标题：不显示' }]} />
          </div>
          {(b.paras as Doc[]).map((p, i) => {
            const type = p.type ?? 'p';
            const set = (q: Doc) => patch({ paras: b.paras.map((x: Doc, k: number) => (k === i ? q : x)) });
            return (
              <div key={`${p.id}:${type}`} className="mb-2 flex items-start gap-2">
                <span className="mono w-16 shrink-0 pt-2 text-[10.5px] text-ink-3">{p.id}</span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Select className="w-28" value={type} onValueChange={(t) => set(convertPara(p, t))} options={PARA_TYPES} />
                  <PostBlockBody travel b={{ ...p, type }} patch={(q) => set({ ...p, ...q })} />
                </div>
                {b.paras.length > 1 && <Button variant="ghost" size="icon-sm" aria-label="删除这段" onClick={() => patch({ paras: b.paras.filter((_: unknown, k: number) => k !== i) })}><Trash2 size={14} /></Button>}
              </div>
            );
          })}
          <Button variant="link" className="mt-1" onClick={() => { let n = b.paras.length + 1; const used = new Set(ids); while (used.has(`${b.id}p${n}`)) n++; patch({ paras: [...b.paras, { id: `${b.id}p${n}`, text: '' }] }); }}><Plus size={14} />添加一段</Button>
        </>
      );
    case 'single':
      return (
        <>
          {place}
          <ImageField value={b.src} onChange={(v) => patch({ src: v })} optional={false} />
          <div className="mt-2 grid grid-cols-[1fr_9rem] gap-2">
            <Input placeholder="替代文字" value={b.alt ?? ''} onChange={(e) => patch({ alt: e.target.value })} />
            <Select value={b.layout ?? 'full'} onValueChange={(v) => patch({ layout: v })} options={[{ value: 'full', label: '通栏' }, { value: 'inset', label: '内缩' }]} />
          </div>
          <Input className="mt-2" placeholder="图注" value={b.caption ?? ''} onChange={(e) => patch({ caption: e.target.value || undefined })} />
        </>
      );
    case 'pair':
      return <>{place}<Images b={b} patch={patch} /></>;
    case 'grid':
      return <>{place}<Images b={b} patch={patch} removable /><Button variant="link" onClick={() => patch({ images: [...b.images, { alt: '' }] })}><Plus size={14} />添加一张</Button></>;
    case 'strip':
      return (
        <>
          {place}
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
      return <>{place}<Select value={b.scope ?? 'route'} onValueChange={(v) => patch({ scope: v })} options={[{ value: 'route', label: '全程路线' }, { value: 'stop', label: '只看这一站附近' }]} /></>;
    case 'free':
      return <>{place}<FreeCanvas b={b} patch={patch} /></>;
  }
  return <span className="text-ink-3">不认识的块类型 {String(b.type)}</span>;
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
      <div className="mb-2 flex items-center gap-3"><Row label="画布宽高比"><NumInput className="w-24" value={b.ar} min={0.2} onChange={(v) => v && patch({ ar: v })} /></Row><span className="text-[12px] text-ink-3">拖动图片调整位置；下面调宽度和叠放</span></div>
      <div ref={box} className="relative w-full touch-none overflow-hidden rounded-xl bg-ink/[.05] ring-1 ring-inset ring-ink/10" style={{ aspectRatio: b.ar }}>
        {items.map((it, i) => it.kind === 'image' ? (
          <img key={i} src={assetUrl(assetName(it.src), 400)} draggable={false} alt="" onPointerDown={(e) => startDrag(e, i)}
            className={cn('absolute cursor-move rounded-xs', sel === i ? 'outline outline-2 outline-accent' : 'outline outline-1 outline-ink/15')} style={{ left: `${it.x * 100}%`, top: `${it.y * 100}%`, width: `${it.w * 100}%`, zIndex: it.z ?? 1 }} />
        ) : (
          <div key={i} onPointerDown={(e) => startDrag(e, i)} className={cn('mono absolute z-[99] cursor-move rounded-xs bg-lift p-0.5 [writing-mode:vertical-rl]', sel === i ? 'outline outline-2 outline-accent' : 'outline outline-1 outline-dashed outline-ink-3')} style={{ left: `${it.x * 100}%`, top: `${it.y * 100}%` }}>文字</div>
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
            <InlineField key={sel} rows={2} value={s.text} onChange={(v) => put(sel!, { text: v })} placeholder="竖排的一小段文字" />
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

/* ───────────── 游记头部：站点、路线数据 ───────────── */

export function TravelHead({ doc, patch }: { doc: Doc; patch: (p: Doc) => void }) {
  return (
    <>
      <StopsEditor doc={doc} patch={patch} />
      <RouteData doc={doc} patch={patch} />
    </>
  );
}

function StopsEditor({ doc, patch }: { doc: Doc; patch: (p: Doc) => void }) {
  const confirm = useConfirm();
  const stops: Doc[] = doc.stops ?? [];
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const used = (sid: string) => (doc.blocks ?? []).filter((b: Doc) => b.stop === sid).length;
  const put = (i: number, p: Doc) => patch({ stops: stops.map((s, k) => (k === i ? { ...s, ...p } : s)) });
  const rename = (i: number, to: string) => {
    const from = stops[i].id;
    if (!to || to === from || stops.some((s) => s.id === to) || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(to)) return;
    // 改站点 id 时，引用它的块一起改
    patch({ stops: stops.map((s, k) => (k === i ? { ...s, id: to } : s)), blocks: (doc.blocks ?? []).map((b: Doc) => (b.stop === from ? { ...b, stop: to } : b)) });
  };
  const add = () => { let k = stops.length + 1; while (stops.some((s) => s.id === 's' + k)) k++; const id = 's' + k; patch({ stops: [...stops, { id, name: '', lnglat: [0, 0] }] }); setOpen({ ...open, [id]: true }); };
  const remove = async (i: number) => {
    const n = used(stops[i].id);
    if (n && !(await confirm({ title: `删除站点「${stops[i].name || stops[i].id}」？`, description: `有 ${n} 个块属于这一站，删了站点它们会报错。`, confirmLabel: '仍要删除', danger: true }))) return;
    patch({ stops: stops.filter((_, k) => k !== i) });
  };
  return (
    <Section title="站点" hint={`${stops.length} 个 · 顺序就是路线的先后`} className="mt-8">
      <SortableList items={stops} getId={(s) => s.id} onReorder={(next) => patch({ stops: next })}>
        <div className="space-y-1.5">
          {stops.map((s, i) => {
            const isOpen = open[s.id] || (s.lnglat[0] === 0 && s.lnglat[1] === 0);
            return (
              <SortableItem key={s.id} id={s.id} className={cn('rounded-xl bg-sunk/50', onCard)}>
                {(handle) => (
                  <div className="py-1.5 pl-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      {handle}
                      <span className="mono w-5 text-[11px] text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                      <Input className="w-40" value={s.name} placeholder="站名" onChange={(e) => put(i, { name: e.target.value })} />
                      <Input value={s.en ?? ''} placeholder="英文名" onChange={(e) => put(i, { en: e.target.value || undefined })} />
                      <Input className="w-24" value={s.date ?? ''} placeholder="06.20" onChange={(e) => put(i, { date: e.target.value || undefined })} />
                      <Button variant="ghost" size="icon-sm" aria-label={isOpen ? '收起' : '经纬度与 id'} onClick={() => setOpen({ ...open, [s.id]: !open[s.id] })}><ChevronDown size={14} className={cn('transition-transform', isOpen && 'rotate-180')} /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label="删除站点" onClick={() => remove(i)}><Trash2 size={14} /></Button>
                    </div>
                    {isOpen && (
                      <div className="mt-1.5 grid grid-cols-3 gap-1.5 pl-[3.4rem] pr-8">
                        <Row label="经度"><NumInput value={s.lnglat[0]} onChange={(v) => put(i, { lnglat: [v ?? 0, s.lnglat[1]] })} /></Row>
                        <Row label="纬度"><NumInput value={s.lnglat[1]} onChange={(v) => put(i, { lnglat: [s.lnglat[0], v ?? 0] })} /></Row>
                        <Row label="id"><Input className="mono" defaultValue={s.id} onBlur={(e) => rename(i, e.target.value.trim())} /></Row>
                      </div>
                    )}
                  </div>
                )}
              </SortableItem>
            );
          })}
        </div>
      </SortableList>
      <Button variant="link" className="mt-2" onClick={add}><Plus size={14} />添加站点</Button>
    </Section>
  );
}

export function RouteData({ doc, patch }: { doc: Doc; patch: (p: Doc) => void }) {
  const [msg, setMsg] = useState('');
  const [sug, setSug] = useState<Awaited<ReturnType<typeof api.exif>> | null>(null);
  const [names, setNames] = useState<Record<number, string>>({});
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const file = useRef<HTMLInputElement>(null);
  const track = doc.track as unknown[] | undefined;

  const importGpx = async (f: File) => {
    setMsg('读取中……');
    try { const j = await api.importGpx(f); patch({ track: j.track }); setMsg(`已导入：${j.points} 个点，简化成 ${j.simplified} 个`); } catch (e) { setMsg((e as Error).message); }
  };
  const suggest = async () => {
    setMsg('读取照片的拍摄地点……');
    try {
      const j = await api.exif();
      setSug(j); setPicked(Object.fromEntries(j.stops.map((_, i) => [i, true]))); setNames({});
      setMsg(j.stops.length ? `${j.photos} 张图里 ${j.withGps} 张带位置，建议 ${j.stops.length} 站` : `${j.photos} 张图里没有带位置的（GPS）`);
    } catch (e) { setMsg((e as Error).message); }
  };
  const addStops = () => {
    if (!sug) return;
    const chosen = sug.stops.map((s, i) => ({ s, i })).filter(({ i }) => picked[i]);
    const usedIds = new Set<string>((doc.stops ?? []).map((x: Doc) => x.id));
    let n = (doc.stops ?? []).length;
    const added = chosen.map(({ s, i }) => { do n++; while (usedIds.has('s' + n)); usedIds.add('s' + n); return { id: 's' + n, name: (names[i] ?? '').trim() || `未命名 ${n}`, lnglat: s.lnglat, ...(s.date ? { date: s.date } : {}) }; });
    patch({ stops: [...(doc.stops ?? []), ...added] });
    setSug(null); setMsg(`已加入 ${added.length} 个站点，记得给它们起名字`);
    toast.success(`已加入 ${added.length} 个站点`);
  };

  return (
    <div>
      <p className="mb-2 text-[12px] text-ink-3">{track ? `已有轨迹，${track.length} 个点` : '没有轨迹：地图上按站点顺序连线'}</p>
      <div className="flex flex-wrap gap-2">
        <input ref={file} type="file" accept=".gpx,application/gpx+xml,text/xml" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importGpx(f); e.target.value = ''; }} />
        <Button size="sm" onClick={() => file.current?.click()}><Upload size={13} />导入 GPX 轨迹</Button>
        {track && <Button size="sm" variant="ghost" onClick={() => { patch({ track: undefined }); setMsg('已清除轨迹'); }}>清除轨迹</Button>}
        <Button size="sm" onClick={suggest}><Compass size={13} />按照片的拍摄地点建议站点</Button>
      </div>
      {msg && <p className="mt-2 text-[12px] text-ink-3">{msg}</p>}
      {sug && sug.stops.length > 0 && (
        <div className="mt-3 space-y-3 rounded-xl bg-lift p-3 shadow-soft">
          {sug.stops.map((s, i) => (
            <label key={i} className="block">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={!!picked[i]} onChange={(e) => setPicked({ ...picked, [i]: e.target.checked })} className="accent-[var(--ink)]" />
                <span className="mono text-[11px] text-ink-3">{s.date ?? '无日期'} · {s.count} 张 · {s.lnglat[1].toFixed(2)}, {s.lnglat[0].toFixed(2)}</span>
              </span>
              <Input className="mt-1.5" placeholder="站名（可稍后再填）" value={names[i] ?? ''} onChange={(e) => setNames({ ...names, [i]: e.target.value })} />
            </label>
          ))}
          <div className="flex gap-2 pt-1"><Button size="sm" variant="primary" onClick={addStops}>把选中的加入站点</Button><Button size="sm" variant="ghost" onClick={() => setSug(null)}>取消</Button></div>
        </div>
      )}
    </div>
  );
}
