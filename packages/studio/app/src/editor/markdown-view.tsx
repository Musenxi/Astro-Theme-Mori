import { useEffect, useRef, useState } from 'react';
import { Bold, Code, Heading2, Heading3, ImageIcon, Italic, Link2, List, MessageSquareQuote, Quote } from 'lucide-react';
import { api } from '@/lib/api';
import { useRefresh } from '@/lib/hooks';
import { fromMarkdown, toMarkdown } from '@/lib/mdsync.js';
import type { Doc } from '@/lib/types';
import { AssetDialog } from '@/components/asset-picker';
import { Tip } from '@/components/ui/tooltip';
import { createEditor, type MdCommand, type MdEditor } from './cm';

const TOOLS: Array<{ cmd: MdCommand | 'image' | 'note'; label: string; icon: typeof Bold; key?: string; gap?: boolean }> = [
  { cmd: 'bold', label: '粗体', icon: Bold, key: '⌘B' },
  { cmd: 'italic', label: '斜体', icon: Italic, key: '⌘I' },
  { cmd: 'link', label: '链接', icon: Link2, key: '⌘K' },
  { cmd: 'code', label: '行内代码', icon: Code },
  { cmd: 'h2', label: '大标题', icon: Heading2, gap: true },
  { cmd: 'h3', label: '小标题', icon: Heading3 },
  { cmd: 'quote', label: '引用', icon: Quote },
  { cmd: 'list', label: '列表', icon: List },
  { cmd: 'image', label: '插入图片', icon: ImageIcon, gap: true },
  { cmd: 'note', label: '旁注', icon: MessageSquareQuote },
];

/** 用 Markdown 写：一个大文本框，标题是第一行 `# 标题`；停笔 250ms 后解析成块，并保住没改动的块（和它们的划词批注） */
export function MarkdownView({ doc, setDoc }: { doc: Doc; setDoc: (fn: (d: Doc) => Doc) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const ed = useRef<MdEditor | null>(null);
  const initial = useRef(doc);
  const refresh = useRefresh();
  const [lib, setLib] = useState(false);

  useEffect(() => {
    let pending: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = () => { if (pending !== null) { const text = pending; pending = null; setDoc((d) => fromMarkdown(text, d)); } };
    const editor = createEditor({
      parent: host.current!, doc: toMarkdown(initial.current), placeholder: '# 标题\n\n开始写……',
      onChange: (text) => { pending = text; clearTimeout(timer); timer = setTimeout(apply, 250); },
      onImages: async (files) => { const names: string[] = []; for (const f of files) names.push((await api.upload(f)).name); await refresh(); return names; },
    });
    ed.current = editor;
    editor.focus();
    return () => { clearTimeout(timer); apply(); editor.destroy(); ed.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = (cmd: (typeof TOOLS)[number]['cmd']) => {
    if (cmd === 'image') setLib(true);
    else if (cmd === 'note') ed.current?.addNote();
    else ed.current?.run(cmd);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-0.5 border-b border-rule px-6 py-1.5">
        {TOOLS.map((t) => (
          <span key={t.cmd} className={t.gap ? 'ml-3 border-l border-rule pl-3' : ''}>
            <Tip label={t.key ? `${t.label}　${t.key}` : t.label}>
              <button type="button" aria-label={t.label} onMouseDown={(e) => e.preventDefault()} onClick={() => run(t.cmd)} className="grid h-7 w-7 place-items-center rounded-sm text-ink-3 transition-colors hover:bg-sunk hover:text-ink active:translate-y-px">
                <t.icon size={15} />
              </button>
            </Tip>
          </span>
        ))}
        <span className="mono ml-auto text-[11px] text-ink-3">{doc.blocks?.length ?? 0} 块</span>
      </div>
      <div ref={host} className="min-h-0 flex-1" />
      <AssetDialog open={lib} onOpenChange={setLib} onPick={(n) => { ed.current?.insertBlock(`![](${n})`); setLib(false); }} />
    </div>
  );
}
