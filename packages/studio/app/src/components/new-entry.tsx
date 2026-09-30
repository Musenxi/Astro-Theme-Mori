import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useProject, useRefresh } from '@/lib/hooks';
import { ID_RE, suggestId } from '@/lib/slug';
import type { Kind } from '@/lib/types';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { Field, Input } from './ui/input';
import { Select } from './ui/select';

/** 撰写：先起个标题、选个分类，然后进编辑器。地址名默认自动生成，需要时在“高级”里改 */
export function NewEntryDialog({ open, onOpenChange, kind: initial = 'post' }: { open: boolean; onOpenChange: (o: boolean) => void; kind?: Kind }) {
  const { data: project } = useProject();
  const refresh = useRefresh();
  const nav = useNavigate();
  const kind: Kind = initial === 'page' ? 'page' : 'post';
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [id, setId] = useState('');
  const [adv, setAdv] = useState(false);
  const [busy, setBusy] = useState(false);
  const taken = useMemo(() => [...(project?.entries.map((e) => e.id) ?? []), ...(project?.pages.map((p) => p.id) ?? [])], [project]);
  const cats = project?.config.categories ?? [];
  const finalId = adv && id ? id : suggestId(title, taken);
  const clash = taken.includes(finalId);

  const submit = async () => {
    if (!title.trim()) return toast.error('先起个标题');
    if (!ID_RE.test(finalId)) return toast.error('地址名只能用英文、数字、下划线和连字符');
    if (clash) return toast.error('这个地址名已经有了');
    setBusy(true);
    try {
      await api.createEntry(kind, { id: finalId, title: title.trim(), ...(kind !== 'page' ? { category: category || cats[0]?.id } : {}) });
      await refresh();
      onOpenChange(false);
      setTitle(''); setId(''); setAdv(false);
      nav(kind === 'page' ? `/pages/${finalId}` : `/posts/${finalId}`);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={kind === 'page' ? '新建页面' : '撰写'}>
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <Field label="标题"><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="标题" /></Field>
          {kind !== 'page' && (
            <Field label="分类"><Select value={category || cats[0]?.id} onValueChange={setCategory} options={cats.map((c) => ({ value: c.id, label: c.zh, hint: c.en }))} /></Field>
          )}
          <div className="mt-1 pl-[7.5rem]">
            <button type="button" onClick={() => setAdv(!adv)} className="text-[12px] text-ink-3 transition-colors hover:text-ink">{adv ? '收起' : '地址名'}：{finalId}</button>
          </div>
          {adv && (
            <Field label="地址名" hint={<>网址会是 <span className="mono">/{kind === 'page' ? '' : 'posts/'}{finalId}/</span>{clash && <span className="text-danger">　已经有了，换一个</span>}</>}>
              <Input value={id} onChange={(e) => setId(e.target.value.trim())} placeholder={suggestId(title, taken)} />
            </Field>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" variant="primary" disabled={busy || !title.trim() || clash}>{busy ? '创建中……' : '开始写'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
