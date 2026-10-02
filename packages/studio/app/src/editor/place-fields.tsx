import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ModalContent } from '@/components/modal';
import { Field } from '@/components/field';
import { Input } from '@/components/ui/input';
import { formatLatLng, parseCoordinate, shortCodeOf } from '@/lib/places.js';

export interface PlaceValue { lnglat?: [number, number]; en?: string; date?: string }

/**
 * 坐标一格：写 “纬度, 经度”、Plus Code、Google 地图网址。写不对就标红，不改已有的值；输入时显示正在写的，离开输入框后显示整理过的。
 * Plus Code 短码带地名（MM68+JQ 世田谷区 东京都）时，先按地名查出参考点再补全；没带地名就拿 reference（附近的一个地点）补
 */
export function LatLngInput({ value, onChange, className, autoFocus, reference }: { value?: [number, number]; onChange: (ll: [number, number]) => void; className?: string; autoFocus?: boolean; reference?: number[] }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [state, setState] = useState<{ text: string; status: 'looking' | 'done' | 'failed' } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const seq = useRef(0);
  const ref = reference ?? value;
  const here = state && state.text === draft ? state.status : null;
  const bad = draft !== null && draft.trim() !== '' && here !== 'looking' && here !== 'done' && !parseCoordinate(draft, ref) && !(shortCodeOf(draft)?.locality && here === null);

  const type = (text: string) => {
    setDraft(text);
    clearTimeout(timer.current);
    const sc = shortCodeOf(text);
    if (sc?.locality) {
      // 有地名：等停笔再去查，查到的位置当参考点
      const mine = ++seq.current;
      setState({ text, status: 'looking' });
      timer.current = setTimeout(async () => {
        try {
          const g = await api.geocode(sc.locality);
          if (mine !== seq.current) return;
          const ll = parseCoordinate(sc.code, g.lnglat);
          if (!ll) throw new Error('这个码补不全');
          setState({ text, status: 'done' });
          onChange(ll);
        } catch (e) {
          if (mine !== seq.current) return;
          setState({ text, status: 'failed' });
          toast.error((e as Error).message);
        }
      }, 700);
      return;
    }
    seq.current++;
    setState(null);
    const ll = parseCoordinate(text, ref);
    if (ll) onChange(ll);
  };

  return (
    <Input
      className={className}
      autoFocus={autoFocus}
      value={draft ?? formatLatLng(value)}
      placeholder="纬度, 经度 / Plus Code"
      aria-invalid={bad || here === 'failed'}
      onChange={(e) => type(e.target.value)}
      onBlur={() => { if (here !== 'looking') setDraft(null); }}
    />
  );
}

/** 地点的细节：坐标、英文名、日期（地名就是正文里标住的那几个字） */
export function PlaceFields({ value, onChange, reference }: { value: PlaceValue; onChange: (patch: PlaceValue) => void; reference?: number[] }) {
  return (
    <div className="grid grid-cols-[1fr_1fr_5.5rem] gap-1.5">
      <LatLngInput value={value.lnglat} reference={reference} onChange={(lnglat) => onChange({ lnglat })} />
      <Input value={value.en ?? ''} placeholder="英文名" onChange={(e) => onChange({ en: e.target.value })} />
      <Input value={value.date ?? ''} placeholder="日期" onChange={(e) => onChange({ date: e.target.value })} />
    </div>
  );
}

export interface PlaceForm { label: string; lnglat?: [number, number]; en?: string; date?: string }

/** 在 Markdown 里把选中的文字设为地点，或修改光标所在的地点 */
export function PlaceDialog({ open, onOpenChange, initial, editing, onSubmit, onRemove, reference }: {
  reference?: number[]; open: boolean; onOpenChange: (o: boolean) => void; initial: PlaceForm; editing: boolean; onSubmit: (v: Required<Pick<PlaceForm, 'label' | 'lnglat'>> & PlaceForm) => void; onRemove: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 每次打开重新挂载，输入框的初始值才会跟着选中的文字走 */}
      {open && <PlaceDialogBody reference={reference} initial={initial} editing={editing} onSubmit={onSubmit} onRemove={onRemove} onCancel={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function PlaceDialogBody({ reference, initial, editing, onSubmit, onRemove, onCancel }: { reference?: number[]; initial: PlaceForm; editing: boolean; onSubmit: (v: Required<Pick<PlaceForm, 'label' | 'lnglat'>> & PlaceForm) => void; onRemove: () => void; onCancel: () => void }) {
  const [v, setV] = useState<PlaceForm>(initial);
  const ok = !!v.lnglat; // 地名可以不写：只让读到这里时地图跟着变
  const submit = () => { if (ok) onSubmit({ ...v, label: v.label.trim(), lnglat: v.lnglat! }); };
  return (
    <ModalContent title={editing ? '地点' : '设为地点'}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="地名"><Input placeholder="可不写" autoFocus={!v.label} value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} /></Field>
        <Field label="坐标"><LatLngInput autoFocus={!!v.label} reference={reference} value={v.lnglat} onChange={(lnglat) => setV({ ...v, lnglat })} /></Field>
        <Field label="英文名"><Input value={v.en ?? ''} onChange={(e) => setV({ ...v, en: e.target.value })} /></Field>
        <Field label="日期"><Input value={v.date ?? ''} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
        <div className="mt-4 flex items-center gap-2">
          {editing && <Button type="button" variant="ghost-danger" onClick={onRemove}>去掉地点</Button>}
          <span className="flex-1" />
          <Button type="button" onClick={onCancel}>取消</Button>
          <Button type="submit" variant="default" disabled={!ok}>确定</Button>
        </div>
      </form>
    </ModalContent>
  );
}
