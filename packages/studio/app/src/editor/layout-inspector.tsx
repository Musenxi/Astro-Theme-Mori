/**
 * 排版视图右边的属性面板（InDesign 的“属性”面板）：选中什么就显示什么的设置，改了马上在版面上看到。
 *   没选中：整篇的结构，点一项选中它
 *   文字、标题：写法、对齐、位置；改字时多出段落样式和粗体斜体
 *   图片：版式、每张图的图注和替代文字、合并拆分
 */
import type { ReactNode } from 'react';
import { Bold, ImagePlus, Italic, Merge, Plus, RotateCcw, Split, Trash2, Type, X } from 'lucide-react';
import { assetUrl } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Doc } from '@/lib/types';
import * as ops from '@/lib/layout-ops.js';
import * as t from '@/lib/text-ops.js';
import { assetName } from '@/components/asset-picker';
import { NumInput } from '@/components/field';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLayout } from './layout-ctx';
import { InlineField } from './inline-field';
import { formatSel, readSel } from './layout-text';
import { NAMES, ToolBtn, blockPlain, r2, scalable, yOf } from './layout-view';

export function Inspector() {
  const L = useLayout();
  return (
    <aside className="w-68 shrink-0 overflow-y-auto rounded-2xl bg-muted/70 px-4 py-3.5 on-card">
      {L.selected ? <BlockPanel key={L.selected.key} b={L.selected} /> : <Outline />}
    </aside>
  );
}

/** 一行设置：左边名字，右边控件；stack 时控件另起一行占满宽 */
const Prop = ({ label, children, stack }: { label: string; children: ReactNode; stack?: boolean }) => (
  <div className={cn('flex py-0.5', stack ? 'flex-col gap-1.5 pt-1.5' : 'min-h-9 items-center gap-3')}>
    <span className="w-9 shrink-0 text-12 text-muted-foreground">{label}</span>
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
  </div>
);
const Section = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn('border-t border-border pt-2.5 mt-2.5 first:mt-0 first:border-t-0 first:pt-0', className)}>{children}</div>;

/** 一个项的简短名字：标题的字、文字的头几个字、图注 */
function labelOf(b: Doc) {
  if (ops.isTextItem(b)) return (b.blocks ?? []).map(blockPlain).join(' ').trim().slice(0, 40);
  if (b.type === 'map') return '';
  const ims = ops.imagesOf(b);
  return ims.map((i: Doc) => i.caption).filter(Boolean).join(' / ') || (ims.length > 1 ? `${ims.length} 张` : assetName(ims[0]?.src));
}

