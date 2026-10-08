/**
 * 排版视图里直接改字：文字框（一列文字、一个标题）在编辑时是 contentEditable，
 * 每个段落 / 标题 / 列表项是一个“单元”（data-unit），单元里的字由这里画成 HTML，打完字再读回成 spans。
 *
 * 只让浏览器做“在一个单元里打字、删字”这类原地的改动（输入法也走这条路）；
 * 回车、在开头退格、跨段选中再删 / 打字、粘贴、粗体斜体都拦下来，用 text-ops 改文档，再把光标放回去。
 */
import { createElement, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { Doc } from '@/lib/types';
import * as t from '@/lib/text-ops.js';

/* ───────────── spans ⇄ HTML ───────────── */

const MARK: Record<string, string> = { strong: 'font-bold', em: 'italic', code: 'font-mono text-smaller', link: 'underline decoration-foreground/30 underline-offset-2' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** 行内文字画成 HTML：每段带着自己的标注（data-m），没有字的标注（旁注记号）是不能编辑的原子；标题里的地点不上色 */
export function spansHtml(spans: Doc[], dots = true): string {
  return spans.map((s) => {
    const marks: Doc[] = s.marks ?? [];
    if (!marks.length) return esc(s.t);
    const types = marks.map((m) => m.type);
    const cls = [...types.map((x) => MARK[x]), dots && types.includes('place') && 'text-primary mk-place', (types.includes('note') || types.includes('fn')) && 'mk-note'].filter(Boolean).join(' ');
    if (s.t === '') return `<span data-atom="${esc(JSON.stringify(s))}" contenteditable="false" class="${cls}"></span>`;
    return `<span data-m="${esc(JSON.stringify(marks))}" class="${cls}">${esc(s.t)}</span>`;
  }).join('');
}

/** 单元里的 DOM → spans（浏览器自己加的元素当成普通文字，跟着外层的标注） */
export function parseUnit(el: HTMLElement): unknown {
  if (el.dataset.plain !== undefined) return (el.textContent ?? '').replace(/ /g, ' ');
  const out: Doc[] = [];
  const walk = (node: Node, marks: Doc[]) => {
    for (const n of node.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) {
        const s = (n as Text).data.replace(/ /g, ' ').replace(/​/g, '');
        if (s) out.push(marks.length ? { t: s, marks } : { t: s });
      } else if (n instanceof HTMLElement) {
        if (n.dataset.atom) { out.push(JSON.parse(n.dataset.atom)); continue; }
        if (n.tagName === 'BR') continue;
        walk(n, n.dataset.m ? JSON.parse(n.dataset.m) : marks);
      }
    }
  };
  walk(el, []);
  return t.merge(out);
}

/**
 * 一个单元。字由 innerHTML 画（React 不管里面的节点，打字时浏览器改的就是这些节点）；
 * data-sync 记着当前画的是哪份内容：自己打出来的字读回去以后内容一样，就不重画（光标不跳）。
 */
export function Unit({ id, value, plain, dots = true, as = 'span', className }: { id: string; value: unknown; plain?: boolean; dots?: boolean; as?: string; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!, key = JSON.stringify(value ?? '');
    if (el.dataset.sync === key) return;
    el.dataset.sync = key;
    // 空的单元放一个 <br>：浏览器才能把光标放进去（读回时不算字）
    el.innerHTML = (plain ? esc(String(value ?? '')) : spansHtml(t.asSpans(value), dots)) || '<br>';
  });
  return createElement(as, { ref, 'data-unit': id, 'data-plain': plain ? '' : undefined, className });
}

/** 不能编辑的装饰（标题旁的日期、英文名，引用的出处，列表的记号） */
export const Deco = ({ children, className, as = 'span' }: { children: ReactNode; className?: string; as?: string }) => createElement(as, { contentEditable: false, className }, children);

/* ───────────── 光标 ───────────── */

export type Caret = { unit: string; off: number; focus?: { unit: string; off: number } };

export const unitOf = (node: Node | null | undefined): HTMLElement | null => {
  const el = node instanceof Element ? node : node?.parentElement;
  return (el?.closest('[data-unit]') as HTMLElement | null) ?? null;
};
const offsetIn = (unit: HTMLElement, node: Node, off: number) => {
  const r = document.createRange();
  r.setStart(unit, 0);
  try { r.setEnd(node, off); } catch { return 0; }
  return r.toString().replace(/​/g, '').length;
};
const pointIn = (unit: HTMLElement, off: number): [Node, number] => {
  const w = document.createTreeWalker(unit, NodeFilter.SHOW_TEXT);
  let acc = 0;
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const len = (n as Text).data.length;
    if (acc + len >= off) return [n, off - acc];
    acc += len;
  }
  return [unit, unit.childNodes.length];
};
const findUnit = (unit: string) => document.querySelector<HTMLElement>(`[data-unit="${CSS.escape(unit)}"]`);

