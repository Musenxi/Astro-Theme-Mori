import { useState } from 'react';
import type { Doc } from '@/lib/types';

/** 源码：直接编辑 JSON。语法有错时不保存，只提示；语法对了才走自动保存和校验 */
export function RawView({ doc, setDoc }: { doc: Doc; setDoc: (fn: (d: Doc) => Doc) => void }) {
  const [text, setText] = useState(() => JSON.stringify(doc, null, 2));
  const [err, setErr] = useState('');
  return (
    <div className="flex h-full min-h-0 flex-col">
      {err && <p className="shrink-0 border-b border-danger/40 bg-danger/5 px-8 py-2 text-[12.5px] text-danger">JSON 语法错误：{err}（修好之前不会保存）</p>}
      <textarea
        value={text} spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          try { const parsed = JSON.parse(e.target.value); setErr(''); setDoc(() => parsed); } catch (x) { setErr((x as Error).message); }
        }}
        className="min-h-0 flex-1 resize-none bg-transparent px-8 py-6 font-mono text-[12.5px] leading-[1.7] outline-none [tab-size:2]"
      />
    </div>
  );
}
