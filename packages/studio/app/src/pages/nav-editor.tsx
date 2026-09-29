import { useEffect, useMemo, useState } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useProject, useRefresh } from '@/lib/hooks';
import type { NavItem } from '@/lib/types';
import { SortableItem, SortableList } from '@/editor/sortable';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/dialog';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { Body, PageHeader, Section } from '@/components/ui/page';

interface Row extends NavItem { key: string }
let seq = 0;
const withKeys = (items: NavItem[]): Row[] => items.map((n) => ({ ...n, key: `n${++seq}` }));
const plain = (rows: Row[]) => rows.map(({ label, href }) => ({ label: label.trim(), href: href.trim() }));

/** 网站顶部玻璃胶囊里的入口：内置页、栏目、你的页面，或者任意链接；拖动排序 */
export default function NavEditor() {
  const { data: project } = useProject();
  const refresh = useRefresh();
  const confirm = useConfirm();
  const custom = project?.config.nav ?? null;

  // 没设定过时，显示的是默认：文章、归档、再加上所有已发布的页面
  const defaults = useMemo<NavItem[]>(() => [{ label: '文章', href: '/posts/' }, { label: '归档', href: '/archive/' }, ...(project?.pages ?? []).filter((p) => !p.draft).map((p) => ({ label: p.title, href: `/${p.id}/` }))], [project?.pages]);
  const effective = custom ?? defaults;
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => { setRows(withKeys(effective)); }, [JSON.stringify(effective)]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(plain(rows)) !== JSON.stringify(effective);

  const candidates = useMemo(() => [
    { group: '内置', label: '文章', href: '/posts/' }, { group: '内置', label: '归档', href: '/archive/' }, { group: '内置', label: '搜索', href: '/search/' },
    ...(project?.config.categories ?? []).map((c) => ({ group: '栏目', label: c.zh, href: `/category/${c.id}/` })),
    ...(project?.pages ?? []).map((p) => ({ group: '页面', label: p.title, href: `/${p.id}/` })),
  ], [project]);
  const available = candidates.filter((c) => !rows.some((r) => r.href === c.href));

  const put = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const add = (n: NavItem) => setRows((rs) => [...rs, ...withKeys([n])]);
  const save = async () => {
    if (rows.some((r) => !r.label.trim())) return toast.error('每个入口都要有名字');
    try { await api.setNav(plain(rows)); await refresh(); toast.success('已保存'); } catch (e) { toast.error((e as Error).message); }
  };
  const reset = async () => {
    if (!(await confirm({ title: '恢复默认？', description: '页头会回到“文章、归档，再加上所有已发布的页面”。', confirmLabel: '恢复默认' }))) return;
    try { await api.setNav(null); await refresh(); toast.success('已恢复默认'); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <>
      <PageHeader title="页头入口" actions={<>
        {custom && !dirty && <Button variant="ghost" onClick={reset}><RotateCcw size={14} />恢复默认</Button>}
        {dirty && <><Button variant="ghost" onClick={() => setRows(withKeys(effective))}>放弃修改</Button><Button variant="primary" onClick={save}>保存</Button></>}
      </>} />
      <Body>
        <p className="mb-6 max-w-xl text-[12.5px] leading-relaxed text-ink-3">网站顶部那颗玻璃胶囊里放哪些入口，由你决定。{!custom && '现在用的是默认：文章、归档，再加上所有已发布的页面；改动保存之后就完全按你的设置来。'}</p>

        <div className="mb-8 flex justify-center border border-rule bg-sunk/40 py-8">
          <div className="flex items-center gap-1 rounded-full border border-rule-2 bg-surface/70 p-1 backdrop-blur">
            {rows.length ? rows.map((r, i) => <span key={r.key} className={i === 0 ? 'rounded-full bg-sunk px-3.5 py-1 text-[13px] tracking-[.14em]' : 'px-3.5 py-1 text-[13px] tracking-[.14em] text-ink-2'}>{r.label || '·'}</span>) : <span className="px-3.5 py-1 text-ink-3">空</span>}
          </div>
        </div>

        <Section title="入口" hint="拖动排序 · 最多 10 个">
          <SortableList items={rows} getId={(r) => r.key} onReorder={setRows}>
            <div className="mt-2 border-t border-rule">
              {rows.map((r) => {
                const known = candidates.find((c) => c.href === r.href);
                return (
                  <SortableItem key={r.key} id={r.key} className="border-b border-rule bg-paper">
                    {(handle) => (
                      <div className="flex items-center gap-2 py-2">
                        {handle}
                        <Input className="w-40" value={r.label} placeholder="名字" onChange={(e) => put(r.key, { label: e.target.value })} />
                        {known ? <span className="mono flex-1 truncate text-ink-3">{r.href}<span className="ml-2 text-[10.5px]">{known.group}</span></span> : <Input className="mono flex-1" value={r.href} placeholder="/about/ 或 https://……" onChange={(e) => put(r.key, { href: e.target.value })} />}
                        <Button variant="ghost" size="icon-sm" aria-label="移除入口" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}><Trash2 size={13} /></Button>
                      </div>
                    )}
                  </SortableItem>
                );
              })}
            </div>
          </SortableList>
          <div className="mt-3">
            <Menu>
              <MenuTrigger asChild><Button variant="link" disabled={rows.length >= 10}><Plus size={13} />添加入口</Button></MenuTrigger>
              <MenuContent align="start">
                {available.map((c) => <MenuItem key={c.href} onSelect={() => add({ label: c.label, href: c.href })}>{c.label}<span className="mono ml-auto pl-4 text-[10.5px] text-ink-3">{c.group}</span></MenuItem>)}
                {available.length > 0 && <MenuSeparator />}
                <MenuItem onSelect={() => add({ label: '', href: '/' })}>自定义链接……</MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </Section>
      </Body>
    </>
  );
}
