/**
 * 竖向读法的版面：整篇是一页往下读的长页，照着主题里竖向读法的版式摆（styles/travel.css 的 v / m）——
 *   文字居中成一栏，单图通栏或内缩，双图并排，网格一大几小，图组是一行可横拖的图，自由排布保持比例，地图一整块。
 *   标题和后面那列文字摞在一起（两边都竖排时并排，标题在右）。
 *   上下拖动 → 换顺序（竖向读法里没有“上下位置”和“大小”，那是横滚才有的）
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Doc } from '@/lib/types';
import * as ops from '@/lib/layout-ops.js';
import { useLayout, type PlaceInfo } from './layout-ctx';
import { FreeFace, hereOf, Img, MiniMap, StripFace, TextFace, VPOS, caption, clamp, px, rowsOf } from './layout-view';

interface Drag { key: string; dy?: number; slot?: number; line?: number }

export function VerticalLayout() {
  const L = useLayout();
  const { doc, its, places, blocks, sel, selected, editing, commit } = L;
  const area = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(720);
  const [drag, setDrag] = useState<Drag | null>(null);
  const rows = useMemo(() => rowsOf(its), [its]);

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 页宽：窄一点能一眼看到更多；字号跟着页宽走
  const W = Math.round(clamp((avail - 8) * ({ s: 0.62, m: 0.88, l: 1 }[L.zoom] ?? 0.88), 300, 960));
  const fs = Math.max(11, W * 0.019);
  const gap = W * 0.055;

  /* ── 拖动：上下换顺序 ── */
  const slotAt = (clientY: number, key: string) => {
    const els = [...(page.current?.querySelectorAll<HTMLElement>('[data-seq]') ?? [])].filter((el) => el.dataset.key !== key);
    let slot = 0;
    for (const el of els) { const r = el.getBoundingClientRect(); if (r.top + r.height / 2 < clientY) slot++; }
    const t = page.current!.getBoundingClientRect();
    const prev = els[slot - 1]?.getBoundingClientRect(), next = els[slot]?.getBoundingClientRect();
    const edge = !prev && !next ? t.top + t.height / 2 : prev && next ? (prev.bottom + next.top) / 2 : prev ? prev.bottom + gap / 2 : next!.top - gap / 2;
    return { slot, line: edge - t.top };
  };

  const startMove = (e: React.PointerEvent, b: Doc) => {
    if (e.button !== 0) return;
    if (editing) { if (ops.isTextItem(b)) return; L.stopEdit(); }
    e.preventDefault();
    L.select(b.key);
    scroller.current?.focus({ preventScroll: true });
    const sy = e.clientY, sc0 = scroller.current!.scrollTop;
    let moved = false, last: Drag = { key: b.key }, raf = 0, py = e.clientY;
    const update = (cy: number) => {
      const dy = cy - sy + (scroller.current!.scrollTop - sc0);
      if (!moved && Math.abs(dy) < 3) return;
      moved = true;
      last = { key: b.key, dy, ...slotAt(cy, b.key) };
      setDrag(last);
    };
    const edge = () => {
      const r = scroller.current!.getBoundingClientRect();
      const v = py < r.top + 60 ? -14 : py > r.bottom - 60 ? 14 : 0;
      if (v && moved) { scroller.current!.scrollTop += v; update(py); }
      raf = requestAnimationFrame(edge);
    };
    const move = (ev: PointerEvent) => { py = ev.clientY; update(ev.clientY); };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); cancelAnimationFrame(raf);
      setDrag(null);
      if (moved && last.slot !== undefined) commit(ops.moveItem(doc, b.key, last.slot));
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
    raf = requestAnimationFrame(edge);
  };

  /* ── 键盘：↑↓ 换顺序，回车改字，⌘Z 撤销 ── */
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).isContentEditable) return; // 在改字：方向键、删除键是给文字的
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) L.hist.redo(); else L.hist.undo(); return; }
    if (!selected) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); commit(ops.nudgeItem(doc, selected.key, e.key === 'ArrowUp' ? -1 : 1)); }
    else if (e.key === 'Enter' && ops.isTextItem(selected)) { e.preventDefault(); L.startEdit(selected.key); }
    else if (e.key === 'Escape') L.select(null);
    else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); void L.remove(selected); }
  };
  useEffect(() => {
    if (!sel || editing) return;
    page.current?.querySelector(`[data-key="${CSS.escape(sel)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [sel, blocks, editing]);

  const block = (b: Doc, i: number, w?: number) => (
    <VBlock key={b.key} b={b} W={w ?? W * widthOf(b)} seq={i} selected={sel === b.key} editing={editing} drag={drag?.key === b.key ? drag : null}
      onDown={(e) => startMove(e, b)} onOpen={(e) => { if (ops.isTextItem(b)) L.startEdit(b.key, { x: e.clientX, y: e.clientY }); }}>
      <VFace b={b} W={W} fs={fs} places={places} here={b.type === 'map' ? hereOf(blocks, b.key, places) : undefined}
        active={sel === b.key && !drag && !editing} editing={editing} onPatch={(p) => commit(ops.patchBlock(doc, b.key, p))} />
    </VBlock>
  );

  return (
    <div ref={area} className="absolute inset-0">
      <div ref={scroller} tabIndex={0} onKeyDown={onKey} onPointerDown={(e) => { if (e.target === e.currentTarget || e.target === page.current) { L.stopEdit(); L.select(null); } }}
        className="absolute inset-0 overflow-y-auto overflow-x-hidden rounded-2xl bg-muted/70 outline-none [scrollbar-width:thin]">
        <div ref={page} className="relative mx-auto flex w-(--w) flex-col items-center gap-(--gap) py-(--gap)" style={{ '--w': px(W), '--gap': px(gap) }}>
          {rows.map((r) => {
            if ('item' in r) return block(r.item, r.at);
            const { head, text } = r;
            // 两边都竖排：并排，标题在右，整组按文字的位置靠左 / 居中 / 靠右；否则标题摞在文字上面
            if (head.vwriting === 'v' && text.vwriting === 'v') {
              return (
                <div key={head.key} className={cn('flex w-(--w) flex-row-reverse', VPOS[text.vpos as keyof typeof VPOS] ?? 'justify-end')} style={{ '--w': px(W * 0.67) }}>
                  <div className="flex flex-row-reverse">{block(head, r.at, 0)}{block(text, r.at + 1, 0)}</div>
                </div>
              );
            }
            return <div key={head.key} className="flex flex-col items-center gap-(--g)" style={{ '--g': px(fs * 0.8) }}>{block(head, r.at)}{block(text, r.at + 1)}</div>;
          })}
          {!its.length && <p className="py-24 text-muted-foreground">还没有内容。</p>}
          {drag?.line !== undefined && <i className="pointer-events-none absolute left-0 right-0 top-(--l) h-0.5 rounded-full bg-primary" style={{ '--l': px(drag.line - 1) }} />}
        </div>
      </div>
    </div>
  );
}

/** 一块占页宽的几成：照主题竖向读法的栏位（文字第 3–9 栏，内缩图 3–11，双图 2–12，其余通栏） */
function widthOf(b: Doc): number {
  switch (b.type) {
    case 'text': case 'head': return b.vwriting === 'v' ? 0.67 : 0.56;
    case 'image': return b.layout === 'inline' ? 0.67 : 1;
    case 'pair': return 0.83;
    case 'map': return 0.83;
    default: return 1;
  }
}

/** W 为 0：宽度跟着内容（并排的竖排标题和文字） */
function VBlock({ b, W, seq, selected, editing, drag, onDown, onOpen, children }: {
  b: Doc; W: number; seq: number; selected: boolean; editing: boolean; drag: Drag | null; onDown: (e: React.PointerEvent) => void; onOpen: (e: React.MouseEvent) => void; children: ReactNode;
}) {
  const lifting = drag?.dy !== undefined;
  const typing = editing && ops.isTextItem(b);
  return (
    <div data-seq={seq} data-key={b.key} onPointerDown={onDown} onDoubleClick={onOpen}
      className={cn('relative flex-none rounded-3 outline-offset-6 [transform:translateY(var(--dy))]', W ? 'w-(--w)' : 'w-auto', typing ? 'cursor-text' : ['touch-none select-none', drag ? 'cursor-grabbing' : 'cursor-grab'], drag ? 'transition-none' : '[transition:transform_.25s_var(--ease-out)]',
        selected ? (typing ? 'outline outline-1 outline-foreground/45' : 'outline outline-2 outline-foreground') : 'hover:outline hover:outline-1 hover:outline-foreground/25', lifting && 'z-10 opacity-90 shadow-pop')}
      style={{ '--w': W ? px(W) : undefined, '--dy': px(drag?.dy ?? 0) }}>
      {children}
    </div>
  );
}

function VFace({ b, W, fs, places, here, active, editing, onPatch }: { b: Doc; W: number; fs: number; places: PlaceInfo[]; here?: number; active: boolean; editing: boolean; onPatch: (p: Doc) => void }) {
  const cap = (text: string) => text && <p className="mt-2 max-w-full truncate text-(length:--fs) text-muted-foreground" style={{ '--fs': px(fs * 0.78) }}>{text}</p>;
  switch (b.type) {
    case 'text': case 'head': {
      const v = b.vwriting === 'v';
      const face = <TextFace b={b} v={v} fs={fs} align={b.valign} editing={editing} size={v ? fs * 21 : undefined} />;
      return v && b.type === 'text' ? <div className={cn('flex', VPOS[b.vpos as keyof typeof VPOS] ?? 'justify-end')}>{face}</div> : face;
    }
    case 'image':
      return <figure><Img src={b.src} className="max-h-(--mh) w-full" style={{ '--mh': px(W * 0.7) }} />{cap(b.caption)}</figure>;
    case 'pair':
      return <figure><div className="grid grid-cols-2 gap-(--g)" style={{ '--g': px(W * 0.012) }}>{b.images.map((im: Doc, i: number) => <Img key={i} src={im.src} className="aspect-[4/3] w-full" />)}</div>{cap(caption(b.images))}</figure>;
    case 'grid': {
      const n = b.images.length;
      return (
        <figure>
          <div className="grid grid-cols-3 gap-(--g)" style={{ '--g': px(W * 0.009) }}>
            {b.images.map((im: Doc, i: number) => <Img key={i} src={im.src} className={cn('aspect-[4/3] h-full w-full', i === 0 && 'col-span-2 row-span-2', i === n - 1 && n > 1 && i !== 0 && 'aspect-auto')} />)}
          </div>
          {cap(caption(b.images))}
        </figure>
      );
    }
    case 'strip':
      return <div className="overflow-x-auto [scrollbar-width:none]"><StripFace b={b} H={W * 0.32} fs={fs} rtl={false} active={active} onPatch={onPatch} />{cap(caption(b.images))}</div>;
    case 'free':
      return <FreeFace b={b} h={W / (b.ar ?? 1.6)} fs={fs} active={active} onPatch={onPatch} />;
    case 'map':
      return <MiniMap places={places} here={b.scope === 'near' ? here : undefined} w={W * 0.83} h={W * 0.45} fs={fs} />;
  }
  return <div className="text-muted-foreground">不认识的块</div>;
}
