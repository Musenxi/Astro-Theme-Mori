import { useEffect, useMemo, useRef, useState } from 'react';
import { Bold, Code, Heading2, Heading3, ImageIcon, Italic, Link2, List, MapPin, MessageSquareQuote, Quote } from 'lucide-react';
import { parsePlaceHref, placeHref, placesOf } from 'astro-mori/flow';
import { api } from '@/lib/api';
import { countWords, wan } from '@/lib/format';
import { useRefresh } from '@/lib/hooks';
import { fromMarkdown, toMarkdown } from '@/lib/mdsync.js';
import type { Doc } from '@/lib/types';
import { AssetDialog } from '@/components/asset-picker';
import { Tip } from '@/components/tip';
import { createEditor, type MdCommand, type MdEditor, type PlaceTarget } from './cm';
import { PlaceDialog, type PlaceForm } from './place-fields';

const TOOLS: Array<{ cmd: MdCommand | 'image' | 'note' | 'place'; label: string; icon: typeof Bold; key?: string; gap?: boolean }> = [
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
  { cmd: 'place', label: '地点', icon: MapPin },
];

/** 用 Markdown 写：一个大文本框，标题是第一行 `# 标题`；停笔 250ms 后解析成块，并保住没改动的块（和它们的划词引用评论） */
export function MarkdownView({ doc, setDoc }: { doc: Doc; setDoc: (fn: (d: Doc) => Doc) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const ed = useRef<MdEditor | null>(null);
  const initial = useRef(doc);
  const mine = useRef(''); // 上一次由这里解析出来的块：文章在别处（信息面板里改地点的坐标）改了，再把文本同步过来
  const refresh = useRefresh();
  const [lib, setLib] = useState(false);
  const [place, setPin] = useState<{ target: PlaceTarget; initial: PlaceForm; editing: boolean } | null>(null);
  const words = useMemo(() => countWords(doc), [doc]);

  useEffect(() => {
    let pending: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = () => {
      if (pending === null) return;
      const text = pending; pending = null;
      setDoc((d) => { const next = fromMarkdown(text, d); mine.current = JSON.stringify(next.blocks); return next; });
    };
    const editor = createEditor({
      parent: host.current!, doc: toMarkdown(initial.current), placeholder: '# 标题\n\n开始写……',
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

  useEffect(() => {
    const blocks = JSON.stringify(doc.blocks);
    if (!ed.current || blocks === mine.current) return;
    mine.current = blocks;
    const text = toMarkdown(doc);
    if (text !== ed.current.getText()) ed.current.setText(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.blocks]);

  const openPin = () => {
    const target = ed.current!.placeTarget();
    const m = target.href ? parsePlaceHref(target.href) : null;
    setPin({ target, editing: !!m, initial: { label: target.label, lnglat: m?.lnglat, en: m?.en, date: m?.date, region: m?.region } });
  };
  const run = (cmd: (typeof TOOLS)[number]['cmd']) => {
    if (cmd === 'image') setLib(true);
    else if (cmd === 'note') ed.current?.addNote();
    else if (cmd === 'place') openPin();
    else ed.current?.run(cmd);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-5 flex shrink-0 items-center gap-0.5 rounded-full bg-muted/70 px-2 py-1">
        {TOOLS.map((t) => {
          const label = t.label;
          return (
            <span key={t.cmd} className={t.gap ? 'ml-3' : ''}>
              <Tip label={t.key ? `${label}　${t.key}` : label}>
                <button type="button" aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={() => run(t.cmd)} className="grid h-7 w-7 place-items-center rounded-full text-soft-foreground transition-[background-color,color,transform] hover:bg-popover hover:text-foreground hover:shadow-soft active:scale-90">
                  <t.icon size={15} />
                </button>
              </Tip>
            </span>
          );
        })}
        <span className="mono ml-auto pr-2 text-11 text-muted-foreground">{wan(words)} 字 · {doc.blocks?.length ?? 0} 块</span>
      </div>
      <div ref={host} className="min-h-0 flex-1" />
      <PlaceDialog
        open={!!place} onOpenChange={(o) => { if (!o) { setPin(null); ed.current?.focus(); } }}
        reference={(placesOf(doc.blocks ?? []).at(-1) as { lnglat: number[] } | undefined)?.lnglat}
        initial={place?.initial ?? { label: '' }} editing={!!place?.editing}
        onSubmit={(v) => {
          const t = place!.target;
          ed.current?.replaceRange(t.from, t.to, `[${v.label.replace(/[[\]]/g, '')}](${placeHref({ lnglat: v.lnglat, en: v.en, date: v.date, region: v.region })})`);
          // 第一次标地点：地图跟着打开（不然标了也看不到）
          if (!doc.map && !placesOf(doc.blocks ?? []).length) setDoc((d) => (d.map ? d : { ...d, map: true }));
          setPin(null);
        }}
        onRemove={() => { const t = place!.target; ed.current?.replaceRange(t.from, t.to, t.label); setPin(null); }}
      />
      <AssetDialog open={lib} onOpenChange={setLib} onPick={(n) => { ed.current?.insertBlock(`![](${n})`); setLib(false); }} />
    </div>
  );
}
