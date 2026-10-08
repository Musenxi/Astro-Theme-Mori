/**
 * “排版”视图，照着 InDesign 的分工：
 *   上面一条是工具（读法、插入、缩放、撤销），中间是版面，右边是属性面板（选中什么就显示什么的设置）。
 *   单击选中一块、拖动摆位置；双击文字框（或选中后按回车）进入改字，Esc 退出。
 *   标题、一列文字、一组图、一张地图各是一块；标题默认挨着后面的文字。
 * 看这篇文章的读法设置决定摆哪一种：只允许横向 → 横滚排版；只允许竖向 / 混合（或没设读法）→ 竖向排版；两边都允许 → 工具条上能切换。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Heading2, ImagePlus, Map as MapIcon, Pilcrow, Redo2, Undo2 } from 'lucide-react';
import { placesOf } from 'astro-mori/flow';
import type { Doc } from '@/lib/types';
import * as ops from '@/lib/layout-ops.js';
import * as t from '@/lib/text-ops.js';
import { assetPath, AssetDialog } from '@/components/asset-picker';
import { useConfirm } from '@/components/confirm';
import { Segmented } from '@/components/segmented';
import { useLayoutHistory } from './layout-history';
import { Ctx, type LayoutCtx, type PlaceInfo } from './layout-ctx';
import { caretAtPoint, placeCaret, readSel, unitOf, type Caret, type EditApi } from './layout-text';
import { HorizontalLayout, NAMES, ToolBtn, ZOOM_KEY } from './layout-view';
import { VerticalLayout } from './layout-vertical';
import { Inspector } from './layout-inspector';

type Axis = 'v' | 'h';

export function LayoutView({ doc, setDoc }: { doc: Doc; setDoc: (fn: (d: Doc) => Doc) => void }) {
  const hist = useLayoutHistory(doc, setDoc);
  const confirm = useConfirm();
  const allowed: string[] = doc.reading?.allowed ?? ['v'];
  const canV = allowed.includes('v') || allowed.includes('mix'), canH = allowed.includes('h');
  const [pick, setPick] = useState<Axis | null>(null);
  const axis: Axis = canV && canH ? pick ?? (doc.reading?.default === 'h' ? 'h' : 'v') : canH ? 'h' : 'v';
  const [zoom, setZoomState] = useState<string>(() => { try { return localStorage.getItem(ZOOM_KEY) ?? 'm'; } catch { return 'm'; } });
  const setZoom = (z: string) => { setZoomState(z); try { localStorage.setItem(ZOOM_KEY, z); } catch { /* 无所谓 */ } };

  const blocks: Doc[] = useMemo(() => doc.blocks ?? [], [doc.blocks]);
  const its: Doc[] = useMemo(() => ops.itemsOf(doc), [doc]);
  const places = useMemo(() => placesOf(blocks) as PlaceInfo[], [blocks]);
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const selected = its.find((x) => x.key === sel) ?? null;

  const docRef = useRef(doc);
  docRef.current = doc;
  const selRef = useRef(sel);
  selRef.current = sel;
  /** 下一次画完以后光标要去的地方 / 双击的位置 */
  const caret = useRef<Caret | null>(null);
  const point = useRef<{ key: string; x: number; y: number } | null>(null);
  const lastType = useRef(0);
  /** 这次改字时新插进来的标题、段落：退出时还是空的就去掉 */
  const fresh = useRef(new Set<string>());

  const { commit, undo, redo } = hist;
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const select = useCallback((key: string | null) => { setSel(key); }, []);
  const stopEdit = useCallback(() => {
    setEditing(false); setCursor(null); getSelection()?.removeAllRanges();
    const d = docRef.current;
    const empty = new Set([...fresh.current].filter((id) => { const b = d.blocks?.find((x: Doc) => x.id === id); return b && !t.valueLen(t.getUnit(d, id)); }));
    fresh.current.clear();
    if (empty.size) commitRef.current({ ...d, blocks: (d.blocks ?? []).filter((b: Doc) => !empty.has(b.id)) }, false);
  }, []);
  const startEdit = useCallback((key: string, at?: { x: number; y: number } | Caret) => {
    setSel(key);
    setEditing(true);
    if (at && 'unit' in at) caret.current = at;
    else if (at) point.current = { key, ...at };
    else {
      // 没给位置：放到这一块最后一个字后面
      const it = ops.itemsOf(docRef.current).find((x: Doc) => x.key === key);
      const us = t.unitsOf(it?.blocks ?? []);
      const last = us.at(-1)?.unit;
      if (last) caret.current = { unit: last, off: t.valueLen(t.getUnit(docRef.current, last)) };
    }
  }, []);

  // 改字时把光标放好：先找双击的那个字，找不到就放在这一块开头
  useLayoutEffect(() => {
    if (!editing) return;
    const p = point.current;
    if (p) {
      point.current = null;
      const c = caretAtPoint(p.x, p.y);
      const frame = document.querySelector(`[data-frame="${CSS.escape(p.key)}"]`);
      if (c && frame?.contains(document.querySelector(`[data-unit="${CSS.escape(c.unit)}"]`))) placeCaret(c);
      else { const u = frame?.querySelector<HTMLElement>('[data-unit]'); if (u) placeCaret({ unit: u.dataset.unit!, off: 0 }); }
    }
    const c = caret.current;
    if (c) { caret.current = null; placeCaret(c); }
  });

  // 改字时选中的块跟着光标走（点到别的文字框里接着改）
  useEffect(() => {
    if (!editing) return;
    const on = () => {
      const u = unitOf(getSelection()?.anchorNode);
      if (!u) return;
      const f = (u.closest('[data-frame]') as HTMLElement | null)?.dataset.frame;
      if (f && f !== selRef.current) setSel(f);
      setCursor(u.dataset.unit!);
    };
    document.addEventListener('selectionchange', on);
    return () => document.removeEventListener('selectionchange', on);
  }, [editing]);

  const edit: EditApi = {
    doc: () => docRef.current,
    type: (next) => { const now = Date.now(); commit(next, now - lastType.current > 1200); lastType.current = now; },
    apply: (next, c) => { lastType.current = 0; commit(next); if (c) caret.current = c; else stopEdit(); },
    undo: () => { const s = readSel(); undo(); if (s) caret.current = s.a; },
    redo: () => { const s = readSel(); redo(); if (s) caret.current = s.a; },
    exit: stopEdit,
  };

  const [lib, setLib] = useState<((src: string) => void) | null>(null);
  const pickImage = useCallback((fn: (src: string) => void) => setLib(() => fn), []);

  const remove = async (b: Doc) => {
    const text = ops.isTextItem(b);
    const what = b.type === 'text' ? '这段文字' : NAMES[b.type] ?? '这一块';
    if (b.type !== 'map' && !(await confirm({ title: `删除${what}？`, description: text ? '文字会从正文里删掉。可以用 ⌘Z 撤销。' : '图片文件还在图库里。可以用 ⌘Z 撤销。', confirmLabel: '删除', danger: true }))) return;
    commit(ops.removeItem(doc, b.key));
    setSel(null);
    stopEdit();
  };

  /** 插到选中的块后面（没选中就放最后）；插入文字、标题后直接开始打字 */
  const insert = (block: Doc, type?: boolean) => {
    const r = ops.insertAfter(doc, selected?.key ?? null, block);
    commit(r.doc);
    if (type) { fresh.current.add(r.id); startEdit(r.id, { unit: r.id, off: 0 }); }
    else { stopEdit(); setSel(r.id); }
  };
  // 新段落接在选中的文字后面时，带上那一列的横竖设置，才排在同一列里
  const near = selected?.type === 'text' ? selected.blocks?.at(-1) : null;
  const carry = near ? { ...(near.h ? { h: near.h } : {}), ...(near.v ? { v: near.v } : {}) } : {};

  const ctx: LayoutCtx = {
    doc, blocks, its, places, axis, rtl: doc.reading?.direction === 'rtl', zoom,
    sel, selected, select, editing, startEdit, stopEdit, commit, hist, edit, cursor, pickImage, remove,
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="mx-5 flex min-h-11 shrink-0 items-center gap-1 rounded-22 bg-muted/70 px-2 py-1">
          {canV && canH && <Segmented size="sm" className="mr-2" value={axis} onValueChange={(v) => { stopEdit(); setPick(v); }} options={[{ value: 'v', label: '竖向' }, { value: 'h', label: '横向' }]} />}
          <ToolBtn label="标题" onClick={() => insert({ type: 'h', level: 2, text: '' }, true)}><Heading2 size={15} /></ToolBtn>
          <ToolBtn label="文字" onClick={() => insert({ type: 'p', text: '', ...carry }, true)}><Pilcrow size={15} /></ToolBtn>
          <ToolBtn label="图片" onClick={() => pickImage((src) => insert({ type: 'image', src, alt: '', layout: 'wide' }))}><ImagePlus size={15} /></ToolBtn>
          <ToolBtn label="地图" onClick={() => insert({ type: 'map', scope: 'region' })}><MapIcon size={15} /></ToolBtn>
          <span className="ml-auto flex items-center gap-0.5">
            <Segmented size="sm" className="mr-1.5" value={zoom} onValueChange={setZoom} options={[{ value: 's', label: '小' }, { value: 'm', label: '中' }, { value: 'l', label: '大' }]} />
            <ToolBtn label="撤销　⌘Z" disabled={!hist.canUndo} onClick={undo}><Undo2 size={15} /></ToolBtn>
            <ToolBtn label="重做　⇧⌘Z" disabled={!hist.canRedo} onClick={redo}><Redo2 size={15} /></ToolBtn>
          </span>
        </div>
        <div className="mx-5 mb-2 mt-2 flex min-h-0 flex-1 gap-2">
          <div className="relative min-w-0 flex-1">{axis === 'h' ? <HorizontalLayout /> : <VerticalLayout />}</div>
          <Inspector />
        </div>
      </div>
      <AssetDialog open={!!lib} onOpenChange={(o) => { if (!o) setLib(null); }} onPick={(n) => { const fn = lib; setLib(null); fn?.(assetPath(n)); }} />
    </Ctx.Provider>
  );
}
