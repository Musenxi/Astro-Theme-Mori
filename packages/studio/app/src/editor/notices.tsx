import { AlertTriangle } from 'lucide-react';
import type { SaveState } from './use-autosave';

/** 保存后的提示：校验问题（不阻止保存）和“这次修改会让读者引用评论的原文找不到” */
export function Notices({ state }: { state: SaveState }) {
  const { errors, warnings } = state;
  if (!errors.length && !warnings.length) return null;
  return (
    <div className="mx-5 mb-2 max-h-[30vh] shrink-0 space-y-3 overflow-auto rounded-xl bg-sunk/70 px-5 py-3.5 text-[12.5px]">
      {errors.length > 0 && (
        <div className="flex gap-2.5">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />
          <div>
            <p className="text-danger">已保存，但有 {errors.length} 处需要检查：</p>
            <ul className="mt-1 space-y-0.5 text-ink-2">{errors.slice(0, 8).map((e, i) => <li key={i}><span className="mono text-ink-3">{e.path || '文章'}</span>　{e.message}</li>)}</ul>
            {errors.length > 8 && <p className="mt-1 text-ink-3">还有 {errors.length - 8} 处。</p>}
          </div>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="flex gap-2.5">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
          <div className="text-ink-2">
            <p className="text-warn">这次修改会让 {warnings.length} 条引用评论找不到原文：</p>
            <ul className="mt-1 space-y-0.5">{warnings.slice(0, 5).map((w) => <li key={w.id}>“{(w.quote ?? '').slice(0, 30)}{(w.quote ?? '').length > 30 ? '……' : ''}”</li>)}</ul>
            <p className="mt-1 text-ink-3">这些评论会在评论区里保留，引用旁标注“原文已修改”，点击不再跳转。想保留的话，把这段文字改回去。</p>
          </div>
        </div>
      )}
    </div>
  );
}
