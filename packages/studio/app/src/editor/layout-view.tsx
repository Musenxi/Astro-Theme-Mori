/**
 * “排版”视图：按横向读法的样子把整篇排成一条，直接在上面摆。
 *   上下拖动 → 这一块在横滚时的上下位置（y）
 *   拖到左右 → 换顺序
 *   右下角的圆点 → 大小（scale）
 * 文字在 Markdown 里写；这里只管版式：图组、双图、网格、自由排布、地图、竖排。
 * 相邻的文字排成一列，二级标题另起一列；尺寸比例照着主题的横向读法（styles/travel.css）：视口高 S，图高 0.66S，上下留白 8% / 13%。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ImagePlus, Map as MapIcon, Merge, Redo2, RotateCcw, Settings2, Split, Trash2, Undo2 } from 'lucide-react';
import { placesOf } from 'astro-mori/flow';
import { assetUrl } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Doc } from '@/lib/types';
import * as ops from '@/lib/layout-ops.js';
import { assetName, assetPath, AssetDialog } from '@/components/asset-picker';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ModalContent } from '@/components/modal';
import { useConfirm } from '@/components/confirm';
import { Segmented } from '@/components/segmented';
import { Tip } from '@/components/tip';
import { LayoutBlockBody } from './layout-blocks';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const px = (n: number) => `${n}px`;
const SCALABLE = new Set(['image', 'pair', 'strip', 'grid', 'free', 'text']);
const NAMES: Record<string, string> = { text: '文字', image: '单图', pair: '双图', strip: '图组', grid: '网格', free: '自由排布', map: '地图' };
/** 舞台占可用高度的比例：小一点能一眼看到更多站 */
const ZOOMS: Record<string, number> = { s: 0.5, m: 0.72, l: 1 };
const ZOOM_KEY = 'mori-studio-layout-zoom';
const imgSrc =(src?: string) => (!src ? '' : /^(https?:|data:|\/)/.test(src) ? src : assetUrl(assetName(src), 900));

interface Drag { key: string; y?: number; dx?: number; slot?: number | null; line?: number; scale?: number }

