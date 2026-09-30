/**
 * 游记的“排版”视图：按横向读法的样子把整篇排成一条，直接在上面摆。
 *   上下拖动 → 这一块在横滚时的上下位置（y）
 *   拖到左右 → 换顺序（跨过站点分界就换到那一站）
 *   右下角的圆点 → 大小（scale）
 * 文字在 Markdown 里写；这里只管版式：图组、双图、网格、自由排布、地图、竖排、站点的经纬度。
 * 尺寸比例照着主题的横向读法（styles/travel.css）：视口高 S，图高 0.66S，上下留白 8% / 13%。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Popover } from 'radix-ui';
import { ChevronLeft, ChevronRight, ImagePlus, Map as MapIcon, MapPin, Merge, Plus, Redo2, RotateCcw, Settings2, Split, Trash2, Undo2 } from 'lucide-react';
import { assetUrl } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Doc } from '@/lib/types';
import * as ops from '@/lib/travel-ops.js';
import { assetName, assetPath, AssetDialog } from '@/components/asset-picker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, useConfirm } from '@/components/ui/dialog';
import { Input, NumInput } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Tip } from '@/components/ui/tooltip';
import { TravelBlockBody } from './travel-blocks';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const SCALABLE = new Set(['single', 'pair', 'strip', 'grid', 'free', 'text']);
const NAMES: Record<string, string> = { text: '文字', single: '单图', pair: '双图', strip: '图组', grid: '网格', free: '自由排布', map: '地图' };
/** 舞台占可用高度的比例：小一点能一眼看到更多站 */
const ZOOMS: Record<string, number> = { s: 0.5, m: 0.72, l: 1 };
const ZOOM_KEY = 'mori-studio-layout-zoom';
const imgSrc =(src?: string) => (!src ? '' : /^(https?:|data:|\/)/.test(src) ? src : assetUrl(assetName(src), 900));

interface Drag { id: string; y?: number; dx?: number; slot?: number | null; line?: number; scale?: number }

