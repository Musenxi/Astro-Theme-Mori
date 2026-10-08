/**
 * 横向读法的版面：按横向读法的样子把整篇排成一条横卷，直接在上面摆。
 *   上下拖动 → 这一块在横滚时的上下位置（y），靠近顶、中、底和“跟着正文”时会吸住，画一条参考线（按住 ⌥ 不吸）
 *   拖到左右 → 换顺序
 *   右下角的圆点 → 大小（scale）
 * 标题和后面那列文字挨着排：竖排（或右→左的手卷）标题在右，横排在左；标题没设上下位置就和文字顶端对齐。
 * 尺寸比例照着主题的横向读法（styles/travel.css）：视口高 S，图高 0.66S，上下留白 8% / 13%。
 * 这个文件里还有两种读法共用的块的画法（图、图组、自由排布、地图、文字框）。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { assetUrl } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Doc } from '@/lib/types';
import * as ops from '@/lib/layout-ops.js';
import { assetName } from '@/components/asset-picker';
import { Tip } from '@/components/tip';
import { useLayout, type PlaceInfo } from './layout-ctx';
import { Deco, Unit, useEditHost } from './layout-text';

export type { PlaceInfo };
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const r2 = (v: number) => Math.round(v * 100) / 100;
export const px = (n: number) => `${n}px`;
export const NAMES: Record<string, string> = { head: '标题', text: '文字', image: '单图', pair: '双图', strip: '图组', grid: '网格', free: '自由排布', map: '地图' };
/** 舞台占可用高度的比例：小一点能一眼看到更多 */
export const ZOOMS: Record<string, number> = { s: 0.5, m: 0.72, l: 1 };
export const ZOOM_KEY = 'mori-studio-layout-zoom';
const imgSrc = (src?: string) => (!src ? '' : /^(https?:|data:|\/)/.test(src) ? src : assetUrl(assetName(src), 900));
/** 能拖大小的块：图都能；文字只有竖排的（大小就是竖排的高度）；标题的框按字的长短 */
/** 没设上下位置时在哪：标题在顶上，别的居中 */
export const yOf = (b: Doc) => (b.type === 'head' ? 0 : 0.5);
export const scalable = (b: Doc) => ['image', 'pair', 'strip', 'grid', 'free'].includes(b.type) || (b.type === 'text' && b.writing === 'v');

/** 排版里一项一项往下排时的分组：标题和紧跟着的那列文字是一组 */
export type Row = { head: Doc; text: Doc; at: number } | { item: Doc; at: number };
export function rowsOf(its: Doc[]): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < its.length; i++) {
    const a = its[i], b = its[i + 1];
    if (a.type === 'head' && a.lead && b?.type === 'text') { out.push({ head: a, text: b, at: i }); i++; } else out.push({ item: a, at: i });
  }
  return out;
}

interface Drag { key: string; y?: number; follow?: boolean; guide?: number; dx?: number; slot?: number | null; line?: number; scale?: number }