export function LayoutView({ doc, setDoc }: { doc: Doc; setDoc: (fn: (d: Doc) => Doc) => void }) {
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

  const blocks: Doc[] = useMemo(() => doc.blocks ?? [], [doc.blocks]);
  const its: Doc[] = useMemo(() => ops.itemsOf(doc), [doc]);
  const places = useMemo(() => placesOf(blocks) as PlaceInfo[], [blocks]);
  // 每个二级标题是第几章（章节号）
  const chapters = useMemo(() => { const m = new Map<string, number>(); let n = 0; for (const b of blocks) if (b.type === 'h' && b.level !== 3) m.set(b.id, ++n); return m; }, [blocks]);
  const selected = its.find((x) => x.key === sel) ?? null;

  /** 改动：记进撤销栈（打字这类连续的小改动不记） */
  const commit = (next: Doc, history = true) => {
    if (history) { past.current.push(doc); if (past.current.length > 100) past.current.shift(); future.current = []; bump((n) => n + 1); }
    setDoc(() => next);
  };
  const undo = () => { const prev = past.current.pop(); if (!prev) return; future.current.push(doc); setDoc(() => prev); bump((n) => n + 1); };
  const redo = () => { const next = future.current.pop(); if (!next) return; past.current.push(doc); setDoc(() => next); bump((n) => n + 1); };
  /** 位置、缩放、竖排（一列文字写在每个块上） */
  const place = (key: string, p: Doc, history = true) => commit(ops.setPlace(doc, key, p), history);
  /** 一个块自己的字段（图片的版式、图注、图组里每张图……） */
  const patchBlock = (id: string, p: Doc, history = true) => commit(ops.patchBlock(doc, id, p), history);

  // 手卷：横滚方向右→左，第一块在最右边（主题里是 direction:rtl，块自己仍按 ltr 排）
  const rtl = doc.reading?.direction === 'rtl';
  const g: Geo = { S, padT: S * 0.08, padB: S * 0.13, inner: S * 0.79, ph: S * 0.66, gap: S * 0.085, fs: S * 0.0195, rtl };

  /* ── 拖动 ── */
  const slotAt = (clientX: number, key: string) => {
    const els = [...(track.current?.querySelectorAll<HTMLElement>('[data-seq]') ?? [])].filter((el) => el.dataset.key !== key);
    let slot = 0;
    for (const el of els) { const r = el.getBoundingClientRect(), mid = r.left + r.width / 2; if (rtl ? mid > clientX : mid < clientX) slot++; }
    const t = track.current!.getBoundingClientRect();
    const prev = els[slot - 1]?.getBoundingClientRect(), next = els[slot]?.getBoundingClientRect();
    const edge = !prev && !next ? t.left + t.width / 2
      : rtl
        ? (prev && next ? (prev.left + next.right) / 2 : prev ? prev.left - g.gap / 2 : next!.right + g.gap / 2)
        : (prev && next ? (prev.right + next.left) / 2 : prev ? prev.right + g.gap / 2 : next!.left - g.gap / 2);
    return { slot, line: edge - t.left };
  };

  const startMove = (e: React.PointerEvent, b: Doc) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setSel(b.key);
    scroller.current?.focus({ preventScroll: true });
    const el = e.currentTarget as HTMLElement, h = el.getBoundingClientRect().height;
    const y0 = b.y ?? 0.5, room = g.inner - h, top0 = y0 * room;
    const sx = e.clientX, sy = e.clientY, sc0 = scroller.current!.scrollLeft;
    let moved = false, reorder = false, last: Drag = { key: b.key };
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
      last = { key: b.key, y, ...(reorder ? { dx, ...slotAt(cx, b.key) } : {}) };
      setDrag(last);
    };
    const move = (ev: PointerEvent) => { px = ev.clientX; lastY = ev.clientY; update(ev.clientX, ev.clientY); };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); cancelAnimationFrame(raf);
      setDrag(null);
      if (!moved) return;
      let next = ops.setPlace(doc, b.key, { y: r2(last.y ?? y0) });
      if (reorder && last.slot !== undefined) next = ops.moveItem(next, b.key, last.slot);
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
    const move = (ev: PointerEvent) => { s = r2(clamp((s0 * (h0 + ev.clientY - sy)) / h0, 0.3, 1.6)); setDrag({ key: b.key, scale: s }); };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); setDrag(null); if (s !== s0) place(b.key, { scale: Math.abs(s - 1) < 0.02 ? undefined : s }); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };

  /* ── 键盘：↑↓ 上下位置，←→ 换顺序，+ − 大小，⌘Z 撤销 ── */
  const onKey = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (!selected) return;
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); place(selected.key, { y: r2(clamp((selected.y ?? 0.5) + (e.key === 'ArrowUp' ? -step : step), 0, 1)) }); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); commit(ops.nudgeItem(doc, selected.key, (e.key === 'ArrowLeft') === rtl ? 1 : -1)); }
    else if ((e.key === '=' || e.key === '+' || e.key === '-') && SCALABLE.has(selected.type)) { e.preventDefault(); place(selected.key, { scale: r2(clamp((selected.scale ?? 1) + (e.key === '-' ? -0.05 : 0.05), 0.3, 1.6)) }); }
    else if (e.key === 'Escape') setSel(null);
    else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); void remove(selected); }
  };

  // 选中的块跟着键盘挪到视野外时，把它滚回来
  useEffect(() => {
    if (!sel) return;
    track.current?.querySelector(`[data-key="${sel}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [sel, blocks]);

  const remove = async (b: Doc) => {
    const what = b.type === 'text' ? '这段文字' : NAMES[b.type] ?? '这一块';
    if (b.type !== 'map' && !(await confirm({ title: `删除${what}？`, description: b.type === 'text' ? '文字会从正文里删掉。可以用 ⌘Z 撤销。' : '图片文件还在图库里。可以用 ⌘Z 撤销。', confirmLabel: '删除', danger: true }))) return;
    commit(ops.removeItem(doc, b.key));
    setSel(null);
  };
  const insert = (block: Doc) => {
    const r = ops.insertAfter(doc, selected?.key ?? null, block);
    commit(r.doc);
    setSel(r.id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 上面一条：没选中时是插入和撤销，选中后是这一块的版式 */}
      <div className="mx-5 flex min-h-11 shrink-0 flex-wrap items-center gap-2 rounded-22 bg-muted/70 px-2 py-1">
        {selected ? <BlockBar key={selected.key} b={selected} doc={doc} commit={commit} place={(p) => place(selected.key, p)} patch={(p) => patchBlock(selected.key, p)} onDetail={() => setDetail(true)} onRemove={() => void remove(selected)} />
          : <span />}
        <span className="ml-auto flex items-center gap-0.5">
          <Segmented size="sm" className="mr-1.5" value={zoom} onValueChange={setZoom} options={[{ value: 's', label: '小' }, { value: 'm', label: '中' }, { value: 'l', label: '大' }]} />
          <ToolBtn label="插入图片" onClick={() => setLib(true)}><ImagePlus size={15} /></ToolBtn>
          <ToolBtn label="插入地图" onClick={() => insert({ type: 'map', scope: 'route' })}><MapIcon size={15} /></ToolBtn>
          <span className="mx-1 h-4 w-px bg-border-strong" />
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
          className={cn('absolute inset-0 flex items-center overflow-x-auto overflow-y-hidden rounded-2xl bg-muted/70 outline-none [scrollbar-width:thin]', rtl && '[direction:rtl]')}
        >
          <div ref={track} className={cn('relative flex h-(--h) w-max items-start gap-x-(--gap) px-(--px) pt-(--pt) pb-(--pb) [direction:ltr]', rtl ? 'flex-row-reverse' : 'flex-row')} style={{ '--h': px(S), '--pt': px(g.padT), '--pb': px(g.padB), '--px': px(S * 0.1), '--gap': px(g.gap) }}>
            {its.map((b, i) => (
              <BlockFrame key={b.key} b={b} g={g} seq={i} selected={sel === b.key} drag={drag?.key === b.key ? drag : null}
                onDown={(e) => startMove(e, b)} onScale={(e) => startScale(e, b)} onOpen={() => { setSel(b.key); if (b.type !== 'map' && b.type !== 'text') setDetail(true); }}>
                <Face b={b} g={g} scale={drag?.key === b.key && drag?.scale !== undefined ? drag.scale : b.scale ?? 1}
                  places={places} chapters={chapters} here={b.type === 'map' ? hereOf(blocks, b.key, places) : undefined}
                  active={sel === b.key && !drag} onPatch={(p) => patchBlock(b.key, p)} />
              </BlockFrame>
            ))}
            {drag?.line !== undefined && <i className="pointer-events-none absolute top-(--t) bottom-(--b) left-(--l) w-0.5 rounded-full bg-primary" style={{ '--l': px(drag.line - 1), '--t': px(g.padT * 0.5), '--b': px(g.padB * 0.5) }} />}
          </div>
        </div>
      </div>

      <AssetDialog open={lib} onOpenChange={setLib} onPick={(n) => { setLib(false); insert({ type: 'image', src: assetPath(n), alt: '', layout: 'wide' }); }} />
      <Dialog open={detail && !!selected && selected.type !== 'text'} onOpenChange={setDetail}>
        {selected && selected.type !== 'text' && (
          <ModalContent wide title={`${NAMES[selected.type] ?? '块'}的细节`}>
            <div><LayoutBlockBody b={blocks.find((x) => x.id === selected.key) ?? selected} patch={(p) => patchBlock(selected.key, p, false)} /></div>
          </ModalContent>
        )}
      </Dialog>
    </div>
  );
}

/** 地图块读到的地点：这个块（含）之前最后一个地点 */
function hereOf(blocks: Doc[], id: string, places: Array<{ n: number; block: string }>) {
  const at = blocks.findIndex((b) => b.id === id);
  const before = new Set(blocks.slice(0, at + 1).map((b) => b.id));
  return places.filter((p) => before.has(p.block)).at(-1)?.n;
}

function ToolBtn({ label, children, onClick, disabled, active }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <Tip label={label}>
      <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
        className={cn('grid h-8 w-8 place-items-center rounded-full text-soft-foreground transition-[background-color,color] hover:bg-popover hover:text-foreground hover:shadow-soft disabled:pointer-events-none disabled:opacity-35', active && 'bg-popover text-foreground shadow-soft')}>
        {children}
      </button>
    </Tip>
  );
}

/* ───────────── 选中块的工具条 ───────────── */

function BlockBar({ b, doc, commit, place, patch, onDetail, onRemove }: { b: Doc; doc: Doc; commit: (d: Doc) => void; place: (p: Doc) => void; patch: (p: Doc) => void; onDetail: () => void; onRemove: () => void }) {
  const layouts = ops.layoutsFor(b);
  const moved = b.y !== undefined || b.scale !== undefined;
  const text = b.type === 'text';
  return (
    <>
      <span className="flex items-center gap-2 pl-2 pr-1 text-12-5"><b className="font-medium">{NAMES[b.type] ?? b.type}</b></span>
      <span className="h-4 w-px bg-border-strong" />
      {b.type === 'image' && <Segmented size="sm" value={b.layout === 'inline' ? 'inline' : 'wide'} onValueChange={(v) => patch({ layout: v })} options={[{ value: 'wide', label: '通栏' }, { value: 'inline', label: '内缩' }]} />}
      {layouts.length > 0 && (
        <Segmented size="sm" value={b.type} onValueChange={(t) => commit(ops.setLayout(doc, b.key, t))} options={layouts.map((t) => ({ value: t, label: NAMES[t] }))} />
      )}
      {text && <Segmented size="sm" value={b.writing === 'v' ? 'v' : 'h'} onValueChange={(v) => place({ writing: v === 'v' ? 'v' : undefined })} options={[{ value: 'h', label: '横排' }, { value: 'v', label: '竖排' }]} />}
      {b.type === 'map' && <Segmented size="sm" value={b.scope === 'near' ? 'near' : 'route'} onValueChange={(v) => patch({ scope: v })} options={[{ value: 'route', label: '全程路线' }, { value: 'near', label: '只看这一处' }]} />}
      {ops.canMergeNext(doc, b.key) && <Button size="sm" variant="ghost" onClick={() => commit(ops.mergeWithNext(doc, b.key))}><Merge size={14} />和后一块合并</Button>}
      {ops.isImageBlock(b) && b.type !== 'image' && <Button size="sm" variant="ghost" onClick={() => commit(ops.split(doc, b.key))}><Split size={14} />拆成单图</Button>}
      <span className="mono px-1 text-11 text-muted-foreground">↕ {Math.round((b.y ?? 0.5) * 100)}%{b.type !== 'map' && ` · ${Math.round((b.scale ?? 1) * 100)}%`}</span>
      {moved && <ToolBtn label="位置和大小复位" onClick={() => place({ y: undefined, scale: undefined })}><RotateCcw size={14} /></ToolBtn>}
      {b.type !== 'map' && !text && <ToolBtn label="细节：图注、替代文字……" onClick={onDetail}><Settings2 size={15} /></ToolBtn>}
      <ToolBtn label="删除这一块" onClick={onRemove}><Trash2 size={14} /></ToolBtn>
    </>
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
      data-key={b.key}
      onPointerDown={onDown}
      onDoubleClick={onOpen}
      className={cn('group relative top-(--top) flex-none touch-none select-none rounded-3 outline-offset-6 [transform:translate(var(--dx),var(--ty))]', drag ? 'cursor-grabbing transition-none' : 'cursor-grab [transition:top_.25s_var(--ease-out),transform_.25s_var(--ease-out)]',
        selected ? 'outline outline-2 outline-foreground' : 'hover:outline hover:outline-1 hover:outline-foreground/25', lifting && 'z-10 opacity-90 shadow-pop')}
      style={{ '--top': `${y * 100}%`, '--dx': px(drag?.dx ?? 0), '--ty': `${-y * 100}%` }}
    >
      {children}
      {selected && SCALABLE.has(b.type) && !(b.type === 'text' && b.writing !== 'v') && (
        <span onPointerDown={onScale} aria-label="拖动改大小" className="absolute -bottom-2.75 -right-2.75 z-20 grid h-5.5 w-5.5 cursor-nwse-resize place-items-center rounded-full bg-popover shadow-pop">
          <i className="h-2 w-2 rounded-full bg-primary" />
        </span>
      )}
      {drag?.scale !== undefined && <span className="mono absolute -top-7 right-0 rounded-full bg-primary px-2 py-0.5 text-11 text-primary-foreground">{Math.round(drag.scale * 100)}%</span>}
    </div>
  );
}

function Img({ src, style, className }: { src?: string; style?: React.CSSProperties; className?: string }) {
  if (!src) return <span className={cn('grid aspect-[4/3] place-items-center bg-muted text-11 text-muted-foreground', className)} style={style}>没有图</span>;
  return <img src={imgSrc(src)} alt="" draggable={false} loading="lazy" className={cn('block max-w-none bg-muted object-cover', className)} style={style} />;
}

const caption = (list: Doc[]) => list.map((i) => i.caption).filter(Boolean).join(' / ');

/** 行内文字：粗、斜、代码、链接照样显示，旁注只留一个小记号，地点前面有个空心圆（和站点上一样） */
function Spans({ text, dots = true }: { text: unknown; dots?: boolean }) {
  if (typeof text === 'string') return <>{text}</>;
  return <>{(text as Doc[] ?? []).map((s, i) => {
    const marks: string[] = (s.marks ?? []).map((m: Doc) => m.type);
    const note = marks.includes('note') || marks.includes('fn');
    return (
      <span key={i} className={cn(marks.includes('strong') && 'font-bold', marks.includes('em') && 'italic', marks.includes('code') && 'font-mono text-smaller', marks.includes('link') && 'underline decoration-foreground/30 underline-offset-2')}>
        {dots && marks.includes('place') && <i className="mr-[.28em] inline-block size-[.42em] rounded-full border-[1.5px] border-primary align-[.06em]" />}{s.t}{note && <sup className="mono text-sup text-muted-foreground">*</sup>}
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
  <span onPointerDown={onDown} className="absolute -bottom-2.25 -right-2.25 z-30 grid h-4.5 w-4.5 cursor-nwse-resize place-items-center rounded-full bg-popover shadow-pop"><i className="h-1.5 w-1.5 rounded-full bg-primary" /></span>
);

function StripFace({ b, H, fs, rtl, active, onPatch }: { b: Doc; H: number; fs: number; rtl: boolean; active: boolean; onPatch: (p: Doc) => void }) {
  const { items, start } = useItemDrag<Doc>(b.images, (images) => onPatch({ images }));
  const put = (i: number, p: Doc) => items.map((x, k) => (k === i ? { ...x, ...p } : x));
  return (
    <div className={cn('flex items-start gap-(--gap)', rtl ? '[direction:rtl]' : '[direction:ltr]')} style={{ '--gap': px(fs * 0.7) }}>
      {items.map((im, i) => {
        const s = im.scale ?? 1, o = im.offset ?? 0;
        return (
          <span key={i} className={cn('relative mt-(--mt) block', active && 'cursor-ns-resize outline outline-1 outline-offset-2 outline-foreground/20 hover:outline-foreground/50')} style={{ '--mt': px(H * o) }}
            onPointerDown={active ? (e) => start(e, (_dx, dy) => put(i, { offset: r2(clamp(o + dy / H, -0.5, 0.5)) })) : undefined}>
            <Img src={im.src} className="h-(--h) w-auto" style={{ '--h': px(H * s) }} />
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
    <div ref={box} className={cn('relative h-(--h) w-(--w)', active && 'bg-foreground/[.03]')} style={{ '--h': px(h), '--w': px(W) }}>
      {items.map((it, i) => it.kind === 'image' ? (
        <span key={i} className={cn('absolute top-[calc(var(--y)*100%)] left-[calc(var(--x)*100%)] z-(--z) block w-[calc(var(--w)*100%)]', active && 'cursor-move outline outline-1 outline-offset-1 outline-foreground/20 hover:outline-foreground/50')}
          style={{ '--x': it.x, '--y': it.y, '--w': it.w, '--z': it.z ?? 1 }}
          onPointerDown={active ? (e) => drag(e, i, 'move') : undefined}>
          <Img src={it.src} className="h-auto w-full" />
          {active && <Knob onDown={(e) => drag(e, i, 'size')} />}
        </span>
      ) : (
        <p key={i} className={cn('serif absolute top-[calc(var(--y)*100%)] left-[calc(var(--x)*100%)] z-999 text-(length:--fs) leading-[1.9] tracking-[.26em] text-soft-foreground [writing-mode:vertical-rl]', active && 'cursor-move outline outline-1 outline-dashed outline-offset-2 outline-foreground/30')}
          style={{ '--x': it.x, '--y': it.y, '--fs': px(fs * 0.85) }}
          onPointerDown={active ? (e) => drag(e, i, 'move') : undefined}><Spans text={it.text} /></p>
      ))}
    </div>
  );
}

const spansPlain = (t: unknown) => (typeof t === 'string' ? t : ((t as Doc[]) ?? []).map((s) => s.t).join(''));
const blockPlain = (p: Doc) => (p.type === 'list' ? (p.items as unknown[]).map(spansPlain).join('') : p.type === 'code' ? p.code ?? '' : spansPlain(p.text));

/** 一列文字里的一块：段落、标题、引用、列表、代码（版式和站点上的读法大致一样，不求逐像素） */
function Para({ p, v, first, chapter, place, fs }: { p: Doc; v: boolean; first: boolean; chapter: number; place?: Doc; fs: number }) {
  // 段与段之间隔开一点；竖排时“块开始”的一侧在右边
  const gap = first ? '' : v ? '[margin-block-start:.9em]' : 'mt-[.9em]';
  switch (p.type) {
    case 'h': {
      if (p.level === 3) return <h3 className={cn('text-em-112 font-bold tracking-[.08em]', !first && (v ? '[margin-block-start:1.1em]' : 'mt-[1.3em]'))}><Spans text={p.text} dots={false} /></h3>;
      const no = `${String(chapter).padStart(2, '0')}${place?.date ? ` · ${place.date}` : ''}`;
      return (
        <header className={cn(v ? '[margin-block-end:1.2em]' : 'mb-(--mb)', !first && (v ? '[margin-block-start:1.2em]' : 'mt-[1.4em]'))} style={{ '--mb': px(fs * 0.8) }}>
          <span className={cn('mono block text-(length:--fs) text-muted-foreground', v ? 'mb-0' : 'mb-(--mb)')} style={{ '--fs': px(fs * 0.66), '--mb': px(fs * 0.3) }}>{no}</span>
          <span className={cn('text-(length:--fs)', v ? 'block tracking-[.18em]' : 'tracking-[.08em]')} style={{ '--fs': px(fs * (v ? 1.6 : 1.75)) }}><Spans text={p.text} dots={false} /></span>
          {place?.en && <span className={cn('text-(length:--fs) text-muted-foreground', v ? 'ml-0' : 'ml-(--ml)')} style={{ '--fs': px(fs * 0.85), '--ml': px(fs * 0.6) }}>{place.en}</span>}
        </header>
      );
    }
    case 'quote':
      return (
        <blockquote className={cn('text-soft-foreground', gap, v ? 'border-r border-r-muted-foreground [padding-inline-end:1em]' : 'border-l border-l-muted-foreground pl-[1em]')}>
          <Spans text={p.text} />
          {p.cite && <cite className={cn('block text-em-85 not-italic text-muted-foreground', v ? '[margin-block-start:.4em]' : 'mt-[.3em]')}>{p.cite}</cite>}
        </blockquote>
      );
    case 'list':
      return (
        <ul className={gap}>
          {(p.items as unknown[]).map((it, k) => (
            <li key={k} className="flex gap-[.5em]"><span className="mono text-muted-foreground">{p.ordered ? k + 1 : '・'}</span><span><Spans text={it} /></span></li>
          ))}
        </ul>
      );
    case 'code':
      return <pre className={cn('mono overflow-hidden px-[.8em] py-[.6em] text-em-80 leading-1-7 tracking-[0] whitespace-pre-wrap bg-foreground/[.05] text-soft-foreground [writing-mode:horizontal-tb]', !first && 'mt-[.9em]', v && 'w-[16em]')}>{p.code}</pre>;
    default: return <p className={cn('text-justify', gap)}><Spans text={p.text} /></p>;
  }
}

type PlaceInfo = { n: number; block: string; label: string; lnglat: [number, number]; en?: string; date?: string };

function Face({ b, g, scale, places, chapters, here, active, onPatch }: { b: Doc; g: Geo; scale: number; places: PlaceInfo[]; chapters: Map<string, number>; here?: number; active: boolean; onPatch: (p: Doc) => void }) {
  const H = g.ph * scale, fs = g.fs;
  const cap = (text: string) => text && <p className="mt-2 max-w-full truncate text-(length:--fs) text-muted-foreground" style={{ '--fs': px(fs * 0.72) }}>{text}</p>;
  switch (b.type) {
    case 'text': {
      const v = b.writing === 'v';
      const blocks: Doc[] = b.blocks ?? [];
      return (
        <div className={cn('serif text-(length:--fs) text-foreground', v ? 'h-(--h) leading-[2.05] tracking-[.12em] [writing-mode:vertical-rl]' : 'w-(--w) leading-[1.9]')} style={{ '--fs': px(fs), '--h': px(g.ph * 0.92 * scale), '--w': px(fs * 23) }}>
          {blocks.map((p, i) => <Para key={p.id} p={p} v={v} first={!i} chapter={chapters.get(p.id) ?? 0} place={places.find((x) => x.block === p.id)} fs={fs} />)}
          {!blocks.some((p) => blockPlain(p).trim()) && <p className="text-muted-foreground">（空的文字，在 Markdown 里写）</p>}
        </div>
      );
    }
    case 'image':
      return <figure className="max-w-(--mw)" style={{ '--mw': px(g.S * 2.2), '--h': px(H) }}><Img src={b.src} className="h-(--h) w-auto" />{cap(b.caption)}</figure>;
    case 'pair':
      return <figure><div className="flex gap-(--gap)" style={{ '--gap': px(fs * 0.8), '--h': px(H) }}>{b.images.map((im: Doc, i: number) => <Img key={i} src={im.src} className="h-(--h) w-auto" />)}</div>{cap(caption(b.images))}</figure>;
    case 'grid': {
      const cell = H / 2 - 5, n = b.images.length;
      return (
        <figure>
          <div className="grid auto-cols-(--col) grid-flow-col grid-rows-[repeat(2,var(--cell))] gap-2.5" style={{ '--cell': px(cell), '--col': px((cell * 4) / 3) }}>
            {b.images.map((im: Doc, i: number) => <Img key={i} src={im.src} className={cn('h-full w-full', i === 0 ? 'row-[span_2] col-[span_2]' : i === n - 1 && n > 1 && 'row-[span_2]')} />)}
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
      return <MiniMap places={places} here={b.scope === 'near' ? here : undefined} w={g.S * 0.78} h={g.S * 0.52} fs={fs} />;
  }
  return <div className="text-muted-foreground">不认识的块</div>;
}

/** 地图块的示意：地点连线。真正的地图在预览里看 */
function MiniMap({ places, here, w, h, fs }: { places: PlaceInfo[]; here?: number; w: number; h: number; fs: number }) {
  const xs = places.map((s) => s.lnglat[0]), ys = places.map((s) => s.lnglat[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = 0.12, sx = (x1 - x0) || 1, sy = (y1 - y0) || 1, k = Math.min((w * (1 - 2 * pad)) / sx, (h * (1 - 2 * pad)) / sy);
  const P = (s: PlaceInfo) => [w / 2 + (s.lnglat[0] - (x0 + x1) / 2) * k, h / 2 - (s.lnglat[1] - (y0 + y1) / 2) * k];
  return (
    <div className="relative h-(--h) w-(--w) overflow-hidden rounded-3 bg-foreground/[.05]" style={{ '--w': px(w), '--h': px(h) }}>
      {places.length > 0 ? (
        <svg width={w} height={h} className="absolute inset-0">
          <polyline points={places.map((s) => P(s).join(',')).join(' ')} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.2} strokeLinejoin="round" />
          {places.map((s) => { const [x, y] = P(s); const on = s.n === here; return <circle key={s.n} cx={x} cy={y} r={on ? 5 : 3} fill={on ? 'var(--foreground)' : 'var(--card)'} stroke="var(--soft-foreground)" strokeWidth={1.2} />; })}
        </svg>
      ) : <span className="absolute inset-0 grid place-items-center text-(length:--fs) text-muted-foreground" style={{ '--fs': px(fs * 0.8) }}>还没有地点</span>}
      <span className="mono absolute left-3 top-2 text-(length:--fs) text-muted-foreground" style={{ '--fs': px(fs * 0.62) }}>地图 · {here !== undefined ? '这一处' : '全程'}</span>
    </div>
  );
}
