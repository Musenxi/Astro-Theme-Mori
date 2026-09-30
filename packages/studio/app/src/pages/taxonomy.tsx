import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useProject, useRefresh } from '@/lib/hooks';
import { ID_RE } from '@/lib/slug';
import type { Category } from '@/lib/types';
import { SortableItem, SortableList } from '@/editor/sortable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, useConfirm } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Body, Empty, PageHeader, Section } from '@/components/ui/page';

interface Row extends Category { key: string; orig: string | null }
let seq = 0;
const toRows = (cats: Category[]): Row[] => cats.map((c) => ({ ...c, key: `c${++seq}`, orig: c.id }));
const clean = (rows: Row[]) => rows.map(({ key: _k, orig: _o, ...c }) => ({ ...c, empty: c.empty || undefined, en: c.en ?? '' }));

export default function Taxonomy() {
  const { data: project } = useProject();
  const refresh = useRefresh();
  const confirm = useConfirm();
  const cats = project?.config.categories;
  const [rows, setRows] = useState<Row[]>([]);
  const saved = useMemo(() => JSON.stringify((cats ?? []).map((c) => ({ ...c, empty: c.empty || undefined, en: c.en ?? '' }))), [cats]);
  useEffect(() => { if (cats) setRows(toRows(cats)); }, [cats]);
  const dirty = JSON.stringify(clean(rows)) !== saved;
  const count = (id: string | null) => (id ? (project?.entries.filter((e) => e.category === id).length ?? 0) : 0);

  const put = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const add = () => { let k = rows.length + 1; while (rows.some((r) => r.id === 'c' + k)) k++; setRows([...rows, { key: `c${++seq}`, orig: null, id: 'c' + k, zh: '', en: '' }]); };
  const save = async () => {
    const bad = rows.find((r) => !ID_RE.test(r.id)); if (bad) return toast.error(`地址名「${bad.id}」只能用英文、数字、下划线和连字符`);
    if (rows.some((r) => !r.zh.trim())) return toast.error('每个分类都要有中文名');
    try {
      const renames = Object.fromEntries(rows.filter((r) => r.orig && r.orig !== r.id).map((r) => [r.orig!, r.id]));
      const r = await api.setCategories(clean(rows), renames);
      await refresh();
      toast.success(r.moved ? `已保存，并更新了 ${r.moved} 篇文章的分类` : '已保存');
    } catch (e) { toast.error((e as Error).message); }
  };
  const remove = async (r: Row) => {
    if (r.orig && count(r.orig) > 0) return toast.error('还有文章在用这个分类，先把它们改到别的分类');
    if (r.orig && !(await confirm({ title: `删除分类「${r.zh}」？`, description: '保存之后才会生效。', confirmLabel: '删除', danger: true }))) return;
    setRows(rows.filter((x) => x.key !== r.key));
  };

  return (
    <>
      <PageHeader title="分类 / 标签" actions={dirty && <><Button variant="ghost" onClick={() => cats && setRows(toRows(cats))}>放弃修改</Button><Button variant="primary" onClick={save}>保存</Button></>} />
      <Body>
        <Section title="分类">
          <SortableList items={rows} getId={(r) => r.key} onReorder={setRows}>
            <div className="space-y-1.5">
              {rows.map((r) => (
                <SortableItem key={r.key} id={r.key} className="rounded-xl">
                  {(handle) => (
                    <div className="flex items-center gap-2 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-ink/[.035]">
                      {handle}
                      <Input className="w-36" value={r.zh} placeholder="中文名" onChange={(e) => put(r.key, { zh: e.target.value })} />
                      <Input className="w-40" value={r.en ?? ''} placeholder="English" onChange={(e) => put(r.key, { en: e.target.value })} />
                      <Input className="mono w-36" value={r.id} title="网址里用的英文名；改它会同时更新用到它的文章" onChange={(e) => put(r.key, { id: e.target.value.trim() })} />
                      <span className="mono w-14 text-right text-ink-3">{count(r.orig)} 篇</span>
                      <Button variant="ghost" size="icon-sm" aria-label="删除分类" className="ml-auto" onClick={() => remove(r)}><Trash2 size={14} /></Button>
                    </div>
                  )}
                </SortableItem>
              ))}
            </div>
          </SortableList>
          <div className="mt-3 flex items-center gap-4">
            <Button variant="link" onClick={add}><Plus size={14} />添加分类</Button>
          </div>
        </Section>
        <TagSection />
      </Body>
    </>
  );
}

function TagSection() {
  const { data: project } = useProject();
  const refresh = useRefresh();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of project?.entries ?? []) for (const t of e.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'));
  }, [project?.entries]);
  const merging = editing !== null && name.trim() !== editing && tags.some(([t]) => t === name.trim());

  const rename = async (from: string, to: string | null) => {
    try { const r = await api.renameTag(from, to); await refresh(); setEditing(null); toast.success(`已更新 ${r.changed} 篇`); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Section title="标签" hint={`${tags.length} 个`}>
      {tags.length === 0 ? <Empty>还没有标签。</Empty> : (
        <div className="space-y-0.5">
          {tags.map(([t, n]) => (
            <div key={t} className="group flex items-center gap-4 rounded-xl px-3 py-2.5 transition-colors hover:bg-ink/[.045]">
              <span className="flex-1"><span className="rounded-full bg-ink/[.06] px-3 py-1 text-[13px]">{t}</span></span>
              <span className="mono text-ink-3">{n} 篇</span>
              <Button variant="ghost" size="sm" className="opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100" onClick={() => { setEditing(t); setName(t); }}>改名 / 合并</Button>
              <Button variant="danger" size="sm" className="opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100" onClick={async () => { if (await confirm({ title: `删除标签「${t}」？`, description: `会从 ${n} 篇文章里去掉这个标签。`, confirmLabel: '删除', danger: true })) void rename(t, null); }}>删除</Button>
            </div>
          ))}
        </div>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={`改名「${editing}」`}>
          <form onSubmit={(e) => { e.preventDefault(); if (editing && name.trim() && name.trim() !== editing) void rename(editing, name); }}>
            <Field label="新名字" hint={merging ? '已有这个标签，将合并' : undefined}><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <div className="mt-5 flex justify-end gap-2"><Button onClick={() => setEditing(null)}>取消</Button><Button type="submit" variant="primary" disabled={!name.trim() || name.trim() === editing}>{merging ? '合并' : '改名'}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </Section>
  );
}
