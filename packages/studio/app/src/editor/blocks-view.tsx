import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { countWords, wan } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { onCard, Section } from '@/components/ui/page';
import { cn } from '@/lib/cn';
import type { Doc, Kind } from '@/lib/types';
import { allIds, nextId } from './ids';
import { InlineField } from './inline-field';
import { POST_BLOCKS, PostBlockBody } from './post-blocks';
import { SortableItem, SortableList } from './sortable';
import { TRAVEL_BLOCKS, TravelBlockBody, TravelHead } from './travel-blocks';

const LABEL: Record<string, string> = { p: '段落', h: '标题', quote: '引用', image: '图片', list: '列表', code: '代码', text: '文字', single: '单图', pair: '双图', strip: '图组', grid: '网格', free: '自由排布', map: '地图' };

/** 块视图：每个块一张卡，能拖动排序。文章、页面、游记共用；游记多站点 / 路线 / 位置参数 */
export function BlocksView({ kind, doc, patch, setDoc }: { kind: Kind; doc: Doc; patch: (p: Doc) => void; setDoc: (fn: (d: Doc) => Doc) => void }) {
  const confirm = useConfirm();
  const blocks: Doc[] = doc.blocks ?? [];
  const travel = kind === 'travel';
  const palette = travel ? TRAVEL_BLOCKS : POST_BLOCKS;
  const ids = useMemo(() => allIds(blocks), [blocks]);

  const setBlocks = (next: Doc[]) => patch({ blocks: next });
  const patchBlock = (id: string, p: Doc) => setDoc((d) => ({ ...d, blocks: (d.blocks ?? []).map((b: Doc) => (b.id === id ? { ...b, ...p } : b)) }));
  const add = (type: string) => {
    const def = palette.find((p) => p.type === type)!;
    const id = nextId(ids, def.prefix);
    const stop = travel ? blocks.at(-1)?.stop ?? doc.stops?.[0]?.id : undefined;
    const body = def.make();
    // 游记的文字块，段落 id 跟着块 id 走（引用评论靠它定位）
    if (travel && type === 'text') body.paras = [{ id: `${id}p1`, text: '' }];
    setBlocks([...blocks, { id, ...(stop ? { stop } : {}), ...body }]);
  };
  const remove = async (b: Doc) => {
    const empty = !JSON.stringify(b).replace(/["'{}[\]:,\s]|"?(id|type|text|stop|layout|writing|alt|level|paras|images|items)"?/g, '').length;
    if (!empty && !(await confirm({ title: '删除这个块？', description: '块里的内容会一起删掉。', confirmLabel: '删除', danger: true }))) return;
    setBlocks(blocks.filter((x) => x.id !== b.id));
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[46rem] px-8 pb-32 pt-6">
        <Input value={doc.title ?? ''} onChange={(e) => patch({ title: e.target.value })} placeholder="标题" className="serif h-auto rounded-xl bg-transparent px-3 py-2 text-[30px] font-medium leading-tight hover:bg-ink/[.035] focus:bg-transparent" />

        {travel && <TravelHead doc={doc} patch={patch} />}

        <Section title="正文" hint={`${wan(countWords(doc))} 字 · ${blocks.length} 个块`} className="mt-8">
          <SortableList items={blocks} getId={(b) => b.id} onReorder={setBlocks}>
            <div className="space-y-2">
              {blocks.map((b) => (
                <SortableItem key={b.id} id={b.id} className={cn('group/block rounded-2xl bg-sunk/50 transition-[background-color,box-shadow] hover:bg-sunk/80 focus-within:bg-sunk/80 focus-within:shadow-[0_0_0_1.5px_color-mix(in_srgb,var(--ink)_16%,transparent)]', onCard)}>
                  {(handle) => (
                    <>
                      <div className="flex items-center gap-1.5 px-1.5 pt-1.5">
                        {handle}
                        <span className="rounded-full bg-ink/[.06] px-2.5 py-px text-[12px] text-ink-2">{LABEL[b.type] ?? b.type}</span>
                        <span className="mono text-[10.5px] text-ink-3/80">{b.id}</span>
                        <span className="flex-1" />
                        <Button variant="ghost" size="icon-sm" aria-label="删除这个块" className="opacity-0 transition-opacity focus-visible:opacity-100 group-focus-within/block:opacity-100 group-hover/block:opacity-100" onClick={() => remove(b)}><Trash2 size={14} /></Button>
                      </div>
                      <div className="px-3.5 pb-3.5 pt-1.5">
                        {travel ? <TravelBlockBody b={b} patch={(p) => patchBlock(b.id, p)} doc={doc} ids={ids} /> : <PostBlockBody b={b} patch={(p) => patchBlock(b.id, p)} />}
                      </div>
                    </>
                  )}
                </SortableItem>
              ))}
            </div>
          </SortableList>
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="label mr-1">添加</span>
            {palette.map((p) => <Button key={p.type} variant="secondary" size="sm" className="rounded-full" onClick={() => add(p.type)}><Plus size={13} />{p.label}</Button>)}
          </div>
        </Section>

        <NotesEditor doc={doc} patch={patch} />
      </div>
    </div>
  );
}

/** 旁注与脚注的正文。正文里用 {文字|note:id}（旁注）或 {文字|fn:id}（脚注）引用；id 在这里定义 */
function NotesEditor({ doc, patch }: { doc: Doc; patch: (p: Doc) => void }) {
  const notes: Record<string, { text: unknown }> = doc.notes ?? {};
  const ids = Object.keys(notes);
  const put = (n: typeof notes) => patch({ notes: Object.keys(n).length ? n : undefined });
  const add = () => { let k = ids.length + 1; while (notes['n' + k]) k++; put({ ...notes, ['n' + k]: { text: '' } }); };
  const rename = (from: string, to: string) => {
    if (!to || to === from || notes[to] || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(to)) return;
    put(Object.fromEntries(Object.entries(notes).map(([k, v]) => [k === from ? to : k, v])));
  };
  return (
    <Section title="旁注与脚注">
      <div className="space-y-2">
        {ids.map((id) => (
          <div key={id} className="flex items-start gap-2">
            <Input className="mono w-20" defaultValue={id} onBlur={(e) => rename(id, e.target.value.trim())} />
            <div className="min-w-0 flex-1"><InlineField rows={1} value={notes[id].text} onChange={(v) => put({ ...notes, [id]: { text: v } })} /></div>
            <Button variant="ghost" size="icon-sm" aria-label="删除" onClick={() => { const { [id]: _drop, ...rest } = notes; put(rest); }}><Trash2 size={14} /></Button>
          </div>
        ))}
      </div>
      <Button variant="link" className="mt-2" onClick={add}><Plus size={14} />添加一条</Button>
    </Section>
  );
}
