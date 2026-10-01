import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type SaveResult } from '@/lib/api';
import type { Doc, Kind } from '@/lib/types';

export interface SaveState {
  status: 'saved' | 'dirty' | 'saving' | 'error';
  errors: SaveResult['errors'];
  warnings: NonNullable<SaveResult['annotationWarnings']>;
  message?: string;
  savedAt?: number;
}

/**
 * 自动保存：内容变了 700ms 后写回。校验问题不阻止保存（写作过程中难免不完整），只在界面上提示。
 * 离开页面前会把还没写的部分立刻写掉。
 */
export function useAutosave(kind: Kind, id: string, doc: Doc | null, onSaved?: () => void) {
  const [state, setState] = useState<SaveState>({ status: 'saved', errors: [], warnings: [] });
  const latest = useRef(doc);
  const dirty = useRef(false);
  const baseline = useRef(doc); // 刚读进来的那份：它不需要保存（严格模式下 effect 会多跑一遍，不能靠“第一次”判断）
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inflight = useRef(0);
  const cb = useRef(onSaved);
  cb.current = onSaved;
  latest.current = doc;

  /** 传了 next 就按它立刻保存（发布 / 转草稿时，状态还没来得及更新） */
  const flush = useCallback(async (next?: Doc) => {
    clearTimeout(timer.current);
    if (next) { latest.current = next; dirty.current = true; }
    if (!dirty.current || !latest.current) return;
    dirty.current = false;
    const seq = ++inflight.current;
    setState((s) => ({ ...s, status: 'saving' }));
    try {
      const r = await api.saveEntry(kind, id, latest.current);
      if (seq !== inflight.current) return;
      setState({ status: dirty.current ? 'dirty' : 'saved', errors: r.errors ?? [], warnings: r.annotationWarnings ?? [], savedAt: Date.now() });
      cb.current?.();
      return r;
    } catch (e) {
      if (seq !== inflight.current) return;
      dirty.current = true;
      setState((s) => ({ ...s, status: 'error', message: (e as Error).message }));
      return undefined;
    }
  }, [kind, id]);

  useEffect(() => {
    if (!doc) return;
    if (doc === baseline.current) return;
    dirty.current = true;
    setState((s) => (s.status === 'saving' ? s : { ...s, status: 'dirty' }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
    return () => clearTimeout(timer.current);
  }, [doc, flush]);

  // 换页 / 关页时把没存的存掉
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => { if (dirty.current) { void flush(); e.preventDefault(); } };
    addEventListener('beforeunload', beforeUnload);
    return () => { removeEventListener('beforeunload', beforeUnload); void flush(); };
  }, [flush]);

  return { state, flush };
}