/** 现在的选区（两头都在单元里才算） */
export function readSel(): { a: Caret; b: Caret; collapsed: boolean } | null {
  const s = getSelection();
  if (!s?.rangeCount || !s.anchorNode || !s.focusNode) return null;
  const ua = unitOf(s.anchorNode), ub = unitOf(s.focusNode);
  if (!ua || !ub) return null;
  return { a: { unit: ua.dataset.unit!, off: offsetIn(ua, s.anchorNode, s.anchorOffset) }, b: { unit: ub.dataset.unit!, off: offsetIn(ub, s.focusNode, s.focusOffset) }, collapsed: s.isCollapsed };
}

/** 把光标（或选区）放到某个单元的第几个字 */
export function placeCaret(c: Caret) {
  const el = findUnit(c.unit);
  if (!el) return false;
  (el.closest('[data-frame]') as HTMLElement | null)?.focus({ preventScroll: true });
  const [n, o] = pointIn(el, c.off);
  const s = getSelection()!;
  if (c.focus) {
    const fe = findUnit(c.focus.unit);
    if (fe) { const [fn, fo] = pointIn(fe, c.focus.off); s.setBaseAndExtent(n, o, fn, fo); return true; }
  }
  s.setBaseAndExtent(n, o, n, o);
  return true;
}

/** 双击的那个点落在哪个字上 */
export function caretAtPoint(x: number, y: number): Caret | null {
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  const p = d.caretPositionFromPoint?.(x, y);
  const r = p ? null : document.caretRangeFromPoint?.(x, y);
  const node = p?.offsetNode ?? r?.startContainer, off = p?.offset ?? r?.startOffset ?? 0;
  const u = unitOf(node);
  return u && node ? { unit: u.dataset.unit!, off: offsetIn(u, node, off) } : null;
}

/* ───────────── 编辑时的输入 ───────────── */

export interface EditApi {
  doc: () => Doc;
  /** 打字：连续的打字合成一步撤销 */
  type: (next: Doc) => void;
  /** 结构上的改动（拆段、并段、粗体……）：单独一步撤销，之后光标去 caret */
  apply: (next: Doc, caret: Caret | null) => void;
  undo: () => void;
  redo: () => void;
  exit: () => void;
}

/** 按住的粗体 / 斜体：选中的字加上或去掉（跨段时每段都改） */
export function formatSel(doc: Doc, type: string): { doc: Doc; caret: Caret } | null {
  const s = readSel();
  if (!s || s.collapsed) return null;
  const us = t.unitsOf(doc.blocks).map((u: Doc) => u.unit);
  let [a, b] = [s.a, s.b];
  if (us.indexOf(a.unit) > us.indexOf(b.unit) || (a.unit === b.unit && a.off > b.off)) [a, b] = [b, a];
  const span = us.slice(us.indexOf(a.unit), us.indexOf(b.unit) + 1);
  const ranges = span.map((u: string) => [u, u === a.unit ? a.off : 0, u === b.unit ? b.off : t.valueLen(t.getUnit(doc, u))] as const);
  const on = !ranges.every(([u, x, y]) => { const v = t.getUnit(doc, u); return typeof v === 'string' || y <= x || t.hasMark(v, x, y, type); });
  let next = doc;
  for (const [u, x, y] of ranges) { const v = t.getUnit(next, u); if (typeof v !== 'string') next = t.setUnit(next, u, t.toggleMark(v, x, y, type, on)); }
  return { doc: next, caret: { ...a, focus: b } };
}

