import { useState } from 'react';
import { asSpans, compact, spansToText, textToSpans } from '@/lib/inline.js';
import { ImageField } from '@/components/asset-picker';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { Doc } from '@/lib/types';
import { InlineField } from './inline-field';

export const POST_BLOCKS: Array<{ type: string; label: string; prefix: string; make: () => Doc }> = [
  { type: 'p', label: '段落', prefix: 'b', make: () => ({ type: 'p', text: '' }) },
  { type: 'h', label: '标题', prefix: 'b', make: () => ({ type: 'h', level: 2, text: '' }) },
  { type: 'quote', label: '引用', prefix: 'b', make: () => ({ type: 'quote', text: '', writing: 'h' }) },
  { type: 'image', label: '图片', prefix: 'b', make: () => ({ type: 'image', alt: '', layout: 'wide' }) },
  { type: 'list', label: '列表', prefix: 'b', make: () => ({ type: 'list', items: [''] }) },
  { type: 'code', label: '代码', prefix: 'b', make: () => ({ type: 'code', code: '' }) },
];

const cap = (b: Doc) => b.text; // 让 lint 别抱怨

/** 普通文章 / 页面里一个块的编辑内容 */
/** travel：游记文字块里的一段——小标题只有一级、竖排由文字块决定，这两项不出现 */
export function PostBlockBody({ b, patch, travel }: { b: Doc; patch: (p: Doc) => void; travel?: boolean }) {
  switch (b.type) {
    case 'p':
      return <InlineField rows={3} value={cap(b)} onChange={(v) => patch({ text: v })} placeholder="正文" />;
    case 'h':
      return (
        <div className="flex items-start gap-2">
          {!travel && <Select className="w-24" value={String(b.level ?? 2)} onValueChange={(v) => patch({ level: +v })} options={[{ value: '2', label: '二级' }, { value: '3', label: '三级' }]} />}
          <div className="flex-1"><InlineField rows={1} value={b.text} onChange={(v) => patch({ text: v })} placeholder="标题" /></div>
        </div>
      );
    case 'quote':
      return (
        <div className="space-y-2">
          <InlineField rows={2} value={b.text} onChange={(v) => patch({ text: v })} placeholder="引文" />
          <div className={travel ? undefined : 'grid grid-cols-[1fr_8rem] gap-2'}>
            <Input value={b.cite ?? ''} onChange={(e) => patch({ cite: e.target.value || undefined })} placeholder="出处，如《考工记》" />
            {!travel && <Select value={b.writing ?? 'h'} onValueChange={(v) => patch({ writing: v })} options={[{ value: 'h', label: '横排' }, { value: 'v', label: '竖排' }]} />}
          </div>
        </div>
      );
    case 'image':
      return (
        <div className="space-y-2">
          <ImageField value={b.src} onChange={(v) => patch({ src: v })} optional={false} />
          <div className="grid grid-cols-[1fr_10rem] gap-2">
            <Input value={b.alt ?? ''} onChange={(e) => patch({ alt: e.target.value })} placeholder="替代文字（读屏用）" />
            <Select value={b.layout ?? 'wide'} onValueChange={(v) => patch({ layout: v })} options={[{ value: 'wide', label: '跨出正文栏' }, { value: 'inline', label: '与正文同宽' }]} />
          </div>
          <Input value={b.caption ?? ''} onChange={(e) => patch({ caption: e.target.value || undefined })} placeholder="图注" />
        </div>
      );
    case 'list':
      return <ListField b={b} patch={patch} />;
    case 'code':
      return (
        <div className="space-y-2">
          <Input className="w-40" value={b.lang ?? ''} onChange={(e) => patch({ lang: e.target.value || undefined })} placeholder="语言，如 ts" />
          <Textarea rows={6} value={b.code} spellCheck={false} onChange={(e) => patch({ code: e.target.value })} className="font-mono text-[12.5px] leading-[1.65] [tab-size:2] whitespace-pre" />
        </div>
      );
  }
  return <span className="text-ink-3">不认识的块类型 {String(b.type)}</span>;
}

function ListField({ b, patch }: { b: Doc; patch: (p: Doc) => void }) {
  const [text, setText] = useState(() => (b.items as unknown[]).map((it) => spansToText(asSpans(it))).join('\n'));
  return (
    <div className="space-y-2">
      <Textarea rows={4} value={text} placeholder="一行一项" onChange={(e) => { setText(e.target.value); patch({ items: e.target.value.split('\n').map((l) => compact(textToSpans(l))) }); }} />
      <Switch checked={!!b.ordered} onCheckedChange={(v) => patch({ ordered: v || undefined })} label="有序列表（1. 2. 3.）" />
    </div>
  );
}
