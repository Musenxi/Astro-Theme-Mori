import { createContext, useContext } from 'react';
import type { Doc } from '@/lib/types';
import type { LayoutHistory } from './layout-history';
import type { Caret, EditApi } from './layout-text';

export type PlaceInfo = { n: number; block: string; label: string; lnglat: [number, number]; en?: string; date?: string };

/** 排版视图里各处共用的状态：文档、选中的块、是不是在改字 */
export interface LayoutCtx {
  doc: Doc;
  blocks: Doc[];
  /** 排版里的项（见 layout-ops 的 itemsOf） */
  its: Doc[];
  places: PlaceInfo[];
  axis: 'h' | 'v';
  rtl: boolean;
  zoom: string;
  sel: string | null;
  selected: Doc | null;
  select: (key: string | null) => void;
  /** 在改字（像 InDesign 的文字工具）：文字框都能打字，选中的块跟着光标走 */
  editing: boolean;
  /** 进入改字：at 是双击的位置，或者直接给光标 */
  startEdit: (key: string, at?: { x: number; y: number } | Caret) => void;
  stopEdit: () => void;
  commit: (next: Doc, history?: boolean) => void;
  hist: LayoutHistory;
  edit: EditApi;
  /** 光标所在的单元（改字时） */
  cursor: string | null;
  /** 打开图库，选中一张后回调 */
  pickImage: (fn: (src: string) => void) => void;
  remove: (b: Doc) => Promise<void>;
}

export const Ctx = createContext<LayoutCtx | null>(null);
export const useLayout = () => useContext(Ctx)!;
