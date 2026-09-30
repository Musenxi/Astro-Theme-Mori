import { useEffect, useMemo, useRef, useState } from 'react';
import { Bold, Code, Heading2, Heading3, ImageIcon, Italic, Link2, List, MessageSquareQuote, Quote } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { countWords, wan } from '@/lib/format';
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

/** 游记只有段落、图片和站点，没有小标题、引用、列表这些块——按钮留在原位（两边的工具栏一样），置灰 */
const TRAVEL_OFF = new Set(['h3', 'quote', 'list']);
const travelLabel = (t: (typeof TOOLS)[number]) => (t.cmd === 'h2' ? '新的一站' : TRAVEL_OFF.has(t.cmd) ? `${t.label}　游记里没有对应的块` : t.label);

/** 用 Markdown 写：一个大文本框，标题是第一行 `# 标题`；停笔 250ms 后解析成块，并保住没改动的块（和它们的划词批注） */
export function MarkdownView({ doc, setDoc, travel }: { doc: Doc; setDoc: (fn: (d: Doc) => Doc) => void; travel?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const ed = useRef<MdEditor | null>(null);
  const initial = useRef(doc);
  const refresh = useRefresh();
  const [lib, setLib] = useState(false);
  const words = useMemo(() => countWords(doc), [doc]);

  useEffect(() => {
    let pending: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = () => { if (pending !== null) { const text = pending; pending = null; setDoc((d) => fromMarkdown(text, d)); } };
    const editor = createEditor({
      parent: host.current!, doc: toMarkdown(initial.current), placeholder: travel ? '# 标题\n\n## 第一站\n\n开始写……' : '# 标题\n\n开始写……',
      // 新文章（正文还是空的）：光标放在标题后面的空行，直接接着写
      cursor: (initial.current.blocks ?? []).every((b: Doc) => b.type === 'p' && !JSON.stringify(b.text ?? '').replace(/["\[\]{}:,]|"t"/g, '').trim()) ? 'end' : 'start',
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
      <div className="mx-5 flex shrink-0 items-center gap-0.5 rounded-full bg-sunk/70 px-2 py-1">
        {TOOLS.map((t) => {
          const off = !!travel && TRAVEL_OFF.has(t.cmd);
          const label = travel ? travelLabel(t) : t.label;
          return (
            <span key={t.cmd} className={t.gap ? 'ml-3' : ''}>
              <Tip label={t.key ? `${label}　${t.key}` : label}>
                <button type="button" aria-label={label} aria-disabled={off || undefined} onMouseDown={(e) => e.preventDefault()} onClick={() => { if (!off) run(t.cmd); }}
                  className={cn('grid h-7 w-7 place-items-center rounded-full transition-[background-color,color,transform]', off ? 'cursor-default text-ink-3/50' : 'text-ink-2 hover:bg-lift hover:text-ink hover:shadow-soft active:scale-90')}>
                  <t.icon size={15} />
                </button>
              </Tip>
            </span>
          );
        })}
        <span className="mono ml-auto pr-2 text-[11px] text-ink-3">{wan(words)} 字 · {travel ? `${doc.stops?.length ?? 0} 站` : `${doc.blocks?.length ?? 0} 块`}</span>
      </div>
      <div ref={host} className="min-h-0 flex-1" />
      <AssetDialog open={lib} onOpenChange={setLib} onPick={(n) => { ed.current?.insertBlock(`![](${n})`); setLib(false); }} />
    </div>
  );
}