function Outline() {
  const { its, select } = useLayout();
  return (
    <>
      <h3 className="mb-2 flex items-baseline justify-between text-13 font-semibold">结构<span className="text-12 font-normal text-muted-foreground">{its.length} 块</span></h3>
      {!its.length && <p className="text-12-5 text-muted-foreground">还没有内容。</p>}
      <ol className="-mx-2">
        {its.map((b) => (
          <li key={b.key}>
            <button type="button" onClick={() => select(b.key)} className={cn('flex w-full items-baseline gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-foreground/[.06]', b.type === 'head' && 'mt-1.5')}>
              <span className="w-12 shrink-0 text-11-5 text-muted-foreground">{NAMES[b.type]}</span>
              <span className={cn('min-w-0 flex-1 truncate text-12-5', b.type === 'head' ? 'font-medium' : 'text-soft-foreground')}>{labelOf(b) || '—'}</span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

function BlockPanel({ b }: { b: Doc }) {
  const L = useLayout();
  const { doc, axis, commit } = L;
  const text = ops.isTextItem(b);
  const raw = doc.blocks?.find((x: Doc) => x.id === b.key) ?? b;
  const patch = (p: Doc) => commit(ops.patchBlock(doc, b.key, p));
  /** 打字式的改动（图注、替代文字）：连续的合成一步撤销 */
  const typePatch = (p: Doc) => L.edit.type(ops.patchBlock(L.edit.doc(), b.key, p));
  const place = (p: Doc) => commit(ops.setPlace(doc, b.key, p, axis));
  return (
    <>
      <div className="mb-2.5 flex min-h-8 items-center gap-2">
        <b className="text-13 font-semibold">{NAMES[b.type] ?? b.type}</b>
        {text && L.editing && <span className="text-12 text-muted-foreground">改字中</span>}
        <span className="ml-auto flex items-center">
          {text && (L.editing
            ? <Button size="sm" variant="ghost" onClick={L.stopEdit}>完成</Button>
            : <Button size="sm" variant="ghost" onClick={() => L.startEdit(b.key)}><Type size={14} />改字</Button>)}
          <ToolBtn label="删除" onClick={() => void L.remove(b)}><Trash2 size={14} /></ToolBtn>
        </span>
      </div>

      {text && L.editing && <TypeTools />}
      {text && <TextProps b={b} place={place} />}
      {b.type === 'map' && (
        <Section><Prop label="范围"><Segmented size="sm" value={b.scope ?? 'region'} onValueChange={(v) => patch({ scope: v })} options={[{ value: 'region', label: '所在区域' }, { value: 'route', label: '全程' }, { value: 'near', label: '这一处' }]} /></Prop></Section>
      )}
      {ops.isImageBlock(b) && <ImageProps b={raw} patch={patch} typePatch={typePatch} />}
      {axis === 'h' && <PlaceProps b={b} raw={raw} place={place} />}
    </>
  );
}

/* ───────────── 文字 ───────────── */

const STYLE_LABEL: Record<string, string> = { p: '正文', h2: '标题', h3: '小标题', quote: '引用' };

/** 改字时：光标所在那段的段落样式，选中的字的粗体斜体（按钮不抢走光标） */
function TypeTools() {
  const L = useLayout();
  const unit = L.cursor;
  const blk = unit ? L.doc.blocks?.find((x: Doc) => x.id === unit.split('/')[0]) : null;
  const style = t.styleOf(blk);
  const s = readSel();
  const spans = s && s.a.unit === s.b.unit ? t.getUnit(L.doc, s.a.unit) : null;
  const [a, z] = s ? [Math.min(s.a.off, s.b.off), Math.max(s.a.off, s.b.off)] : [0, 0];
  const on = (type: string) => !!spans && typeof spans !== 'string' && z > a && t.hasMark(spans, a, z, type);
  const setStyle = (v: string) => { const c = readSel(); if (blk) L.edit.apply(t.setStyle(L.doc, blk.id, v), c ? { ...c.a, focus: c.b } : null); };
  const mark = (type: string) => { const r = formatSel(L.doc, type); if (r) L.edit.apply(r.doc, r.caret); };
  return (
    // 按下时不让按钮拿走焦点：光标和选区留在文字里
    <Section className="pb-1">
      <div onMouseDownCapture={(e) => e.preventDefault()}>
        {blk && t.STYLES.includes(style) && (
          <Prop label="段落" stack><Segmented size="sm" value={style} onValueChange={setStyle} options={t.STYLES.map((v: string) => ({ value: v, label: STYLE_LABEL[v] }))} /></Prop>
        )}
        <Prop label="字">
          <ToolBtn label="粗体　⌘B" active={on('strong')} onClick={() => mark('strong')}><Bold size={14} /></ToolBtn>
          <ToolBtn label="斜体　⌘I" active={on('em')} onClick={() => mark('em')}><Italic size={14} /></ToolBtn>
        </Prop>
      </div>
    </Section>
  );
}

function TextProps({ b, place }: { b: Doc; place: (p: Doc) => void }) {
  const { axis } = useLayout();
  const writing = (axis === 'v' ? b.vwriting : b.writing) === 'v' ? 'v' : 'h';
  const vw = writing === 'v';
  const align = (axis === 'v' ? b.valign : b.align) ?? 'justify';
  const labels = vw ? ['上', '中', '下', '两端'] : ['左', '中', '右', '两端'];
  return (
    <Section>
      <Prop label="写法"><Segmented size="sm" value={writing} onValueChange={(v) => place({ writing: v })} options={[{ value: 'h', label: '横排' }, { value: 'v', label: '竖排' }]} /></Prop>
      <Prop label="对齐"><Segmented size="sm" value={align} onValueChange={(v) => place({ align: v })} options={labels.map((label, i) => ({ value: ['start', 'center', 'end', 'justify'][i], label }))} /></Prop>
      {axis === 'v' && vw && b.type === 'text' && (
        <Prop label="位置"><Segmented size="sm" value={b.vpos ?? 'end'} onValueChange={(v) => place({ pos: v })} options={[{ value: 'start', label: '靠左' }, { value: 'center', label: '居中' }, { value: 'end', label: '靠右' }]} /></Prop>
      )}
    </Section>
  );
}

/* ───────────── 横滚里的上下位置和大小 ───────────── */

function PlaceProps({ b, raw, place }: { b: Doc; raw: Doc; place: (p: Doc) => void }) {
  const follow = b.type === 'head' && b.lead && b.y === undefined;
  // 标题没设的位置、大小是跟着正文的，不算它自己的
  const own = b.type === 'head' ? raw.h?.y !== undefined || raw.h?.scale !== undefined : b.y !== undefined || b.scale !== undefined;
  const pct = (v?: number) => (v === undefined ? undefined : Math.round(v * 100));
  return (
    <Section>
      <Prop label="上下">
        <NumInput className="h-8 w-24" min={0} max={100} value={follow ? undefined : pct(b.y ?? yOf(b))} placeholder={follow ? '跟着正文' : undefined}
          onChange={(v) => place({ y: v === undefined ? undefined : r2(Math.min(100, Math.max(0, v)) / 100) })} />
        <span className="text-12 text-muted-foreground">%</span>
      </Prop>
      {scalable(b) && (
        <Prop label="大小">
          <NumInput className="h-8 w-24" min={30} max={160} value={pct(b.scale ?? 1)} onChange={(v) => place({ scale: v === undefined || v === 100 ? undefined : r2(Math.min(160, Math.max(30, v)) / 100) })} />
          <span className="text-12 text-muted-foreground">%</span>
        </Prop>
      )}
      {own && (
        <Prop label="">
          <Button size="sm" variant="ghost" className="-ml-3" onClick={() => place({ y: undefined, scale: undefined })}><RotateCcw size={13} />{b.type === 'head' && b.lead ? '回到正文旁' : '复位'}</Button>
        </Prop>
      )}
    </Section>
  );
}

/* ───────────── 图片 ───────────── */

function Thumb({ src, onClick }: { src?: string; onClick: () => void }) {
  const name = assetName(src);
  return (
    <button type="button" onClick={onClick} aria-label="更换" className="grid h-14 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground transition-[box-shadow] hover:ring-2 hover:ring-foreground/25">
      {name ? <img src={assetUrl(name, 160)} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={16} />}
    </button>
  );
}

function ImageProps({ b, patch, typePatch }: { b: Doc; patch: (p: Doc) => void; typePatch: (p: Doc) => void }) {
  const L = useLayout();
  const { doc, commit } = L;
  const layouts = ops.layoutsFor(b);
  // 每张图：单图就是块本身，图组 / 双图 / 网格是 images，自由排布是 items 里的图
  const list: Doc[] = b.type === 'image' ? [b] : b.type === 'free' ? (b.items ?? []).filter((it: Doc) => it.kind === 'image') : b.images ?? [];
  const put = (i: number, p: Doc, typed = false) => {
    const fn = typed ? typePatch : patch;
    if (b.type === 'image') return fn(p);
    if (b.type === 'free') { let k = -1; return fn({ items: b.items.map((it: Doc) => (it.kind === 'image' && ++k === i ? { ...it, ...p } : it)) }); }
    fn({ images: b.images.map((x: Doc, k: number) => (k === i ? { ...x, ...p } : x)) });
  };
  const drop = (i: number) => {
    if (b.type === 'free') { let k = -1; return patch({ items: b.items.filter((it: Doc) => !(it.kind === 'image' && ++k === i)) }); }
    patch({ images: b.images.filter((_: Doc, k: number) => k !== i) });
  };
  const add = () => L.pickImage((src) => {
    if (b.type === 'free') patch({ items: [...b.items, { kind: 'image', src, alt: '', x: 0.1, y: 0.1, w: 0.4, z: b.items.length + 1 }] });
    else patch({ images: [...b.images, { src, alt: '', ...(b.type === 'strip' ? { scale: 1, offset: 0 } : {}) }] });
  });
  const removable = (b.type === 'grid' || b.type === 'strip' || b.type === 'free') && list.length > 2;
  return (
    <>
      <Section>
        {b.type === 'image' && <Prop label="版式"><Segmented size="sm" value={b.layout === 'inline' ? 'inline' : 'wide'} onValueChange={(v) => patch({ layout: v })} options={[{ value: 'wide', label: '通栏' }, { value: 'inline', label: '内缩' }]} /></Prop>}
        {layouts.length > 0 && <Prop label="版式" stack={layouts.length > 3}><Segmented size="sm" value={b.type} onValueChange={(v) => commit(ops.setLayout(doc, b.id, v))} options={layouts.map((v: string) => ({ value: v, label: NAMES[v] }))} /></Prop>}
        {b.type === 'free' && <Prop label="比例"><NumInput className="h-8 w-24" min={0.2} step={0.1} value={b.ar} onChange={(v) => v && v >= 0.2 && patch({ ar: v })} /></Prop>}
      </Section>
      <Section className="space-y-2.5">
        {list.map((im, i) => (
          <div key={i} className="flex gap-2.5">
            <Thumb src={im.src} onClick={() => L.pickImage((src) => put(i, { src }))} />
            <div className="min-w-0 flex-1 space-y-1.5">
              {b.type !== 'free' && <Input className="h-8" placeholder="图注" value={im.caption ?? ''} onChange={(e) => put(i, { caption: e.target.value || undefined }, true)} />}
              <Input className="h-8" placeholder="替代文字" value={im.alt ?? ''} onChange={(e) => put(i, { alt: e.target.value }, true)} />
            </div>
            {removable && <button type="button" aria-label="移除这张" onClick={() => drop(i)} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[.06] hover:text-destructive"><X size={13} /></button>}
          </div>
        ))}
        {b.type === 'free' && (b.items ?? []).map((it: Doc, i: number) => it.kind === 'text' && (
          <div key={`t${i}`} className="flex gap-2.5">
            <InlineField className="min-w-0 flex-1" rows={1} value={it.text} placeholder="竖排小字" onChange={(v) => typePatch({ items: b.items.map((x: Doc, k: number) => (k === i ? { ...x, text: v } : x)) })} />
            <button type="button" aria-label="移除" onClick={() => patch({ items: b.items.filter((_: Doc, k: number) => k !== i) })} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[.06] hover:text-destructive"><X size={13} /></button>
          </div>
        ))}
        {b.type !== 'image' && b.type !== 'pair' && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="-ml-3" onClick={add}><Plus size={13} />图片</Button>
            {b.type === 'free' && <Button size="sm" variant="ghost" onClick={() => patch({ items: [...b.items, { kind: 'text', text: '', x: 0.85, y: 0.1 }] })}><Plus size={13} />竖排小字</Button>}
          </div>
        )}
      </Section>
      {(ops.canMergeNext(doc, b.id) || b.type !== 'image') && (
        <Section className="flex flex-wrap gap-1">
          {ops.canMergeNext(doc, b.id) && <Button size="sm" variant="ghost" className="-ml-3" onClick={() => commit(ops.mergeWithNext(doc, b.id))}><Merge size={14} />和后一块合并</Button>}
          {b.type !== 'image' && <Button size="sm" variant="ghost" className={cn(!ops.canMergeNext(doc, b.id) && '-ml-3')} onClick={() => commit(ops.split(doc, b.id))}><Split size={14} />拆成单图</Button>}
        </Section>
      )}
    </>
  );
}