/** 编辑中的文字框：接住输入事件。active 为假时什么也不做 */
export function useEditHost(ref: React.RefObject<HTMLElement | null>, active: boolean, api: EditApi) {
  const live = useRef(api);
  live.current = api;
  useEffect(() => {
    const host = ref.current;
    if (!host || !active) return;
    let composing = false;

    /** 浏览器改过的单元读回来，写进文档 */
    const sync = () => {
      const doc = live.current.doc();
      let next = doc;
      for (const el of host.querySelectorAll<HTMLElement>('[data-unit]')) {
        const unit = el.dataset.unit!;
        const cand = t.setUnit(next, unit, parseUnit(el));
        const raw = t.rawUnit(cand, unit);
        if (JSON.stringify(raw) === JSON.stringify(t.rawUnit(next, unit))) continue;
        next = cand;
        el.dataset.sync = JSON.stringify(raw ?? '');
      }
      // 落在单元外面的字（输入法偶尔会）：去掉，不让它弄乱 React 的节点
      const w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      const stray: Node[] = [];
      for (let n = w.nextNode(); n; n = w.nextNode()) if (!unitOf(n) && !n.parentElement?.closest('[contenteditable="false"]')) stray.push(n);
      stray.forEach((n) => n.parentNode?.removeChild(n));
      if (next !== doc) live.current.type(next);
    };

    const split = () => {
      const s = readSel();
      if (!s) return;
      let d = live.current.doc(), at = s.a;
      if (!s.collapsed) ({ doc: d, caret: at } = t.deleteRange(d, s.a, s.b));
      const r = t.splitUnit(d, at.unit, at.off);
      live.current.apply(r.doc, r.caret);
    };

    const before = (e: InputEvent) => {
      const type = e.inputType;
      if (type === 'historyUndo' || type === 'historyRedo') { e.preventDefault(); if (type === 'historyUndo') live.current.undo(); else live.current.redo(); return; }
      if (type.startsWith('format') || type === 'insertFromDrop' || type === 'deleteByDrag' || type === 'insertLink' || type === 'insertFromPaste') { e.preventDefault(); return; }
      if (composing || type === 'insertCompositionText' || type === 'deleteCompositionText') return;
      const s = readSel();
      if (!s) { e.preventDefault(); return; }
      if (type === 'insertParagraph' || type === 'insertLineBreak') { e.preventDefault(); split(); return; }
      const doc = live.current.doc();
      if (s.a.unit !== s.b.unit) {
        e.preventDefault();
        let r = t.deleteRange(doc, s.a, s.b);
        if ((type === 'insertText' || type === 'insertReplacementText') && e.data) r = t.insertText(r.doc, r.caret, e.data);
        live.current.apply(r.doc, r.caret);
        return;
      }
      if (s.collapsed && type.startsWith('delete')) {
        const back = type.includes('Backward');
        const len = t.valueLen(t.getUnit(doc, s.a.unit));
        const r = back && s.a.off === 0 ? t.mergeBack(doc, s.a.unit) : !back && s.a.off >= len ? t.mergeForward(doc, s.a.unit) : undefined;
        if (r === undefined) return;
        e.preventDefault();
        if (r) live.current.apply(r.doc, r.caret);
      }
    };

    const paste = (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') ?? '';
      const s = readSel();
      if (!s || !text) return;
      let d = live.current.doc(), at = s.a;
      if (!s.collapsed) ({ doc: d, caret: at } = t.deleteRange(d, s.a, s.b));
      const r = t.insertText(d, at, text);
      live.current.apply(r.doc, r.caret);
    };

    const key = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
      if (mod && (k === 'b' || k === 'i')) {
        e.preventDefault();
        const r = formatSel(live.current.doc(), k === 'b' ? 'strong' : 'em');
        if (r) live.current.apply(r.doc, r.caret);
      } else if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) live.current.redo(); else live.current.undo(); }
      else if (e.key === 'Escape') { e.preventDefault(); live.current.exit(); }
      else if (e.key === 'Enter') { e.preventDefault(); split(); }
    };

    const input = (e: Event) => { if (!composing && !(e as InputEvent).isComposing) sync(); };
    const cstart = () => { composing = true; };
    const cend = () => { composing = false; sync(); };
    const drop = (e: DragEvent) => e.preventDefault();

    host.addEventListener('beforeinput', before);
    host.addEventListener('input', input);
    host.addEventListener('compositionstart', cstart);
    host.addEventListener('compositionend', cend);
    host.addEventListener('keydown', key);
    host.addEventListener('paste', paste);
    host.addEventListener('drop', drop);
    return () => {
      host.removeEventListener('beforeinput', before);
      host.removeEventListener('input', input);
      host.removeEventListener('compositionstart', cstart);
      host.removeEventListener('compositionend', cend);
      host.removeEventListener('keydown', key);
      host.removeEventListener('paste', paste);
      host.removeEventListener('drop', drop);
    };
  }, [ref, active]);
}