export function TravelLayout({ doc, setDoc }: { doc: Doc; setDoc: (fn: (d: Doc) => Doc) => void }) {
  const confirm = useConfirm();
  const area = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(520);
  const [zoom, setZoomState] = useState<string>(() => { try { return localStorage.getItem(ZOOM_KEY) ?? 'm'; } catch { return 'm'; } });
  const setZoom = (z: string) => { setZoomState(z); try { localStorage.setItem(ZOOM_KEY, z); } catch { /* 无所谓 */ } };
  const S = Math.round(clamp(avail * (ZOOMS[zoom] ?? 0.7), 240, 760));
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [detail, setDetail] = useState(false);
  const [lib, setLib] = useState(false);
  const [openStop, setOpenStop] = useState<string | null>(null);
  const past = useRef<Doc[]>([]);
  const future = useRef<Doc[]>([]);
  const [, bump] = useState(0);

  // 舞台高度跟着可用空间走
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const stops: Doc[] = doc.stops ?? [];
  const blocks: Doc[] = doc.blocks ?? [];
  const seq = useMemo(() => ops.sequence({ stops, blocks }), [stops, blocks]);
  const selected = blocks.find((b) => b.id === sel) ?? null;
  const firstText = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of seq) if (x.kind === 'block' && x.block.type === 'text' && !m.has(x.block.stop)) m.set(x.block.stop, x.block.id);
    return m;
  }, [seq]);

  /** 改动：记进撤销栈（打字这类连续的小改动不记） */
  const commit = (next: Doc, history = true) => {
    if (history) { past.current.push(doc); if (past.current.length > 100) past.current.shift(); future.current = []; bump((n) => n + 1); }
    setDoc(() => next);
  };
  const undo = () => { const prev = past.current.pop(); if (!prev) return; future.current.push(doc); setDoc(() => prev); bump((n) => n + 1); };
  const redo = () => { const next = future.current.pop(); if (!next) return; past.current.push(doc); setDoc(() => next); bump((n) => n + 1); };
  const patchBlock = (id: string, p: Doc, history = true) => commit({ ...doc, blocks: blocks.map((b) => (b.id === id ? clean({ ...b, ...p }) : b)) }, history);
  const patchStop = (id: string, p: Doc) => commit({ ...doc, stops: stops.map((s) => (s.id === id ? clean({ ...s, ...p }) : s)) }, false);

  // 手卷：横滚方向右→左，第一站在最右边（主题里是 direction:rtl，块自己仍按 ltr 排）
  const rtl = doc.reading?.direction === 'rtl';
  const g: Geo = { S, padT: S * 0.08, padB: S * 0.13, inner: S * 0.79, ph: S * 0.66, gap: S * 0.085, fs: S * 0.0195, rtl };

  /* ── 拖动 ── */
  const slotAt = (clientX: number, id: string) => {
    const els = [...(track.current?.querySelectorAll<HTMLElement>('[data-seq]') ?? [])].filter((el) => el.dataset.id !== id);
    let slot = 0;
    for (const el of els) { const r = el.getBoundingClientRect(), mid = r.left + r.width / 2; if (rtl ? mid > clientX : mid < clientX) slot++; }
    slot = Math.max(1, slot);
    const t = track.current!.getBoundingClientRect();
    const prev = els[slot - 1]?.getBoundingClientRect(), next = els[slot]?.getBoundingClientRect();
    const edge = rtl
      ? (prev && next ? (prev.left + next.right) / 2 : prev ? prev.left - g.gap / 2 : next!.right + g.gap / 2)
      : (prev && next ? (prev.right + next.left) / 2 : prev ? prev.right + g.gap / 2 : next!.left - g.gap / 2);
    const line = edge - t.left;
    return { slot, line };
  };

  const startMove = (e: React.PointerEvent, b: Doc) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setSel(b.id);
    scroller.current?.focus({ preventScroll: true });
    const el = e.currentTarget as HTMLElement, h = el.getBoundingClientRect().height;
    const y0 = b.y ?? 0.5, room = g.inner - h, top0 = y0 * room;
    const sx = e.clientX, sy = e.clientY, sc0 = scroller.current!.scrollLeft;
    let moved = false, reorder = false, last: Drag = { id: b.id };
    let raf = 0, px = e.clientX;
    const edge = () => {
      const r = scroller.current!.getBoundingClientRect();
      const v = px < r.left + 60 ? -14 : px > r.right - 60 ? 14 : 0;
      if (v && reorder) { scroller.current!.scrollLeft += v; update(px, lastY); }
      raf = requestAnimationFrame(edge);
    };
    let lastY = e.clientY;
    const update = (cx: number, cy: number) => {
      const dx = cx - sx + (scroller.current!.scrollLeft - sc0), dy = cy - sy;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      if (Math.abs(dx) > 36) reorder = true;
      const y = room > 1 ? clamp((top0 + dy) / room, 0, 1) : y0;
      last = { id: b.id, y, ...(reorder ? { dx, ...slotAt(cx, b.id) } : {}) };
      setDrag(last);
    };
    const move = (ev: PointerEvent) => { px = ev.clientX; lastY = ev.clientY; update(ev.clientX, ev.clientY); };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); cancelAnimationFrame(raf);
      setDrag(null);
      if (!moved) return;
      let next: Doc = { ...doc, blocks: blocks.map((x) => (x.id === b.id ? { ...x, y: r2(last.y ?? y0) } : x)) };
      if (reorder && last.slot) next = ops.moveBlock(next, b.id, last.slot);
      commit(next);
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
    raf = requestAnimationFrame(edge);
  };

  const startScale = (e: React.PointerEvent, b: Doc) => {
    e.preventDefault(); e.stopPropagation();
    const el = (e.currentTarget as HTMLElement).parentElement!, h0 = el.getBoundingClientRect().height;
    const s0 = b.scale ?? 1, sy = e.clientY;
    let s = s0;
    const move = (ev: PointerEvent) => { s = r2(clamp((s0 * (h0 + ev.clientY - sy)) / h0, 0.3, 1.6)); setDrag({ id: b.id, scale: s }); };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); setDrag(null); if (s !== s0) patchBlock(b.id, { scale: Math.abs(s - 1) < 0.02 ? undefined : s }); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };

  /* ── 键盘：↑↓ 上下位置，←→ 换顺序，+ − 大小，⌘Z 撤销 ── */
  const onKey = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (!selected) return;
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); patchBlock(selected.id, { y: r2(clamp((selected.y ?? 0.5) + (e.key === 'ArrowUp' ? -step : step), 0, 1)) }); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); commit(ops.nudgeBlock(doc, selected.id, (e.key === 'ArrowLeft') === rtl ? 1 : -1)); }
    else if ((e.key === '=' || e.key === '+' || e.key === '-') && SCALABLE.has(selected.type)) { e.preventDefault(); patchBlock(selected.id, { scale: r2(clamp((selected.scale ?? 1) + (e.key === '-' ? -0.05 : 0.05), 0.3, 1.6)) }); }
    else if (e.key === 'Escape') setSel(null);
    else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); void remove(selected); }
  };

  // 选中的块跟着键盘挪到视野外时，把它滚回来
  useEffect(() => {
    if (!sel) return;
    track.current?.querySelector(`[data-id="${sel}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [sel, blocks]);

  const remove = async (b: Doc) => {
    const what = b.type === 'text' ? '这段文字' : NAMES[b.type] ?? '这一块';
    if (b.type !== 'map' && !(await confirm({ title: `删除${what}？`, description: b.type === 'text' ? '文字会从正文里删掉。可以用 ⌘Z 撤销。' : '图片文件还在图库里。可以用 ⌘Z 撤销。', confirmLabel: '删除', danger: true }))) return;
    commit(ops.removeBlock(doc, b.id));
    setSel(null);
  };
  const insert = (block: Doc) => {
    const stop = selected?.stop ?? stops.at(-1)?.id;
    if (!stop) return;
    const r = ops.insertAfter(doc, selected?.id ?? null, stop, block);
    commit(r.doc);
    setSel(r.id);
  };


  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 上面一条：没选中时是说明和插入，选中后是这一块的版式 */}
      <div className="mx-5 flex min-h-11 shrink-0 flex-wrap items-center gap-2 rounded-[22px] bg-sunk/70 px-2 py-1">
        {selected ? <BlockBar key={selected.id} b={selected} doc={doc} stops={stops} commit={commit} patch={(p) => patchBlock(selected.id, p)} onDetail={() => setDetail(true)} onRemove={() => void remove(selected)} />
          : <span />}
        <span className="ml-auto flex items-center gap-0.5">
          <Segmented size="sm" className="mr-1.5" value={zoom} onValueChange={setZoom} options={[{ value: 's', label: '小' }, { value: 'm', label: '中' }, { value: 'l', label: '大' }]} />
          <ToolBtn label="插入图片" onClick={() => setLib(true)}><ImagePlus size={15} /></ToolBtn>
          <ToolBtn label="插入地图" onClick={() => insert({ type: 'map', scope: 'route' })}><MapIcon size={15} /></ToolBtn>
          <span className="mx-1 h-4 w-px bg-rule-2" />
          <ToolBtn label="撤销　⌘Z" disabled={!past.current.length} onClick={undo}><Undo2 size={15} /></ToolBtn>
          <ToolBtn label="重做　⇧⌘Z" disabled={!future.current.length} onClick={redo}><Redo2 size={15} /></ToolBtn>
        </span>
      </div>

      <div ref={area} className="relative mx-5 mb-2 mt-2 min-h-0 flex-1">
        <div
          ref={scroller}
          tabIndex={0}
          onKeyDown={onKey}
          onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) scroller.current!.scrollLeft += rtl ? -e.deltaY : e.deltaY; }}
          onPointerDown={(e) => { if (e.target === e.currentTarget || e.target === track.current) setSel(null); }}
          className="absolute inset-0 flex items-center overflow-x-auto overflow-y-hidden rounded-2xl bg-sunk/70 outline-none [scrollbar-width:thin]"
          style={rtl ? { direction: 'rtl' } : undefined}
        >
          <div ref={track} className="relative flex w-max items-start" style={{ height: S, padding: `${g.padT}px ${S * 0.1}px ${g.padB}px`, columnGap: g.gap, direction: 'ltr', flexDirection: rtl ? 'row-reverse' : 'row' }}>
            {seq.map((x, i) => x.kind === 'stop' ? (
              <StopMarker key={`s-${x.stop.id}`} stop={x.stop} index={stops.indexOf(x.stop)} count={stops.length} g={g} open={openStop === x.stop.id} onOpen={(o) => setOpenStop(o ? x.stop.id : null)}
                patch={(p) => patchStop(x.stop.id, p)}
                onMove={(dir) => commit(ops.moveStop(doc, x.stop.id, dir))}
                onRemove={() => { commit(ops.removeStop(doc, x.stop.id)); setOpenStop(null); }} seq={i} empty={seq[i + 1]?.kind !== 'block'} />
            ) : (
              <BlockFrame key={x.block.id} b={x.block} g={g} seq={i} selected={sel === x.block.id} drag={drag?.id === x.block.id ? drag : null}
                onDown={(e) => startMove(e, x.block)} onScale={(e) => startScale(e, x.block)} onOpen={() => { setSel(x.block.id); if (x.block.type !== 'map') setDetail(true); }}>
                <Face b={x.block} g={g} scale={drag?.id === x.block.id && drag?.scale !== undefined ? drag.scale : x.block.scale ?? 1}
                  stop={stops.find((s) => s.id === x.block.stop)} stopIndex={stops.findIndex((s) => s.id === x.block.stop)} stops={stops}
                  head={x.block.type === 'text' && (x.block.head ?? firstText.get(x.block.stop) === x.block.id)}
                  active={sel === x.block.id && !drag} onPatch={(p) => patchBlock(x.block.id, p)} />
              </BlockFrame>
            ))}
            <button type="button" onClick={() => { const r = ops.addStop(doc); commit(r.doc); setOpenStop(r.id); }}
              className="flex h-7 flex-none items-center gap-1 self-start rounded-full px-3 text-[12px] text-ink-3 transition-colors hover:bg-ink/[.06] hover:text-ink" style={{ marginTop: -g.padT * 0.72 }}>
              <Plus size={13} />站点
            </button>
            {drag?.line !== undefined && <i className="pointer-events-none absolute w-0.5 rounded-full bg-ink" style={{ left: drag.line - 1, top: g.padT * 0.5, bottom: g.padB * 0.5 }} />}
          </div>
        </div>
      </div>

      <AssetDialog open={lib} onOpenChange={setLib} onPick={(n) => { setLib(false); insert({ type: 'single', src: assetPath(n), alt: '', layout: 'full' }); }} />
      <Dialog open={detail && !!selected} onOpenChange={setDetail}>
        {selected && (
          <DialogContent wide title={`${NAMES[selected.type] ?? '块'}的细节`}>
            <div><TravelBlockBody b={selected} doc={doc} ids={blocks.flatMap((b) => [b.id, ...(b.paras ?? []).map((p: Doc) => p.id)])} patch={(p) => patchBlock(selected.id, p, false)} noPlace /></div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

/** 清掉值为 undefined 的键，写进 JSON 时干净 */
function clean<T extends Doc>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

function ToolBtn({ label, children, onClick, disabled, active }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <Tip label={label}>
      <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
        className={cn('grid h-8 w-8 place-items-center rounded-full text-ink-2 transition-[background-color,color] hover:bg-lift hover:text-ink hover:shadow-soft disabled:pointer-events-none disabled:opacity-35', active && 'bg-lift text-ink shadow-soft')}>
        {children}
      </button>
    </Tip>
  );
}

/* ───────────── 选中块的工具条 ───────────── */

function BlockBar({ b, doc, stops, commit, patch, onDetail, onRemove }: { b: Doc; doc: Doc; stops: Doc[]; commit: (d: Doc) => void; patch: (p: Doc) => void; onDetail: () => void; onRemove: () => void }) {
  const stop = stops.find((s) => s.id === b.stop);
  const layouts = ops.layoutsFor(b);
  const moved = b.y !== undefined || b.scale !== undefined;
  return (
    <>
      <span className="flex items-center gap-2 pl-2 pr-1 text-[12.5px]">
        <b className="font-medium">{NAMES[b.type] ?? b.type}</b>
        <span className="text-ink-3">{stop?.name || '未命名的站'}</span>
      </span>
      <span className="h-4 w-px bg-rule-2" />
      {b.type === 'single' && <Segmented size="sm" value={b.layout === 'inset' ? 'inset' : 'full'} onValueChange={(v) => patch({ layout: v })} options={[{ value: 'full', label: '通栏' }, { value: 'inset', label: '内缩' }]} />}
      {layouts.length > 0 && (
        <Segmented size="sm" value={b.type} onValueChange={(t) => commit(ops.setLayout(doc, b.id, t))} options={layouts.map((t) => ({ value: t, label: NAMES[t] }))} />
      )}
      {b.type === 'text' && (<>
        <Segmented size="sm" value={b.writing === 'v' ? 'v' : 'h'} onValueChange={(v) => patch({ writing: v === 'v' ? 'v' : undefined })} options={[{ value: 'h', label: '横排' }, { value: 'v', label: '竖排' }]} />
        <Segmented size="sm" value={b.head === undefined ? 'auto' : b.head ? 'on' : 'off'} onValueChange={(v) => patch({ head: v === 'auto' ? undefined : v === 'on' })}
          options={[{ value: 'auto', label: '站名：自动' }, { value: 'on', label: '显示' }, { value: 'off', label: '不显示' }]} />
      </>)}
      {b.type === 'map' && <Segmented size="sm" value={b.scope === 'stop' ? 'stop' : 'route'} onValueChange={(v) => patch({ scope: v })} options={[{ value: 'route', label: '全程路线' }, { value: 'stop', label: '只看这一站' }]} />}
      {ops.canMergeNext(doc, b.id) &&<Button size="sm" variant="ghost" onClick={() => commit(ops.mergeWithNext(doc, b.id))}><Merge size={14} />和后一块合并</Button>}
      {ops.isImageBlock(b) && b.type !== 'single' && <Button size="sm" variant="ghost" onClick={() => commit(ops.split(doc, b.id))}><Split size={14} />拆成单图</Button>}
      <span className="mono px-1 text-[11px] text-ink-3">↕ {Math.round((b.y ?? 0.5) * 100)}%{b.type !== 'map' && ` · ${Math.round((b.scale ?? 1) * 100)}%`}</span>
      {moved && <ToolBtn label="位置和大小复位" onClick={() => patch({ y: undefined, scale: undefined })}><RotateCcw size={14} /></ToolBtn>}
      {b.type !== 'map' && <ToolBtn label="细节：图注、替代文字……" onClick={onDetail}><Settings2 size={15} /></ToolBtn>}
      <ToolBtn label="删除这一块" onClick={onRemove}><Trash2 size={14} /></ToolBtn>
    </>
  );
}

/* ───────────── 站点分界 ───────────── */

function StopMarker({ stop, index, count, g, open, onOpen, patch, onMove, onRemove, seq, empty }: {
  stop: Doc; index: number; count: number; g: Geo; empty: boolean; open: boolean; onOpen: (o: boolean) => void; patch: (p: Doc) => void; onMove: (dir: number) => void; onRemove: () => void; seq: number;
}) {
  const located = stop.lnglat && (stop.lnglat[0] !== 0 || stop.lnglat[1] !== 0);
  return (
    // 没有内容的站点：标签占住自己的宽度，免得被下一站的标签盖住
    <div data-seq={seq} className="relative flex-none self-stretch" style={{ width: empty ? undefined : 1, marginTop: -g.padT * 0.72, marginBottom: -g.padB * 0.6 }}>
      <i className={cn('absolute bottom-0 top-8 w-px bg-rule-2', g.rtl ? 'right-0' : 'left-0')} />
      {empty && <span className={cn('absolute top-10 whitespace-nowrap text-[11.5px] text-ink-3', g.rtl ? 'right-3' : 'left-3')}>这一站还没有内容</span>}
      <Popover.Root open={open} onOpenChange={onOpen}>
        <Popover.Trigger asChild>
          <button type="button" className={cn(empty ? 'relative' : 'absolute', g.rtl ? 'right-0' : 'left-0', 'top-0 flex h-7 items-center gap-2 whitespace-nowrap rounded-full px-3 text-[12.5px] transition-[background-color,box-shadow]', open ? 'bg-sunk-2' : 'bg-sunk hover:bg-sunk-2')}>
            <span className="mono text-[11px] text-ink-3">{String(index + 1).padStart(2, '0')}</span>
            <span className="font-medium">{stop.name || '未命名'}</span>
            {!located && <span className="flex items-center gap-0.5 text-[11.5px] text-ink-3"><MapPin size={11} />未定位</span>}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="bottom" align={g.rtl ? 'end' : 'start'} sideOffset={8} onOpenAutoFocus={(e) => e.preventDefault()}
            className="z-[80] w-[19rem] rounded-xl bg-lift p-4 shadow-pop outline-none data-[state=open]:animate-pop">
            <div className="space-y-2">
              <Input value={stop.name ?? ''} placeholder="站名" onChange={(e) => patch({ name: e.target.value })} />
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <Input value={stop.en ?? ''} placeholder="英文名" onChange={(e) => patch({ en: e.target.value || undefined })} />
                <Input value={stop.date ?? ''} placeholder="06.20" onChange={(e) => patch({ date: e.target.value || undefined })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11.5px] text-ink-3">经度<NumInput className="mt-1 text-ink" value={stop.lnglat?.[0]} onChange={(v) => patch({ lnglat: [v ?? 0, stop.lnglat?.[1] ?? 0] })} /></label>
                <label className="text-[11.5px] text-ink-3">纬度<NumInput className="mt-1 text-ink" value={stop.lnglat?.[1]} onChange={(v) => patch({ lnglat: [stop.lnglat?.[0] ?? 0, v ?? 0] })} /></label>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1">
              {(g.rtl ? [1, -1] : [-1, 1]).map((d) => (
                <ToolBtn key={d} label={d < 0 ? '整站往前挪' : '整站往后挪'} disabled={d < 0 ? index === 0 : index === count - 1} onClick={() => onMove(d)}>
                  {(d < 0) === !g.rtl ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
                </ToolBtn>
              ))}
              <span className="flex-1" />
              <Button size="sm" variant="danger" disabled={count < 2} onClick={onRemove}><Trash2 size={13} />删除这一站</Button>
            </div>
            {count >= 2 && <p className="mt-2 text-[11.5px] text-ink-3">删除后，这一站的内容并到{index === 0 ? '下' : '上'}一站。</p>}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

/* ───────────── 块 ───────────── */

type Geo = { S: number; padT: number; padB: number; inner: number; ph: number; gap: number; fs: number; rtl: boolean };

function BlockFrame({ b, g, seq, selected, drag, onDown, onScale, onOpen, children }: {
  b: Doc; g: Geo; seq: number; selected: boolean; drag: Drag | null; onDown: (e: React.PointerEvent) => void; onScale: (e: React.PointerEvent) => void; onOpen: () => void; children: ReactNode;
}) {
  const y = drag?.y ?? b.y ?? 0.5;
  const lifting = drag?.dx !== undefined;
  return (
    <div
      data-seq={seq}
      data-id={b.id}
      onPointerDown={onDown}
      onDoubleClick={onOpen}
      className={cn('group relative flex-none touch-none select-none rounded-[3px] outline-offset-[6px]', drag ? 'cursor-grabbing' : 'cursor-grab',
        selected ? 'outline outline-2 outline-ink' : 'hover:outline hover:outline-1 hover:outline-ink/25', lifting && 'z-10 opacity-90 shadow-pop')}
      style={{ top: `${y * 100}%`, transform: `translate(${drag?.dx ?? 0}px, ${-y * 100}%)`, transition: drag ? 'none' : 'top .25s var(--ease-out), transform .25s var(--ease-out)' }}
    >
      {children}
      {selected && SCALABLE.has(b.type) && !(b.type === 'text' && b.writing !== 'v') && (
        <span onPointerDown={onScale} aria-label="拖动改大小" className="absolute -bottom-[11px] -right-[11px] z-20 grid h-[22px] w-[22px] cursor-nwse-resize place-items-center rounded-full bg-lift shadow-pop">
          <i className="h-2 w-2 rounded-full bg-ink" />
        </span>
      )}
      {drag?.scale !== undefined && <span className="mono absolute -top-7 right-0 rounded-full bg-ink px-2 py-0.5 text-[11px] text-surface">{Math.round(drag.scale * 100)}%</span>}
    </div>
  );
}

function Img({ src, style, className }: { src?: string; style?: React.CSSProperties; className?: string }) {
  if (!src) return <span className={cn('grid place-items-center bg-sunk text-[11px] text-ink-3', className)} style={{ aspectRatio: '4 / 3', ...style }}>没有图</span>;
  return <img src={imgSrc(src)} alt="" draggable={false} loading="lazy" className={cn('block max-w-none bg-sunk object-cover', className)} style={style} />;
}

const caption = (list: Doc[]) => list.map((i) => i.caption).filter(Boolean).join(' / ');

/** 行内文字：粗、斜、代码、链接照样显示，旁注只留一个小记号 */
function Spans({ text }: { text: unknown }) {
  if (typeof text === 'string') return <>{text}</>;
  return <>{(text as Doc[] ?? []).map((s, i) => {
    const marks: string[] = (s.marks ?? []).map((m: Doc) => m.type);
    const note = marks.includes('note') || marks.includes('fn');
    return (
      <span key={i} className={cn(marks.includes('strong') && 'font-bold', marks.includes('em') && 'italic', marks.includes('code') && 'font-mono text-[.9em]', marks.includes('link') && 'underline decoration-ink/30 underline-offset-2')}>
        {s.t}{note && <sup className="mono text-[.6em] text-ink-3">*</sup>}
      </span>
    );
  })}</>;
}

/**
 * 选中的块里面还能再拖：
 *   图组 —— 上下拖一张图是错开（offset），拖它右下角的圆点是这一张的大小
 *   自由排布 —— 拖图换位置，拖右下角的圆点改宽度；拖到的那张叠到最上面
 * 拖的过程中只在本地画，松手才写回（一次松手算一步撤销）
 */
function useItemDrag<T extends Doc>(list: T[], onPatch: (next: T[]) => void) {
  const [live, setLive] = useState<T[] | null>(null);
  const start = (e: React.PointerEvent, calc: (dx: number, dy: number) => T[]) => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    let next: T[] | null = null;
    const move = (ev: PointerEvent) => { next = calc(ev.clientX - sx, ev.clientY - sy); setLive(next); };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); setLive(null); if (next) onPatch(next); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };
  return { items: live ?? list, start };
}

const Knob = ({ onDown }: { onDown: (e: React.PointerEvent) => void }) => (
  <span onPointerDown={onDown} className="absolute -bottom-[9px] -right-[9px] z-30 grid h-[18px] w-[18px] cursor-nwse-resize place-items-center rounded-full bg-lift shadow-pop"><i className="h-1.5 w-1.5 rounded-full bg-ink" /></span>
);

function StripFace({ b, H, fs, rtl, active, onPatch }: { b: Doc; H: number; fs: number; rtl: boolean; active: boolean; onPatch: (p: Doc) => void }) {
  const { items, start } = useItemDrag<Doc>(b.images, (images) => onPatch({ images }));
  const put = (i: number, p: Doc) => items.map((x, k) => (k === i ? { ...x, ...p } : x));
  return (
    <div className="flex items-start" style={{ gap: fs * 0.7, direction: rtl ? 'rtl' : 'ltr' }}>
      {items.map((im, i) => {
        const s = im.scale ?? 1, o = im.offset ?? 0;
        return (
          <span key={i} className={cn('relative block', active && 'cursor-ns-resize outline outline-1 outline-offset-2 outline-ink/20 hover:outline-ink/50')} style={{ marginTop: H * o }}
            onPointerDown={active ? (e) => start(e, (_dx, dy) => put(i, { offset: r2(clamp(o + dy / H, -0.5, 0.5)) })) : undefined}>
            <Img src={im.src} style={{ height: H * s, width: 'auto' }} />
            {active && <Knob onDown={(e) => { const h0 = H * s; start(e, (_dx, dy) => put(i, { scale: r2(clamp((s * (h0 + dy)) / h0, 0.3, 1.6)) })); }} />}
          </span>
        );
      })}
    </div>
  );
}

function FreeFace({ b, h, fs, active, onPatch }: { b: Doc; h: number; fs: number; active: boolean; onPatch: (p: Doc) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const { items, start } = useItemDrag<Doc>(b.items ?? [], (next) => onPatch({ items: next }));
  const W = h * (b.ar ?? 1.6);
  const top = Math.max(1, ...items.map((it) => it.z ?? 1));
  const drag = (e: React.PointerEvent, i: number, mode: 'move' | 'size') => {
    const it = items[i];
    const z = it.kind === 'image' && (it.z ?? 1) < top ? top + 1 : it.z;
    start(e, (dx, dy) => items.map((x, k) => (k !== i ? x : mode === 'move'
      ? { ...x, x: r2(clamp(it.x + dx / W, 0, 0.98)), y: r2(clamp(it.y + dy / h, 0, 0.98)), ...(x.kind === 'image' ? { z } : {}) }
      : { ...x, w: r2(clamp(it.w + dx / W, 0.08, 1)), z })));
  };
  return (
    <div ref={box} className={cn('relative', active && 'bg-ink/[.03]')} style={{ height: h, width: W }}>
      {items.map((it, i) => it.kind === 'image' ? (
        <span key={i} className={cn('absolute block', active && 'cursor-move outline outline-1 outline-offset-1 outline-ink/20 hover:outline-ink/50')}
          style={{ left: `${it.x * 100}%`, top: `${it.y * 100}%`, width: `${it.w * 100}%`, zIndex: it.z ?? 1 }}
          onPointerDown={active ? (e) => drag(e, i, 'move') : undefined}>
          <Img src={it.src} className="h-auto w-full" />
          {active && <Knob onDown={(e) => drag(e, i, 'size')} />}
        </span>
      ) : (
        <p key={i} className={cn('serif absolute text-ink-2', active && 'cursor-move outline outline-1 outline-dashed outline-offset-2 outline-ink/30')}
          style={{ left: `${it.x * 100}%`, top: `${it.y * 100}%`, writingMode: 'vertical-rl', fontSize: fs * 0.85, letterSpacing: '.26em', lineHeight: 1.9, zIndex: 999 }}
          onPointerDown={active ? (e) => drag(e, i, 'move') : undefined}><Spans text={it.text} /></p>
      ))}
    </div>
  );
}

const spansPlain = (t: unknown) => (typeof t === 'string' ? t : ((t as Doc[]) ?? []).map((s) => s.t).join(''));
const paraPlain = (p: Doc) => (p.type === 'list' ? (p.items as unknown[]).map(spansPlain).join('') : p.type === 'code' ? p.code ?? '' : spansPlain(p.text));

/** 文字块里的一段：段落、小标题、引用、列表、代码（版式和站点上的读法大致一样，不求逐像素） */
function Para({ p, v, first }: { p: Doc; v: boolean; first: boolean }) {
  const gap: React.CSSProperties | undefined = first ? undefined : v ? { marginBlockStart: '.9em' } : { marginTop: '.9em' };
  switch (p.type) {
    case 'h': return <h3 className="font-bold" style={{ ...gap, letterSpacing: '.08em', fontSize: '1.12em', ...(first ? undefined : v ? { marginBlockStart: '1.1em' } : { marginTop: '1.3em' }) }}><Spans text={p.text} /></h3>;
    case 'quote':
      return (
        <blockquote className="text-ink-2" style={{ ...gap, ...(v ? { paddingInlineEnd: '1em', borderRight: '1px solid var(--ink-3)' } : { paddingLeft: '1em', borderLeft: '1px solid var(--ink-3)' }) }}>
          <Spans text={p.text} />
          {p.cite && <cite className="block not-italic text-ink-3" style={{ fontSize: '.85em', ...(v ? { marginBlockStart: '.4em' } : { marginTop: '.3em' }) }}>{p.cite}</cite>}
        </blockquote>
      );
    case 'list':
      return (
        <ul style={gap}>
          {(p.items as unknown[]).map((it, k) => (
            <li key={k} className="flex" style={{ gap: '.5em' }}><span className="mono text-ink-3">{p.ordered ? k + 1 : '・'}</span><span><Spans text={it} /></span></li>
          ))}
        </ul>
      );
    case 'code':
      return <pre className="mono overflow-hidden whitespace-pre-wrap bg-ink/[.05] text-ink-2" style={{ ...gap, fontSize: '.8em', lineHeight: 1.7, padding: '.6em .8em', writingMode: 'horizontal-tb', letterSpacing: 0, ...(v ? { width: '16em' } : undefined) }}>{p.code}</pre>;
    default: return <p className="text-justify" style={gap}><Spans text={p.text} /></p>;
  }
}

function Face({ b, g, scale, stop, stopIndex, stops, head, active, onPatch }: { b: Doc; g: Geo; scale: number; stop?: Doc; stopIndex: number; stops: Doc[]; head: boolean; active: boolean; onPatch: (p: Doc) => void }) {
  const H = g.ph * scale, fs = g.fs;
  const cap = (text: string) => text && <p className="mt-2 truncate text-ink-3" style={{ fontSize: fs * 0.72, maxWidth: '100%' }}>{text}</p>;
  switch (b.type) {
    case 'text': {
      const v = b.writing === 'v';
      const no = `${String(stopIndex + 1).padStart(2, '0')}${stop?.date ? ` · ${stop.date}` : ''}`;
      return (
        <div className="serif text-ink" style={v ? { writingMode: 'vertical-rl', height: g.ph * 0.92 * scale, letterSpacing: '.12em', lineHeight: 2.05, fontSize: fs } : { width: fs * 23, fontSize: fs, lineHeight: 1.9 }}>
          {head && (
            <header style={v ? { marginBlockEnd: '1.2em' } : { marginBottom: fs * 0.8 }}>
              <span className="mono block text-ink-3" style={{ fontSize: fs * 0.66, marginBottom: v ? 0 : fs * 0.3 }}>{no}</span>
              <span style={{ fontSize: fs * (v ? 1.6 : 1.75), letterSpacing: v ? '.18em' : '.08em' }} className={v ? 'block' : ''}>{stop?.name || '未命名'}</span>
              {stop?.en && <span className="text-ink-3" style={{ fontSize: fs * 0.85, marginLeft: v ? 0 : fs * 0.6 }}>{stop.en}</span>}
            </header>
          )}
          {(b.paras ?? []).map((p: Doc, i: number) => <Para key={p.id ?? i} p={p} v={v} first={!i} />)}
          {!(b.paras ?? []).some((p: Doc) => paraPlain(p).trim()) && <p className="text-ink-3">（空的文字块，在 Markdown 里写）</p>}
        </div>
      );
    }
    case 'single':
      return <figure style={{ maxWidth: g.S * 2.2 }}><Img src={b.src} style={{ height: H, width: 'auto' }} />{cap(b.caption)}</figure>;
    case 'pair':
      return <figure><div className="flex" style={{ gap: fs * 0.8 }}>{b.images.map((im: Doc, i: number) => <Img key={i} src={im.src} style={{ height: H, width: 'auto' }} />)}</div>{cap(caption(b.images))}</figure>;
    case 'grid': {
      const cell = H / 2 - 5, n = b.images.length;
      return (
        <figure>
          <div className="grid" style={{ gridTemplateRows: `repeat(2, ${cell}px)`, gridAutoFlow: 'column', gridAutoColumns: `${(cell * 4) / 3}px`, gap: 10 }}>
            {b.images.map((im: Doc, i: number) => <Img key={i} src={im.src} className="h-full w-full" style={i === 0 ? { gridRow: 'span 2', gridColumn: 'span 2' } : i === n - 1 && n > 1 ? { gridRow: 'span 2' } : undefined} />)}
          </div>
          {cap(caption(b.images))}
        </figure>
      );
    }
    case 'strip':
      return <><StripFace b={b} H={H} fs={fs} rtl={g.rtl} active={active} onPatch={onPatch} />{cap(caption(b.images))}</>;
    case 'free':
      return <FreeFace b={b} h={g.ph * 1.04 * scale} fs={fs} active={active} onPatch={onPatch} />;
    case 'map':
      return <MiniMap stops={stops} here={b.scope === 'stop' ? b.stop : undefined} w={g.S * 0.78} h={g.S * 0.52} fs={fs} />;
  }
  return <div className="text-ink-3">不认识的块</div>;
}

/** 地图块的示意：站点连线。真正的地图在预览里看 */
function MiniMap({ stops, here, w, h, fs }: { stops: Doc[]; here?: string; w: number; h: number; fs: number }) {
  const pts = stops.filter((s) => s.lnglat && (s.lnglat[0] || s.lnglat[1]));
  const xs = pts.map((s) => s.lnglat[0]), ys = pts.map((s) => s.lnglat[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = 0.12, sx = (x1 - x0) || 1, sy = (y1 - y0) || 1, k = Math.min((w * (1 - 2 * pad)) / sx, (h * (1 - 2 * pad)) / sy);
  const P = (s: Doc) => [w / 2 + (s.lnglat[0] - (x0 + x1) / 2) * k, h / 2 - (s.lnglat[1] - (y0 + y1) / 2) * k];
  return (
    <div className="relative overflow-hidden rounded-[3px] bg-ink/[.05]" style={{ width: w, height: h }}>
      {pts.length > 0 ? (
        <svg width={w} height={h} className="absolute inset-0">
          <polyline points={pts.map((s) => P(s).join(',')).join(' ')} fill="none" stroke="var(--ink-3)" strokeWidth={1.2} strokeLinejoin="round" />
          {pts.map((s) => { const [x, y] = P(s); const on = s.id === here; return <circle key={s.id} cx={x} cy={y} r={on ? 5 : 3} fill={on ? 'var(--ink)' : 'var(--surface)'} stroke="var(--ink-2)" strokeWidth={1.2} />; })}
        </svg>
      ) : <span className="absolute inset-0 grid place-items-center text-ink-3" style={{ fontSize: fs * 0.8 }}>站点还没有经纬度</span>}
      <span className="mono absolute left-3 top-2 text-ink-3" style={{ fontSize: fs * 0.62 }}>地图 · {here ? '这一站' : '全程'}</span>
    </div>
  );
}
