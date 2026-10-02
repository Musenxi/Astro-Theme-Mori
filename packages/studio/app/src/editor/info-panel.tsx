import { Plus, Trash2 } from 'lucide-react';
import { ImageField } from '@/components/asset-picker';
import { TagsInput } from '@/components/tags-input';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Segmented } from '@/components/segmented';
import { OptionSelect } from '@/components/option-select';
import { SwitchField } from '@/components/switch-field';
import { useProject } from '@/lib/hooks';
import { editPlace, removePlace } from '@/lib/places.js';
import type { Doc, Kind } from '@/lib/types';
import { placesOf } from 'astro-mori/flow';
import { PlaceFields } from './place-fields';
import { RouteData } from './layout-blocks';

const Group = ({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) => (
  <section className="mt-8 first:mt-0">
    <h3 className="mb-2 flex min-h-6 items-center justify-between text-14 font-semibold">{title}{action}</h3>
    {children}
  </section>
);

const VISIBILITY = [{ value: 'public', label: '公开' }, { value: 'hidden', label: '隐藏' }, { value: 'draft', label: '草稿' }];
const visibilityOf = (doc: Doc) => (doc.draft ? 'draft' : doc.hidden ? 'hidden' : 'public');

/**
 * 右侧“信息”面板：正文以外的一切——分类、日期、摘要、封面、读法、地图、置顶……
 * set 改文章的设置（不自动保存，点保存才写）；edit 改正文（地点在正文里，和打字一样自动保存）
 */
export function InfoPanel({ kind, doc, set, edit }: { kind: Kind; doc: Doc; set: (patch: Doc) => void; edit: (fn: (d: Doc) => Doc) => void }) {
  const { data: project } = useProject();
  const cats = project?.config.categories ?? [];
  const knownTags = [...new Set((project?.entries ?? []).flatMap((e) => e.tags))];

  if (kind === 'page') {
    return (
      <div className="p-6">
        <Group title="页面">
          <Field label="副标题"><Input value={doc.subtitle ?? ''} onChange={(e) => set({ subtitle: e.target.value || undefined })} /></Field>
          <Field label="摘要"><Textarea rows={2} value={doc.excerpt ?? ''} onChange={(e) => set({ excerpt: e.target.value })} /></Field>
          <Field label="版式">
            <OptionSelect value={doc.template ?? 'default'} onValueChange={(v) => set({ template: v })} options={[{ value: 'default', label: '普通页面' }, { value: 'friends', label: '友人帐' }]} />
          </Field>
          <Field label="评论"><SwitchField checked={!!doc.comments} onCheckedChange={(v) => set({ comments: v || undefined })} label="页面底部开放评论" /></Field>
          <Field label="公开度"><Segmented value={visibilityOf(doc)} onValueChange={(v) => set({ draft: v === 'draft' ? true : undefined, hidden: v === 'hidden' ? true : undefined })} options={VISIBILITY} /></Field>
        </Group>
      </div>
    );
  }

  const pin = doc.pin as Doc | undefined;
  const setPin = (patch: Doc) => set({ pin: { ...pin, ...patch } });
  return (
    <div className="p-6">
      <Group title="文章">
        <Field label="副标题"><Input value={doc.subtitle ?? ''} onChange={(e) => set({ subtitle: e.target.value || undefined })} /></Field>
        <Field label="公开度"><Segmented value={visibilityOf(doc)} onValueChange={(v) => set({ draft: v === 'draft' ? true : undefined, hidden: v === 'hidden' ? true : undefined })} options={VISIBILITY} /></Field>
        {project?.comments.provider === 'mori' && (
          <Field label="评论">
            <OptionSelect value={doc.comments ?? 'inherit'} onValueChange={(v) => set({ comments: v === 'inherit' ? undefined : v })} options={[{ value: 'inherit', label: '跟随站点' }, { value: 'on', label: '开启' }, { value: 'readonly', label: '禁用，显示历史评论' }, { value: 'off', label: '禁用，不显示' }]} />
          </Field>
        )}
        <Field label="日期"><Input type="date" value={String(doc.date ?? '').slice(0, 10)} onChange={(e) => set({ date: e.target.value })} /></Field>
        <Field label="分类">
          <OptionSelect value={doc.category || undefined} onValueChange={(v) => set({ category: v })} placeholder="选择分类"
            options={[...(doc.category && !cats.some((c) => c.id === doc.category) ? [{ value: doc.category, label: doc.category }] : []), ...cats.map((c) => ({ value: c.id, label: c.zh, hint: c.en }))]} />
        </Field>
        <Field label="标签"><TagsInput value={doc.tags ?? []} onChange={(v) => set({ tags: v.length ? v : undefined })} known={knownTags} /></Field>
        <Field label="摘要"><Textarea rows={2} value={doc.excerpt ?? ''} onChange={(e) => set({ excerpt: e.target.value })} /></Field>
        <Field label="封面"><ImageField value={doc.cover} onChange={(v) => set({ cover: v })} /></Field>
        {doc.cover && <Field label="封面说明"><Input value={doc.coverAlt ?? ''} onChange={(e) => set({ coverAlt: e.target.value || undefined })} /></Field>}
      </Group>

      <ReadingGroup doc={doc} set={set} />
      <MapGroup doc={doc} set={set} edit={edit} />

      <Group title="首页置顶" action={<SwitchField checked={!!pin} onCheckedChange={(v) => set({ pin: v ? { order: 0, quote: [''], caption: '', meta: [] } : undefined })} />}>
        {pin && (
          <>
            <Field label="顺序"><Input type="number" min={0} max={99} step={1} className="w-24" value={pin.order ?? 0} onChange={(e) => setPin({ order: Math.min(99, Math.max(0, Math.round(+e.target.value) || 0)) })} /></Field>
            <Field label="开篇引文">
              <Textarea rows={3} value={(pin.quote ?? []).join('\n')} onChange={(e) => setPin({ quote: e.target.value.split('\n') })} onBlur={(e) => setPin({ quote: e.target.value.split('\n').filter((l) => l.trim()).length ? e.target.value.split('\n').filter((l) => l.trim()) : [''] })} />
            </Field>
            <Field label="图注"><Input value={pin.caption ?? ''} onChange={(e) => setPin({ caption: e.target.value })} /></Field>
            <Field label="三条信息">
              <div className="space-y-1.5">
                {(pin.meta ?? []).map((m: { label: string; value: string }, i: number) => (
                  <div key={i} className="flex gap-1.5">
                    <Input className="w-20" value={m.label} placeholder="标签" onChange={(e) => setPin({ meta: pin.meta.map((x: Doc, k: number) => (k === i ? { ...x, label: e.target.value } : x)) })} />
                    <Input value={m.value} placeholder="内容" onChange={(e) => setPin({ meta: pin.meta.map((x: Doc, k: number) => (k === i ? { ...x, value: e.target.value } : x)) })} />
                    <Button variant="ghost" size="icon-sm" aria-label="删除" onClick={() => setPin({ meta: pin.meta.filter((_: unknown, k: number) => k !== i) })}><Trash2 size={14} /></Button>
                  </div>
                ))}
                {(pin.meta ?? []).length < 3 && <Button variant="link" onClick={() => setPin({ meta: [...(pin.meta ?? []), { label: '', value: '' }] })}><Plus size={14} />添加一条</Button>}
              </div>
            </Field>
            <Field label="封面图"><ImageField value={pin.image} onChange={(v) => setPin({ image: v })} /></Field>
            <Field label="图片说明"><Input value={pin.alt ?? ''} onChange={(e) => setPin({ alt: e.target.value || undefined })} /></Field>
          </>
        )}
      </Group>
    </div>
  );
}

const MODES: Array<['v' | 'h' | 'mix', string]> = [['v', '竖向'], ['h', '横向'], ['mix', '混合']];
type Mode = 'v' | 'h' | 'mix';
const VERTICAL_ONLY = { default: 'v', allowed: ['v'], direction: 'ltr' };

/** 读法：每篇都能开横滚。只允许竖向就是普通文章，不写 reading */
function ReadingGroup({ doc, set }: { doc: Doc; set: (patch: Doc) => void }) {
  const r = doc.reading ?? VERTICAL_ONLY;
  const put = (patch: Doc) => {
    const next = { ...r, ...patch };
    const plain = next.allowed.length === 1 && next.allowed[0] === 'v' && next.direction === 'ltr';
    set({ reading: plain ? undefined : next });
  };
  const toggle = (m: Mode) => {
    const has = r.allowed.includes(m);
    if (has && r.allowed.length === 1) return;
    const allowed = MODES.map(([x]) => x).filter((x) => (x === m ? !has : r.allowed.includes(x)));
    put({ allowed, default: allowed.includes(r.default) ? r.default : allowed[0] });
  };
  const flow = r.allowed.some((m: Mode) => m !== 'v');
  return (
    <Group title="读法">
      <Field label="允许读者选">
        <div className="flex gap-4 pt-1">
          {MODES.map(([m, n]) => (
            <label key={m} className="flex cursor-pointer items-center gap-1.5 text-13"><input type="checkbox" checked={r.allowed.includes(m)} onChange={() => toggle(m)} className="accent-foreground" />{n}</label>
          ))}
        </div>
      </Field>
      {r.allowed.length > 1 && <Field label="默认"><OptionSelect value={r.default} onValueChange={(v) => put({ default: v })} options={MODES.filter(([m]) => r.allowed.includes(m)).map(([m, n]) => ({ value: m, label: n }))} /></Field>}
      {flow && <Field label="横滚方向"><OptionSelect value={r.direction} onValueChange={(v) => put({ direction: v })} options={[{ value: 'ltr', label: '左 → 右' }, { value: 'rtl', label: '右 → 左（手卷）' }]} /></Field>}
    </Group>
  );
}

type MapPart = 'hero' | 'here' | 'itinerary';
const MAP_PARTS: Array<[MapPart, string]> = [['hero', '封面路线图'], ['here', '左下角当前位置'], ['itinerary', '文末行程表']];

/** 地图：开关。开了以后封面有路线图、左下角显示读到哪里、文末有行程表；地点在正文里标 */
function MapGroup({ doc, set, edit }: { doc: Doc; set: (patch: Doc) => void; edit: (fn: (d: Doc) => Doc) => void }) {
  const facts: Array<{ label: string; value: string }> = doc.facts ?? [];
  const setFacts = (f: typeof facts) => set({ facts: f.length ? f : undefined });
  const view: Record<MapPart, boolean> = { hero: true, here: true, itinerary: true, ...doc.mapView };
  // 三项都显示就不写 mapView
  const setView = (k: MapPart, on: boolean) => {
    const next = { ...view, [k]: on };
    set({ mapView: Object.values(next).every(Boolean) ? undefined : next });
  };
  return (
    <Group title="地图" action={<SwitchField checked={!!doc.map} onCheckedChange={(v) => set({ map: v || undefined })} />}>
      {doc.map && (
        <>
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5">
            {MAP_PARTS.map(([k, n]) => (
              <label key={k} className="flex cursor-pointer items-center gap-1.5 text-13"><input type="checkbox" checked={view[k]} onChange={() => setView(k, !view[k])} className="accent-foreground" />{n}</label>
            ))}
          </div>
          <PlaceList doc={doc} edit={edit} />
          <div className="mt-5"><RouteData doc={doc} set={set} edit={edit} /></div>
          <h4 className="mb-1 mt-5 text-13 font-medium">事实</h4>
          <div className="space-y-1.5 py-1">
            {facts.map((f, i) => (
              <div key={i} className="flex gap-1.5">
                <Input className="w-20" value={f.label} placeholder="标签" onChange={(e) => setFacts(facts.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
                <Input value={f.value} placeholder="内容" onChange={(e) => setFacts(facts.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} />
                <Button variant="ghost" size="icon-sm" aria-label="删除" onClick={() => setFacts(facts.filter((_, k) => k !== i))}><Trash2 size={14} /></Button>
              </div>
            ))}
            <Button variant="link" onClick={() => setFacts([...facts, { label: '', value: '' }])}><Plus size={14} />添加一条</Button>
          </div>
        </>
      )}
    </Group>
  );
}

/** 正文里标出的地点，按出现顺序。地名是标住的那几个字，在 Markdown 里改；这里改坐标、英文名、日期 */
function PlaceList({ doc, edit }: { doc: Doc; edit: (fn: (d: Doc) => Doc) => void }) {
  const places = placesOf(doc.blocks ?? []) as Array<{ n: number; label: string; lnglat: [number, number]; en?: string; date?: string; region?: 'new' | 'same' }>;
  if (!places.length) return <p className="text-12 text-muted-foreground">还没有地点。</p>;
  return (
    <div className="space-y-3">
      {places.map((p) => (
        <div key={p.n}>
          <div className="mb-1 flex items-center gap-2">
            <span className="mono w-5 text-11 text-muted-foreground">{String(p.n + 1).padStart(2, '0')}</span>
            <span className={`min-w-0 flex-1 truncate text-13 ${p.label.trim() ? 'font-medium' : 'text-muted-foreground'}`}>{p.label.trim() || p.en || '无地名'}</span>
            <Button variant="ghost" size="icon-sm" aria-label="去掉地点" onClick={() => edit((d) => removePlace(d, p.n))}><Trash2 size={14} /></Button>
          </div>
          <PlaceFields reference={places[p.n - 1]?.lnglat} value={p} onChange={(patch) => edit((d) => editPlace(d, p.n, patch))} />
        </div>
      ))}
    </div>
  );
}
