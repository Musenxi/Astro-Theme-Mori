import { Plus, Trash2 } from 'lucide-react';
import { ImageField } from '@/components/asset-picker';
import { TagsInput } from '@/components/tags-input';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useProject } from '@/lib/hooks';
import { toArticle, toTravel } from '@/lib/template.js';
import type { Doc, Kind } from '@/lib/types';
import { RouteData } from './travel-blocks';

const Group = ({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) => (
  <section className="mt-8 first:mt-0">
    <h3 className="mb-2 flex min-h-6 items-center justify-between text-[14px] font-semibold">{title}{action}</h3>
    {children}
  </section>
);

/** 右侧“信息”面板：正文以外的一切——栏目、日期、摘要、封面、置顶…… */
export function InfoPanel({ kind, doc, set, setDoc }: { kind: Kind; doc: Doc; set: (patch: Doc) => void; setDoc: (fn: (d: Doc) => Doc) => void }) {
  const { data: project } = useProject();
  const confirm = useConfirm();
  const cats = project?.config.categories ?? [];
  const knownTags = [...new Set((project?.entries ?? []).flatMap((e) => e.tags))];

  if (kind === 'page') {
    return (
      <div className="p-6">
        <Group title="页面">
          <Field label="英文副题"><Input value={doc.subtitle ?? ''} onChange={(e) => set({ subtitle: e.target.value || undefined })} placeholder="About" /></Field>
          <Field label="摘要"><Textarea rows={2} value={doc.excerpt ?? ''} onChange={(e) => set({ excerpt: e.target.value })} /></Field>
          <Field label="版式">
            <Select value={doc.template ?? 'default'} onValueChange={(v) => set({ template: v })} options={[{ value: 'default', label: '普通页面' }, { value: 'friends', label: '友人帐' }]} />
          </Field>
          <Field label="评论"><Switch checked={!!doc.comments} onCheckedChange={(v) => set({ comments: v || undefined })} label="页面底部开放评论" /></Field>
          <Field label="草稿"><Switch checked={!!doc.draft} onCheckedChange={(v) => set({ draft: v || undefined })} /></Field>
        </Group>
      </div>
    );
  }

  const switchTemplate = async (to: string) => {
    if ((to === 'travel') === (kind === 'travel')) return;
    const ok = await confirm(to === 'travel'
      ? { title: '换成游记模版？', description: '正文里的二级标题会变成站点，段落和图片按站点编排；之后在“排版”里摆版式、在站点上填经纬度。段落沿用原来的编号，读者划词引用的评论不受影响。', confirmLabel: '换成游记' }
      : { title: '换成普通模版？', description: '站点会变成二级标题，图组、双图、自由排布里的图变成一张张图片，地图去掉。站点的经纬度会留在文件里，换回游记时按站名找回来。', confirmLabel: '换成普通文章' });
    if (ok) setDoc((d) => (to === 'travel' ? toTravel(d) : toArticle(d)));
  };
  const pin = doc.pin as Doc | undefined;
  const setPin = (patch: Doc) => set({ pin: { ...pin, ...patch } });
  return (
    <div className="p-6">
      <Group title="文章">
        <Field label="模版">
          <Segmented value={kind === 'travel' ? 'travel' : 'post'} onValueChange={(v) => void switchTemplate(v)} options={[{ value: 'post', label: '普通' }, { value: 'travel', label: '游记' }]} />
        </Field>
        <Field label="英文副题"><Input value={doc.subtitle ?? ''} onChange={(e) => set({ subtitle: e.target.value || undefined })} placeholder="Iceland, counter-clockwise" /></Field>
        <Field label="日期"><Input type="date" value={String(doc.date ?? '').slice(0, 10)} onChange={(e) => set({ date: e.target.value })} /></Field>
        <Field label="栏目">
          <Select value={doc.category || undefined} onValueChange={(v) => set({ category: v })} placeholder="选择栏目"
            options={[...(doc.category && !cats.some((c) => c.id === doc.category) ? [{ value: doc.category, label: doc.category }] : []), ...cats.map((c) => ({ value: c.id, label: c.zh, hint: c.en }))]} />
        </Field>
        <Field label="标签"><TagsInput value={doc.tags ?? []} onChange={(v) => set({ tags: v.length ? v : undefined })} known={knownTags} /></Field>
        <Field label="摘要"><Textarea rows={2} value={doc.excerpt ?? ''} onChange={(e) => set({ excerpt: e.target.value })} /></Field>
        <Field label="封面"><ImageField value={doc.cover} onChange={(v) => set({ cover: v })} /></Field>
        {doc.cover && <Field label="封面说明"><Input value={doc.coverAlt ?? ''} onChange={(e) => set({ coverAlt: e.target.value || undefined })} /></Field>}
        <Field label="草稿"><Switch checked={!!doc.draft} onCheckedChange={(v) => set({ draft: v || undefined })} /></Field>
      </Group>

      {kind === 'travel' ? <TravelExtras doc={doc} set={set} /> : null}

      <Group title="首页置顶" action={<Switch checked={!!pin} onCheckedChange={(v) => set({ pin: v ? { order: 0, quote: [''], caption: '', meta: [] } : undefined })} />}>
        {pin && (
          <>
            <Field label="顺序"><Input type="number" className="w-24" value={pin.order ?? 0} onChange={(e) => setPin({ order: +e.target.value })} /></Field>
            <Field label="开篇引文">
              <Textarea rows={3} value={(pin.quote ?? []).join('\n')} onChange={(e) => setPin({ quote: e.target.value.split('\n') })} onBlur={(e) => setPin({ quote: e.target.value.split('\n').filter((l) => l.trim()).length ? e.target.value.split('\n').filter((l) => l.trim()) : [''] })} />
            </Field>
            <Field label="图注"><Input value={pin.caption ?? ''} onChange={(e) => setPin({ caption: e.target.value })} placeholder="地点 · 日期 · 路线" /></Field>
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
            <Field label="淡出强度">
              <div className="flex items-center gap-3">
                <input type="range" min={0} max={1} step={0.05} value={pin.fade ?? 0.5} onChange={(e) => setPin({ fade: +e.target.value })} className="h-1 flex-1 accent-[var(--ink)]" />
                <span className="mono w-8 text-right text-ink-3">{(pin.fade ?? 0.5).toFixed(2)}</span>
              </div>
            </Field>
          </>
        )}
      </Group>
    </div>
  );
}

const MODES: Array<['v' | 'h' | 'mix', string]> = [['v', '竖向'], ['h', '横向'], ['mix', '混合']];

function TravelExtras({ doc, set }: { doc: Doc; set: (patch: Doc) => void }) {
  const r = doc.reading ?? { default: 'v', allowed: ['v', 'h', 'mix'], direction: 'ltr' };
  const put = (patch: Doc) => set({ reading: { ...r, ...patch } });
  const toggle = (m: 'v' | 'h' | 'mix') => {
    const has = r.allowed.includes(m);
    if (has && r.allowed.length === 1) return;
    const allowed = has ? r.allowed.filter((x: string) => x !== m) : [...r.allowed, m];
    put({ allowed, default: allowed.includes(r.default) ? r.default : allowed[0] });
  };
  const facts: Array<{ label: string; value: string }> = doc.facts ?? [];
  const setFacts = (f: typeof facts) => set({ facts: f });
  return (
    <>
      <Group title="读法">
        <Field label="允许读者选">
          <div className="flex gap-4 pt-1">
            {MODES.map(([m, n]) => (
              <label key={m} className="flex cursor-pointer items-center gap-1.5 text-[13px]"><input type="checkbox" checked={r.allowed.includes(m)} onChange={() => toggle(m)} className="accent-[var(--ink)]" />{n}</label>
            ))}
          </div>
        </Field>
        <Field label="默认"><Select value={r.default} onValueChange={(v) => put({ default: v })} options={MODES.filter(([m]) => r.allowed.includes(m)).map(([m, n]) => ({ value: m, label: n }))} /></Field>
        <Field label="横滚方向"><Select value={r.direction} onValueChange={(v) => put({ direction: v })} options={[{ value: 'ltr', label: '左 → 右' }, { value: 'rtl', label: '右 → 左（手卷）' }]} /></Field>
      </Group>
      <Group title="路线"><RouteData doc={doc} patch={set} /></Group>
      <Group title="事实">
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
      </Group>
    </>
  );
}
