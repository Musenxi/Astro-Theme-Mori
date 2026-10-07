/**
 * 竖向读法的排版：整篇是一页往下读的长页，照着主题里竖向读法的版式摆（styles/travel.css 的 v / m）——
 *   文字居中成一栏，单图通栏或内缩，双图并排，网格一大几小，图组是一行可横拖的图，自由排布保持比例，地图一整块。
 *   上下拖动 → 换顺序（竖向读法里没有“上下位置”和“大小”，那是横滚才有的）
 * 文字在 Markdown 里写；这里只管版式。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ImagePlus, Map as MapIcon, Redo2, Undo2 } from 'lucide-react';
import { placesOf } from 'astro-mori/flow';
import { cn } from '@/lib/cn';
import type { Doc } from '@/lib/types';
import * as ops from '@/lib/layout-ops.js';
import { assetPath, AssetDialog } from '@/components/asset-picker';
import { Dialog } from '@/components/ui/dialog';
import { ModalContent } from '@/components/modal';
import { useConfirm } from '@/components/confirm';
import { Segmented } from '@/components/segmented';
import { LayoutBlockBody } from './layout-blocks';
import type { LayoutHistory } from './layout-history';
import { ALIGN, VPOS, BlockBar, FreeFace, hereOf, Img, MiniMap, NAMES, Para, StripFace, ToolBtn, ZOOM_KEY, blockPlain, caption, clamp, px, type PlaceInfo } from './layout-view';

interface Drag { key: string; dy?: number; slot?: number; line?: number }

export function VerticalLayout({ doc, hist, switcher }: { doc: Doc; hist: LayoutHistory; switcher?: ReactNode }) {
  const confirm = useConfirm();
  const { commit, undo, redo } = hist;
  const area = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(720);
  const [zoom, setZoomState] = useState<string>(() => { try { return localStorage.getItem(ZOOM_KEY) ?? 'm'; } catch { return 'm'; } });
  const setZoom = (z: string) => { setZoomState(z); try { localStorage.setItem(ZOOM_KEY, z); } catch { /* 无所谓 */ } };
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [detail, setDetail] = useState(false);
  const [lib, setLib] = useState(false);

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 页宽：窄一点能一眼看到更多；字号跟着页宽走
  const W = Math.round(clamp((avail - 8) * ({ s: 0.62, m: 0.88, l: 1 }[zoom] ?? 0.88), 300, 960));
  const fs = Math.max(11, W * 0.019);
  const gap = W * 0.055;

  const blocks: Doc[] = useMemo(() => doc.blocks ?? [], [doc.blocks]);
  const its: Doc[] = useMemo(() => ops.itemsOf(doc), [doc]);
  const places = useMemo(() => placesOf(blocks) as PlaceInfo[], [blocks]);
  const selected = its.find((x) => x.key === sel) ?? null;

  /** 竖排只改竖滚这一边，横滚里的写法不动 */
  const place = (key: string, p: Doc, history = true) => commit(ops.setPlace(doc, key, p, 'v'), history);
  const patchBlock = (id: string, p: Doc, history = true) => commit(ops.patchBlock(doc, id, p), history);

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
    e.preventDefault();
    setSel(b.key);
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

  /* ── 键盘：↑↓ 换顺序，⌘Z 撤销 ── */
  const onKey = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (!selected) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); commit(ops.nudgeItem(doc, selected.key, e.key === 'ArrowUp' ? -1 : 1)); }
    else if (e.key === 'Escape') setSel(null);
    else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); void remove(selected); }
  };
  useEffect(() => {
    if (!sel) return;
    page.current?.querySelector(`[data-key="${sel}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
      <div className="mx-5 flex min-h-11 shrink-0 flex-wrap items-center gap-2 rounded-22 bg-muted/70 px-2 py-1">
        {selected ? <BlockBar key={selected.key} axis="v" b={selected} doc={doc} commit={commit} place={(p) => place(selected.key, p)} patch={(p) => patchBlock(selected.key, p)} onDetail={() => setDetail(true)} onRemove={() => void remove(selected)} />
          : <span />}
        <span className="ml-auto flex items-center gap-0.5">
          {switcher}
          <Segmented size="sm" className="mr-1.5" value={zoom} onValueChange={setZoom} options={[{ value: 's', label: '小' }, { value: 'm', label: '中' }, { value: 'l', label: '大' }]} />
          <ToolBtn label="插入图片" onClick={() => setLib(true)}><ImagePlus size={15} /></ToolBtn>
          <ToolBtn label="插入地图" onClick={() => insert({ type: 'map', scope: 'region' })}><MapIcon size={15} /></ToolBtn>
          <span className="mx-1 h-4 w-px bg-border-strong" />
          <ToolBtn label="撤销　⌘Z" disabled={!hist.canUndo} onClick={undo}><Undo2 size={15} /></ToolBtn>
          <ToolBtn label="重做　⇧⌘Z" disabled={!hist.canRedo} onClick={redo}><Redo2 size={15} /></ToolBtn>
        </span>
      </div>

      <div ref={area} className="relative mx-5 mb-2 mt-2 min-h-0 flex-1">
        <div ref={scroller} tabIndex={0} onKeyDown={onKey} onPointerDown={(e) => { if (e.target === e.currentTarget || e.target === page.current) setSel(null); }}
          className="absolute inset-0 overflow-y-auto overflow-x-hidden rounded-2xl bg-muted/70 outline-none [scrollbar-width:thin]">
          <div ref={page} className="relative mx-auto flex w-(--w) flex-col items-center gap-(--gap) py-(--gap)" style={{ '--w': px(W), '--gap': px(gap) }}>
            {its.map((b, i) => (
              <VBlock key={b.key} b={b} W={W} seq={i} selected={sel === b.key} drag={drag?.key === b.key ? drag : null}
                onDown={(e) => startMove(e, b)} onOpen={() => { setSel(b.key); if (b.type !== 'map' && b.type !== 'text') setDetail(true); }}>
                <VFace b={b} W={W} fs={fs} places={places} here={b.type === 'map' ? hereOf(blocks, b.key, places) : undefined}
                  active={sel === b.key && !drag} onPatch={(p) => patchBlock(b.key, p)} />
              </VBlock>
            ))}
            {!its.length && <p className="py-24 text-muted-foreground">还没有内容。</p>}
            {drag?.line !== undefined && <i className="pointer-events-none absolute left-0 right-0 top-(--l) h-0.5 rounded-full bg-primary" style={{ '--l': px(drag.line - 1) }} />}
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

/** 一块占页宽的几成：照主题竖向读法的栏位（文字第 3–9 栏，内缩图 3–11，双图 2–12，其余通栏） */
function widthOf(b: Doc): number {
  switch (b.type) {
    case 'text': return b.vwriting === 'v' ? 0.67 : 0.56;
    case 'image': return b.layout === 'inline' ? 0.67 : 1;
    case 'pair': return 0.83;
    case 'map': return 0.83;
    default: return 1;
  }
}

function VBlock({ b, W, seq, selected, drag, onDown, onOpen, children }: {
  b: Doc; W: number; seq: number; selected: boolean; drag: Drag | null; onDown: (e: React.PointerEvent) => void; onOpen: () => void; children: ReactNode;
}) {
  const lifting = drag?.dy !== undefined;
  return (
    <div data-seq={seq} data-key={b.key} onPointerDown={onDown} onDoubleClick={onOpen}
      className={cn('relative w-(--w) flex-none touch-none select-none rounded-3 outline-offset-6 [transform:translateY(var(--dy))]', drag ? 'cursor-grabbing transition-none' : 'cursor-grab [transition:transform_.25s_var(--ease-out)]',
        selected ? 'outline outline-2 outline-foreground' : 'hover:outline hover:outline-1 hover:outline-foreground/25', lifting && 'z-10 opacity-90 shadow-pop')}
      style={{ '--w': px(W * widthOf(b)), '--dy': px(drag?.dy ?? 0) }}>
      {children}
    </div>
  );
}

function VFace({ b, W, fs, places, here, active, onPatch }: { b: Doc; W: number; fs: number; places: PlaceInfo[]; here?: number; active: boolean; onPatch: (p: Doc) => void }) {
  const cap = (text: string) => text && <p className="mt-2 max-w-full truncate text-(length:--fs) text-muted-foreground" style={{ '--fs': px(fs * 0.78) }}>{text}</p>;
  switch (b.type) {
    case 'text': {
      const v = b.vwriting === 'v';
      const list: Doc[] = b.blocks ?? [];
      return (
        <div className={cn(v && ['flex', VPOS[b.vpos as keyof typeof VPOS] ?? 'justify-end'])}>
          <div className={cn('serif text-(length:--fs) text-foreground', ALIGN[b.valign as keyof typeof ALIGN], v ? 'h-(--h) leading-[2.05] tracking-[.12em] [writing-mode:vertical-rl]' : 'leading-[1.9]')} style={{ '--fs': px(fs), '--h': px(fs * 21) }}>
            {list.map((p, i) => <Para key={p.id} p={p} v={v} first={!i} place={places.find((x) => x.block === p.id)} fs={fs} align={b.valign} />)}
            {!list.some((p) => blockPlain(p).trim()) && <p className="text-muted-foreground">（空的文字，在 Markdown 里写）</p>}
          </div>
        </div>
      );
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
