import { useRef, useState } from 'react';
import type { Doc } from '@/lib/types';

/** 排版视图的撤销栈：竖向和横向两个视图共用一份，切换时不丢 */
export function useLayoutHistory(doc: Doc, setDoc: (fn: (d: Doc) => Doc) => void) {
  const past = useRef<Doc[]>([]);
  const future = useRef<Doc[]>([]);
  const [, bump] = useState(0);
  /** 改动：记进撤销栈（打字这类连续的小改动不记） */
  const commit = (next: Doc, history = true) => {
    if (history) { past.current.push(doc); if (past.current.length > 100) past.current.shift(); future.current = []; bump((n) => n + 1); }
    setDoc(() => next);
  };
  const undo = () => { const prev = past.current.pop(); if (!prev) return; future.current.push(doc); setDoc(() => prev); bump((n) => n + 1); };
  const redo = () => { const next = future.current.pop(); if (!next) return; past.current.push(doc); setDoc(() => next); bump((n) => n + 1); };
  return { commit, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
export type LayoutHistory = ReturnType<typeof useLayoutHistory>;