export function HorizontalLayout() {
  const L = useLayout();
  const { doc, its, places, blocks, rtl, sel, selected, editing, commit } = L;
  const area = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(520);
  const S = Math.round(clamp(avail * (ZOOMS[L.zoom] ?? 0.7), 240, 760));
  const [drag, setDrag] = useState<Drag | null>(null);
  const rows = useMemo(() => rowsOf(its), [its]);

  // 舞台高度跟着可用空间走
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const place = (key: string, p: Doc) => commit(ops.setPlace(doc, key, p));
  const g: Geo = { S, padT: S * 0.08, padB: S * 0.13, inner: S * 0.79, ph: S * 0.66, gap: S * 0.085, fs: S * 0.0195, rtl };

  /* ── 拖动 ── */
  /** 拖到哪个空位：按屏幕上的左右顺序数（标题组里可能是反着排的），再换成文章里的顺序 */
  const slotAt = (clientX: number, key: string) => {
    const els = [...(track.current?.querySelectorAll<HTMLElement>('[data-seq]') ?? [])].filter((el) => el.dataset.key !== key);
    const logical = els.map((el) => el.dataset.key);
    const vis = els.map((el) => ({ el, r: el.getBoundingClientRect() })).sort((a, b) => (rtl ? b.r.left - a.r.left : a.r.left - b.r.left));
    let v = 0;
    for (const { r } of vis) { const mid = r.left + r.width / 2; if (rtl ? mid > clientX : mid < clientX) v++; }
    const t = track.current!.getBoundingClientRect();
    const prev = vis[v - 1]?.r, next = vis[v]?.r;
    const edge = !prev && !next ? t.left + t.width / 2
      : rtl
        ? (prev && next ? (prev.left + next.right) / 2 : prev ? prev.left - g.gap / 2 : next!.right + g.gap / 2)
        : (prev && next ? (prev.right + next.left) / 2 : prev ? prev.right + g.gap / 2 : next!.left - g.gap / 2);
    const slot = v < vis.length ? logical.indexOf(vis[v].el.dataset.key) : logical.length;
    return { slot, line: edge - t.left };
  };

  const startMove = (e: React.PointerEvent, b: Doc) => {
    if (e.button !== 0) return;
    if (editing) { if (ops.isTextItem(b)) return; L.stopEdit(); } // 改字时点文字框是放光标
    e.preventDefault();
    L.select(b.key);
    scroller.current?.focus({ preventScroll: true });
    const el = e.currentTarget as HTMLElement;
    // 跟着文字的标题组：拖文字是整组一起上下挪
    const group = el.closest<HTMLElement>('[data-group]');
    const box = b.type === 'text' && group && !group.dataset.own ? group : el;
    const top = track.current!.getBoundingClientRect().top + g.padT;
    const r0 = box.getBoundingClientRect(), h = r0.height, room = g.inner - h;
    const top0 = r0.top - top;
    const y0 = room > 1 ? clamp(top0 / room, 0, 1) : b.y ?? yOf(b);
    // 标题吸到文字的顶端：就是“跟着正文”
    const textEl = b.type === 'head' && group ? group.querySelector<HTMLElement>(`[data-seq]:not([data-key="${CSS.escape(b.key)}"])`) : null;
    const textTop = textEl ? textEl.getBoundingClientRect().top - top : null;
    const sx = e.clientX, sy = e.clientY, sc0 = scroller.current!.scrollLeft;
    let moved = false, reorder = false, last: Drag = { key: b.key };
    let raf = 0, pxX = e.clientX, lastY = e.clientY, alt = false;
    const update = (cx: number, cy: number) => {
      const dx = cx - sx + (scroller.current!.scrollLeft - sc0), dy = cy - sy;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      if (Math.abs(dx) > 36) reorder = true;
      let t = top0 + dy, follow = false, guide: number | undefined;
      if (!alt && room > 1) {
        // 吸附：顶、中、底，标题还有“和文字顶端对齐”
        const snaps: Array<[number, number, boolean]> = [[0, 0, false], [room / 2, room / 2 + h / 2, false], [room, room + h, false]];
        if (textTop !== null) snaps.unshift([textTop, textTop, true]);
        for (const [at, line, f] of snaps) if (Math.abs(t - at) < 7) { t = at; guide = line; follow = f; break; }
      }
      const y = room > 1 ? clamp(t / room, 0, 1) : y0;
      last = { key: b.key, y, follow, guide, ...(reorder ? { dx, ...slotAt(cx, b.key) } : {}) };
      setDrag(last);
    };
    const edge = () => {
      const r = scroller.current!.getBoundingClientRect();
      const v = pxX < r.left + 60 ? -14 : pxX > r.right - 60 ? 14 : 0;
      if (v && reorder) { scroller.current!.scrollLeft += v; update(pxX, lastY); }
      raf = requestAnimationFrame(edge);
    };
    const move = (ev: PointerEvent) => { pxX = ev.clientX; lastY = ev.clientY; alt = ev.altKey; update(ev.clientX, ev.clientY); };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); cancelAnimationFrame(raf);
      setDrag(null);
      if (!moved) return;
      let next = ops.setPlace(doc, b.key, { y: last.follow ? undefined : r2(last.y ?? y0) });
      if (reorder && last.slot !== undefined && last.slot !== null) next = ops.moveItem(next, b.key, last.slot);
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

  /* ── 键盘：↑↓ 上下位置，←→ 换顺序，+ − 大小，回车改字，⌘Z 撤销 ── */
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).isContentEditable) return; // 在改字：方向键、删除键是给文字的
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) L.hist.redo(); else L.hist.undo(); return; }
    if (!selected) return;
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); place(selected.key, { y: r2(clamp((selected.y ?? yOf(selected)) + (e.key === 'ArrowUp' ? -step : step), 0, 1)) }); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); commit(ops.nudgeItem(doc, selected.key, (e.key === 'ArrowLeft') === rtl ? 1 : -1)); }
    else if ((e.key === '=' || e.key === '+' || e.key === '-') && scalable(selected)) { e.preventDefault(); place(selected.key, { scale: r2(clamp((selected.scale ?? 1) + (e.key === '-' ? -0.05 : 0.05), 0.3, 1.6)) }); }
    else if (e.key === 'Enter' && ops.isTextItem(selected)) { e.preventDefault(); L.startEdit(selected.key); }
    else if (e.key === 'Escape') L.select(null);
    else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); void L.remove(selected); }
  };

  // 选中的块跟着键盘挪到视野外时，把它滚回来
  useEffect(() => {
    if (!sel || editing) return;
    track.current?.querySelector(`[data-key="${CSS.escape(sel)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [sel, blocks, editing]);

  const frame = (b: Doc, i: number, fixed = false, grouped = false) => (
    <BlockFrame key={b.key} b={b} g={g} seq={i} fixed={fixed} grouped={grouped} selected={sel === b.key} editing={editing} drag={drag?.key === b.key ? drag : null}
      onDown={(e) => startMove(e, b)} onScale={(e) => startScale(e, b)} onOpen={(e) => { if (ops.isTextItem(b)) L.startEdit(b.key, { x: e.clientX, y: e.clientY }); }}>
      <Face b={b} g={g} scale={drag?.key === b.key && drag?.scale !== undefined ? drag.scale : b.scale ?? 1}
        places={places} here={b.type === 'map' ? hereOf(blocks, b.key, places) : undefined}
        active={sel === b.key && !drag && !editing} editing={editing} onPatch={(p) => commit(ops.patchBlock(doc, b.key, p))} />
    </BlockFrame>
  );

  return (
    <div ref={area} className="absolute inset-0">
      <div
        ref={scroller}
        tabIndex={0}
        onKeyDown={onKey}
        onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) scroller.current!.scrollLeft += rtl ? -e.deltaY : e.deltaY; }}
        onPointerDown={(e) => { if (e.target === e.currentTarget || e.target === track.current) { L.stopEdit(); L.select(null); } }}
        className={cn('absolute inset-0 flex items-center overflow-x-auto overflow-y-hidden rounded-2xl bg-muted/70 outline-none [scrollbar-width:thin]', rtl && '[direction:rtl]')}
      >
        <div ref={track} className={cn('relative flex h-(--h) w-max items-start gap-x-(--gap) px-(--px) pt-(--pt) pb-(--pb) [direction:ltr]', rtl ? 'flex-row-reverse' : 'flex-row')} style={{ '--h': px(S), '--pt': px(g.padT), '--pb': px(g.padB), '--px': px(S * 0.1), '--gap': px(g.gap) }}>
          {rows.map((r) => {
            if ('item' in r) return frame(r.item, r.at);
            const { head, text } = r;
            const live = (b: Doc) => (drag && drag.key === b.key && drag.y !== undefined ? (drag.follow ? undefined : drag.y) : b.y);
            const own = live(head) !== undefined;
            const ty = live(text) ?? 0.5;
            const moving = drag?.key === head.key || drag?.key === text.key;
            return (
              <div key={head.key} data-group data-own={own ? '' : undefined}
                className={cn('relative flex flex-none items-start', (rtl || text.writing === 'v') && 'flex-row-reverse', head.writing !== 'v' && 'gap-x-(--hg)',
                  own ? 'self-stretch' : 'top-(--top) [transform:translateY(var(--ty))]', moving ? 'transition-none' : '[transition:top_.25s_var(--ease-out),transform_.25s_var(--ease-out)]')}
                style={{ '--top': `${ty * 100}%`, '--ty': `${-ty * 100}%`, '--hg': px(g.fs * 2.4) }}>
                {frame(head, r.at, !own, true)}{frame(text, r.at + 1, !own, true)}
              </div>
            );
          })}
          {drag?.line !== undefined && <i className="pointer-events-none absolute top-(--t) bottom-(--b) left-(--l) w-0.5 rounded-full bg-primary" style={{ '--l': px(drag.line - 1), '--t': px(g.padT * 0.5), '--b': px(g.padB * 0.5) }} />}
          {drag?.guide !== undefined && drag.dx === undefined && <i className="pointer-events-none absolute inset-x-0 top-(--t) h-px bg-brand/60" style={{ '--t': px(g.padT + drag.guide) }} />}
        </div>
      </div>
    </div>
  );
}

/** 地图块读到的地点：这个块（含）之前最后一个地点 */
export function hereOf(blocks: Doc[], id: string, places: Array<{ n: number; block: string }>) {
  const at = blocks.findIndex((b) => b.id === id);
  const before = new Set(blocks.slice(0, at + 1).map((b) => b.id));
  return places.filter((p) => before.has(p.block)).at(-1)?.n;
}

export function ToolBtn({ label, children, onClick, disabled, active }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <Tip label={label}>
      <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
        className={cn('grid h-8 w-8 place-items-center rounded-full text-soft-foreground transition-[background-color,color] hover:bg-popover hover:text-foreground hover:shadow-soft disabled:pointer-events-none disabled:opacity-35', active && 'bg-popover text-foreground shadow-soft')}>
        {children}
      </button>
    </Tip>
  );
}

/* ───────────── 块 ───────────── */

type Geo = { S: number; padT: number; padB: number; inner: number; ph: number; gap: number; fs: number; rtl: boolean };

/** 一块的外框：选中、悬停的描边，上下位置，拖大小的圆点。fixed：在跟着文字的标题组里，位置由组决定 */
function BlockFrame({ b, g, seq, fixed, grouped, selected, editing, drag, onDown, onScale, onOpen, children }: {
  b: Doc; g: Geo; seq: number; fixed: boolean; grouped: boolean; selected: boolean; editing: boolean; drag: Drag | null; onDown: (e: React.PointerEvent) => void; onScale: (e: React.PointerEvent) => void; onOpen: (e: React.MouseEvent) => void; children: ReactNode;
}) {
  const y = drag?.y ?? b.y ?? yOf(b);
  const lifting = drag?.dx !== undefined;
  const typing = editing && ops.isTextItem(b);
  return (
    <div
      data-seq={seq}
      data-key={b.key}
      onPointerDown={onDown}
      onDoubleClick={onOpen}
      className={cn('group relative flex-none rounded-3', grouped ? 'outline-offset-2' : 'outline-offset-6', !fixed && 'top-(--top) [transform:translate(var(--dx),var(--ty))]', fixed && lifting && '[transform:translateX(var(--dx))]',
        typing ? 'cursor-text' : ['touch-none select-none', drag ? 'cursor-grabbing' : 'cursor-grab'], drag ? 'transition-none' : '[transition:top_.25s_var(--ease-out),transform_.25s_var(--ease-out)]',
        selected ? (typing ? 'outline outline-1 outline-foreground/45' : 'outline outline-2 outline-foreground') : 'hover:outline hover:outline-1 hover:outline-foreground/25', lifting && 'z-10 opacity-90 shadow-pop')}
      style={{ '--top': `${y * 100}%`, '--dx': px(drag?.dx ?? 0), '--ty': `${-y * 100}%` }}
    >
      {children}
      {selected && !editing && scalable(b) && (
        <span onPointerDown={onScale} aria-label="拖动改大小" className="absolute -bottom-2.75 -right-2.75 z-20 grid h-5.5 w-5.5 cursor-nwse-resize place-items-center rounded-full bg-popover shadow-pop">
          <i className="h-2 w-2 rounded-full bg-primary" />
        </span>
      )}
      {drag?.scale !== undefined && <span className="mono absolute -top-7 right-0 rounded-full bg-primary px-2 py-0.5 text-11 text-primary-foreground">{Math.round(drag.scale * 100)}%</span>}
    </div>
  );
}

export function Img({ src, style, className }: { src?: string; style?: React.CSSProperties; className?: string }) {
  if (!src) return <span className={cn('grid aspect-[4/3] place-items-center bg-muted text-11 text-muted-foreground', className)} style={style}>没有图</span>;
  return <img src={imgSrc(src)} alt="" draggable={false} loading="lazy" className={cn('block max-w-none bg-muted object-cover', className)} style={style} />;
}

export const caption = (list: Doc[]) => list.map((i) => i.caption).filter(Boolean).join(' / ');

/** 行内文字（不能编辑的地方用，比如自由排布里的小字）：粗、斜、代码、链接照样显示，旁注只留一个小记号，地点前面有个定位图标 */
export function Spans({ text, dots = true }: { text: unknown; dots?: boolean }) {
  if (typeof text === 'string') return <>{text}</>;
  return <>{(text as Doc[] ?? []).map((s, i) => {
    const marks: string[] = (s.marks ?? []).map((m: Doc) => m.type);
    const note = marks.includes('note') || marks.includes('fn');
    return (
      <span key={i} className={cn(dots && marks.includes('place') && 'text-primary', marks.includes('strong') && 'font-bold', marks.includes('em') && 'italic', marks.includes('code') && 'font-mono text-smaller', marks.includes('link') && 'underline decoration-foreground/30 underline-offset-2')}>
        {dots && marks.includes('place') && <MapPin className="mr-[.18em] inline-block size-[.85em] align-[-.1em]" />}{s.t}{note && <sup className="mono text-sup text-muted-foreground">*</sup>}
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

export function StripFace({ b, H, fs, rtl, active, onPatch }: { b: Doc; H: number; fs: number; rtl: boolean; active: boolean; onPatch: (p: Doc) => void }) {
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

export function FreeFace({ b, h, fs, active, onPatch }: { b: Doc; h: number; fs: number; active: boolean; onPatch: (p: Doc) => void }) {
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
    <div className={cn('relative h-(--h) w-(--w)', active && 'bg-foreground/[.03]')} style={{ '--h': px(h), '--w': px(W) }}>
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
export const blockPlain = (p: Doc) => (p.type === 'list' ? (p.items as unknown[]).map(spansPlain).join('') : p.type === 'code' ? p.code ?? '' : spansPlain(p.text));

/** 一列文字里的一块：段落、标题、引用、列表、代码（版式和站点上的读法大致一样，不求逐像素）。字都是可编辑的单元 */
export function Para({ p, v, first, place, fs, align }: { p: Doc; v: boolean; first: boolean; place?: Doc; fs: number; align?: string }) {
  // 段与段之间隔开一点；竖排时“块开始”的一侧在右边
  const gap = first ? '' : v ? '[margin-block-start:.9em]' : 'mt-[.9em]';
  switch (p.type) {
    case 'h': {
      if (p.level === 3) return <Unit as="h3" id={p.id} value={p.text} dots={false} className={cn('text-em-112 font-bold tracking-[.08em]', !first && (v ? '[margin-block-start:1.1em]' : 'mt-[1.3em]'))} />;
      return (
        <header className={cn(v ? '[margin-block-end:1.2em]' : 'mb-(--mb)', !first && (v ? '[margin-block-start:1.2em]' : 'mt-[1.4em]'))} style={{ '--mb': px(fs * 0.8) }}>
          {place?.date && <Deco className={cn('mono block text-(length:--dfs) text-muted-foreground', v ? 'mb-0' : 'mb-(--dmb)')}>{place.date}</Deco>}
          <Unit id={p.id} value={p.text} dots={false} className={cn('text-(length:--hfs)', v ? 'block tracking-[.18em]' : 'tracking-[.08em]')} />
          {place?.en && <Deco className={cn('text-(length:--efs) text-muted-foreground', v ? 'ml-0' : 'ml-(--ml)')}>{place.en}</Deco>}
        </header>
      );
    }
    case 'quote':
      return (
        <blockquote className={cn('text-(length:--qfs) text-foreground', gap, v ? 'border-r border-r-muted-foreground [padding-inline-end:1em]' : 'border-l border-l-muted-foreground pl-[1em]')}>
          <Unit id={p.id} value={p.text} className="block" />
          {p.cite && <Deco as="cite" className={cn('block text-em-85 not-italic text-muted-foreground', v ? '[margin-block-start:.4em]' : 'mt-[.3em]')}>{p.cite}</Deco>}
        </blockquote>
      );
    case 'list':
      return (
        <ul className={gap}>
          {(p.items as unknown[]).map((it, k) => (
            <li key={k} className="flex gap-[.5em]"><Deco className="mono text-muted-foreground">{p.ordered ? k + 1 : '・'}</Deco><Unit id={`${p.id}/${k}`} value={it} className="min-w-0 flex-1" /></li>
          ))}
        </ul>
      );
    case 'code':
      return <Unit as="pre" plain id={p.id} value={p.code} className={cn('mono overflow-hidden px-[.8em] py-[.6em] text-em-80 leading-1-7 tracking-[0] whitespace-pre-wrap bg-foreground/[.05] text-soft-foreground [writing-mode:horizontal-tb]', !first && 'mt-[.9em]', v && 'w-[16em]')} />;
    default: return <Unit as="p" id={p.id} value={p.text} className={cn(ALIGN[align as keyof typeof ALIGN] ?? 'text-justify', gap)} />;
  }
}

/** 横排文字的行内对齐 */
export const ALIGN = { start: 'text-start', center: 'text-center', end: 'text-end', justify: 'text-justify' } as const;
/** 竖排的一组字在框里的位置（靠左 / 居中 / 靠右） */
export const VPOS = { start: 'justify-start', center: 'justify-center', end: 'justify-end' } as const;

/**
 * 文字框（一列文字或一个标题）：改字时整块是一个 contentEditable，里面每段是一个单元。
 * size：竖排时是高度，横排时是宽度（标题横排时按字宽，不设）
 */
export function TextFace({ b, v, fs, size, align, editing }: { b: Doc; v: boolean; fs: number; size?: number; align?: string; editing: boolean }) {
  const L = useLayout();
  const ref = useRef<HTMLDivElement>(null);
  useEditHost(ref, editing, L.edit);
  const list: Doc[] = b.blocks ?? [];
  // 竖排的框宽度由字数决定。Chrome 不会因为里面的字变了重算外层的宽度（正交书写方向的老问题），
  // 所以每次改动后量一下，写成明确的宽度
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !v) { if (el) el.style.width = ''; return; }
    const fit = () => { el.style.width = ''; el.style.width = `${el.scrollWidth}px`; };
    fit();
    const mo = new MutationObserver(fit);
    mo.observe(el, { subtree: true, childList: true, characterData: true });
    return () => mo.disconnect();
  });
  return (
    <div ref={ref} data-frame={b.key} contentEditable={editing ? 'plaintext-only' : undefined} suppressContentEditableWarning spellCheck={false}
      className={cn('serif text-(length:--fs) text-foreground outline-none', ALIGN[align as keyof typeof ALIGN], v ? [size ? 'h-(--size)' : 'h-max', 'leading-[2.05] tracking-[.12em] [writing-mode:vertical-rl]'] : size ? 'w-(--size) leading-[1.9]' : 'leading-[1.9]', editing && 'select-text')}
      style={{ '--fs': px(fs), '--size': size ? px(size) : undefined, '--hfs': px(fs * (v ? 1.6 : 1.75)), '--efs': px(fs * 0.85), '--dfs': px(fs * 0.66), '--dmb': px(fs * 0.3), '--qfs': px(fs * 1.4), '--ml': px(fs * 0.6) }}>
      {list.map((p, i) => <Para key={p.id} p={p} v={v} first={!i} place={L.places.find((x) => x.block === p.id)} fs={fs} align={align} />)}
    </div>
  );
}

function Face({ b, g, scale, places, here, active, editing, onPatch }: { b: Doc; g: Geo; scale: number; places: PlaceInfo[]; here?: number; active: boolean; editing: boolean; onPatch: (p: Doc) => void }) {
  const H = g.ph * scale, fs = g.fs;
  const cap = (text: string) => text && <p className="mt-2 max-w-full truncate text-(length:--fs) text-muted-foreground" style={{ '--fs': px(fs * 0.72) }}>{text}</p>;
  switch (b.type) {
    case 'text': case 'head': {
      const v = b.writing === 'v';
      return <TextFace b={b} v={v} fs={fs} align={b.align} editing={editing} size={b.type === 'head' ? undefined : v ? g.ph * 0.92 * scale : fs * 23} />;
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
export function MiniMap({ places, here, w, h, fs }: { places: PlaceInfo[]; here?: number; w: number; h: number; fs: number }) {
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
      <span className="mono absolute left-3 top-2 text-(length:--fs) text-muted-foreground" style={{ '--fs': px(fs * 0.62) }}>地图</span>
    </div>
  );
}
