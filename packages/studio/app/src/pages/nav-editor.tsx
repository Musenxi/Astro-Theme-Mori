import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Moon, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useProject, useRefresh } from '@/lib/hooks';
import type { Action, NavItem } from '@/lib/types';
import { SortableItem, SortableList } from '@/editor/sortable';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/confirm';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/action-menu';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/segmented';
import { IconPicker } from '@/components/icon-picker';
import { Glyph } from '@/components/lucide';
import { Body, PageHeader, Section } from '@/components/page';
import { cn } from '@/lib/cn';

type Link = { label: string; href: string; icon?: string };
type Keyed<T> = T & { key: string };
let seq = 0;
const withKeys = <T,>(items: T[]): Array<Keyed<T>> => items.map((n) => ({ ...n, key: `n${++seq}` }));
const strip = <T,>({ key: _key, ...rest }: Keyed<T>) => rest as unknown as T;
const cleanLink = ({ label, href, icon }: Link): Link => ({ label: label.trim(), href: href.trim(), ...(icon ? { icon } : {}) });
const plainNav = (rows: Array<Keyed<NavItem>>) => rows.map(cleanLink);
const plainActions = (rows: Array<Keyed<Action>>): Action[] => rows.map((r) => (r.type === 'theme' ? strip(r) : { type: 'link', ...cleanLink(r) }));
/** 从文字改成图标时先给一个贴题的 */
const guessIcon = (href: string) => ({ '/posts/': 'book-open', '/archive/': 'archive', '/search/': 'search', '/friends/': 'users', '/about/': 'info' })[href] ?? 'link';
const DEFAULT_ACTIONS: Action[] = [{ type: 'theme' }];

/** 一行链接：样式（文字 / 图标）、名字、地址；地址在候选里就只显示分组 */
function LinkFields({ row, known, onChange }: { row: Link; known?: string; onChange: (p: Partial<Link>) => void }) {
  return (
    <>
      <IconPicker value={row.icon} fallback={guessIcon(row.href)} onChange={(icon) => onChange({ icon })} />
      <Input className="w-40" value={row.label} placeholder={row.icon ? '提示名' : '名字'} onChange={(e) => onChange({ label: e.target.value })} />
      {known ? <span className="mono flex-1 truncate text-muted-foreground">{row.href}<span className="ml-2 rounded-full bg-foreground/[.06] px-2 py-px text-10-5">{known}</span></span> : <Input variant="mono" className="flex-1" value={row.href} placeholder="地址" onChange={(e) => onChange({ href: e.target.value })} />}
    </>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-foreground/[.035]">{children}</div>;
}

/** 网站页头：中间是玻璃胶囊里的入口（内置页、分类、你的页面，或者任意链接），右边并排放几个操作（昼夜切换、搜索……）；都能拖动排序 */
export default function NavEditor() {
  const { data: project } = useProject();
  const refresh = useRefresh();
  const confirm = useConfirm();
  const custom = project?.config.nav ?? null;
  const customActions = project?.config.actions ?? null;

  // 没设定过时，显示的是默认：文章、归档、再加上所有已发布的页面
  const defaults = useMemo<NavItem[]>(() => [{ label: '文章', href: '/posts/' }, { label: '归档', href: '/archive/' }, ...(project?.pages ?? []).filter((p) => !p.draft).map((p) => ({ label: p.title, href: `/${p.id}/` }))], [project?.pages]);
  const effective = custom ?? defaults;
  const effectiveActions = customActions ?? DEFAULT_ACTIONS;
  const [rows, setRows] = useState<Array<Keyed<NavItem>>>([]);
  const [acts, setActs] = useState<Array<Keyed<Action>>>([]);
  useEffect(() => { setRows(withKeys(effective)); }, [JSON.stringify(effective)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setActs(withKeys(effectiveActions)); }, [JSON.stringify(effectiveActions)]); // eslint-disable-line react-hooks/exhaustive-deps
  const navDirty = JSON.stringify(plainNav(rows)) !== JSON.stringify(effective);
  const actsDirty = JSON.stringify(plainActions(acts)) !== JSON.stringify(effectiveActions);
  const [layout, setLayout] = useState<'merged' | 'split'>('merged');
  useEffect(() => { setLayout(project?.config.actionsLayout ?? 'merged'); }, [project?.config.actionsLayout]);
  const layoutDirty = layout !== (project?.config.actionsLayout ?? 'merged');
  const dirty = navDirty || actsDirty || layoutDirty;

  const candidates = useMemo(() => [
    { group: '内置', label: '文章', href: '/posts/' }, { group: '内置', label: '归档', href: '/archive/' }, { group: '内置', label: '搜索', href: '/search/' },
    ...(project?.config.categories ?? []).map((c) => ({ group: '分类', label: c.zh, href: `/category/${c.id}/` })),
    ...(project?.pages ?? []).map((p) => ({ group: '页面', label: p.title, href: `/${p.id}/` })),
  ], [project]);
  const groupOf = (href: string) => candidates.find((c) => c.href === href)?.group;
  const available = candidates.filter((c) => !rows.some((r) => r.href === c.href));

  const putRow = (key: string, p: Partial<Link>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const putAct = (key: string, p: Partial<Link> | { style: 'text' | 'icon' }) => setActs((rs) => rs.map((r) => (r.key === key ? ({ ...r, ...p } as Keyed<Action>) : r)));
  const addRow = (n: NavItem) => setRows((rs) => [...rs, ...withKeys([n])]);
  const addAct = (a: Action) => setActs((rs) => [...rs, ...withKeys([a])]);
  const hasTheme = acts.some((a) => a.type === 'theme');
  const hasSearch = acts.some((a) => a.type === 'link' && a.href === '/search/');

  const save = async () => {
    if (rows.some((r) => !r.label.trim()) || acts.some((a) => a.type === 'link' && !a.label.trim())) return toast.error('每个入口都要有名字');
    try { if (layoutDirty) await api.setConfig('actionsLayout', layout); await api.setNav({ ...(navDirty ? { nav: plainNav(rows) } : {}), ...(actsDirty ? { actions: plainActions(acts) } : {}) }); await refresh(); toast.success('已保存'); } catch (e) { toast.error((e as Error).message); }
  };
  const reset = async () => {
    if (!(await confirm({ title: '恢复默认？', description: '页头会回到“文章、归档，再加上所有已发布的页面”，右侧只留昼夜切换。', confirmLabel: '恢复默认' }))) return;
    try { await api.setNav({ nav: null, actions: null }); await refresh(); toast.success('已恢复默认'); } catch (e) { toast.error((e as Error).message); }
  };
  const discard = () => { setLayout(project?.config.actionsLayout ?? 'merged'); setRows(withKeys(effective)); setActs(withKeys(effectiveActions)); };

  return (
    <>
      <PageHeader title="页头入口" actions={<>
        {(custom || customActions) && !dirty && <Button variant="ghost" onClick={reset}><RotateCcw size={14} />恢复默认</Button>}
        {dirty && <><Button variant="ghost" onClick={discard}>放弃修改</Button><Button variant="default" onClick={save}>保存</Button></>}
      </>} />
      <Body>

        <div className="mb-8 flex items-center justify-center gap-3 rounded-2xl bg-muted/70 py-9">
          <div className="flex items-center gap-1 rounded-full bg-popover/80 p-1 shadow-pop backdrop-blur">
            {rows.length ? rows.map((r, i) => <span key={r.key} className={cn('grid place-items-center rounded-full px-4 py-1.5 text-13', i === 0 ? 'bg-foreground/[.07]' : 'text-soft-foreground')}>{r.icon ? <Glyph name={r.icon} size={16} /> : r.label || '·'}</span>) : <span className="px-4 py-1.5 text-muted-foreground">空</span>}
          </div>
          {acts.length > 0 && (
            <div className={cn('flex items-center', layout === 'split' ? 'gap-1.5' : 'rounded-full bg-popover/80 shadow-pop backdrop-blur')}>
              {acts.map((a) => (
                <span key={a.key} className={cn('grid h-9 min-w-9 place-items-center px-1 text-13 text-soft-foreground', layout === 'split' && 'rounded-full bg-popover/80 shadow-pop backdrop-blur')}>
                  {a.type === 'theme' ? (a.style === 'icon' ? <Moon size={16} /> : '夜') : a.icon ? <Glyph name={a.icon} size={16} /> : <span className="px-2">{a.label || '·'}</span>}
                </span>
              ))}
            </div>
          )}
        </div>

        <Section title="入口">
          <SortableList items={rows} getId={(r) => r.key} onReorder={setRows}>
            <div className="space-y-1.5">
              {rows.map((r) => (
                <SortableItem key={r.key} id={r.key} className="rounded-xl">
                  {(handle) => (
                    <Row>
                      {handle}
                      <LinkFields row={r} known={groupOf(r.href)} onChange={(p) => putRow(r.key, p)} />
                      <Button variant="ghost" size="icon-sm" aria-label="移除入口" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}><Trash2 size={14} /></Button>
                    </Row>
                  )}
                </SortableItem>
              ))}
            </div>
          </SortableList>
          <div className="mt-3">
            <Menu>
              <MenuTrigger asChild><Button variant="link" disabled={rows.length >= 10}><Plus size={13} />添加入口</Button></MenuTrigger>
              <MenuContent align="start">
                {available.map((c) => <MenuItem key={c.href} onSelect={() => addRow({ label: c.label, href: c.href })}>{c.label}<span className="mono ml-auto pl-4 text-10-5 text-muted-foreground">{c.group}</span></MenuItem>)}
                {available.length > 0 && <MenuSeparator />}
                <MenuItem onSelect={() => addRow({ label: '', href: '/' })}>自定义链接……</MenuItem>
                <MenuItem onSelect={() => addRow({ label: '', href: '/', icon: 'link' })}>图标链接……</MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </Section>

        <Section title="右侧操作">
          <div className="pb-3"><Segmented size="sm" value={layout} onValueChange={setLayout} options={[{ value: 'merged', label: '合并' }, { value: 'split', label: '分开' }]} /></div>
          <SortableList items={acts} getId={(a) => a.key} onReorder={setActs}>
            <div className="space-y-1.5">
              {acts.map((a) => (
                <SortableItem key={a.key} id={a.key} className="rounded-xl">
                  {(handle) => (
                    <Row>
                      {handle}
                      {a.type === 'theme' ? (
                        <>
                          <span className="w-50 px-3 text-13-5">昼夜切换</span>
                          <Segmented value={a.style === 'icon' ? 'icon' : 'text'} size="sm" onValueChange={(style) => putAct(a.key, { style })} options={[{ value: 'text', label: '文字' }, { value: 'icon', label: '图标' }]} />
                          <span className="flex-1" />
                        </>
                      ) : (
                        <LinkFields row={a} known={groupOf(a.href)} onChange={(p) => putAct(a.key, p)} />
                      )}
                      <Button variant="ghost" size="icon-sm" aria-label="移除操作" onClick={() => setActs(acts.filter((x) => x.key !== a.key))}><Trash2 size={14} /></Button>
                    </Row>
                  )}
                </SortableItem>
              ))}
              {!acts.length && <p className="px-2 py-3 text-13 text-muted-foreground">没有。</p>}
            </div>
          </SortableList>
          <div className="mt-3">
            <Menu>
              <MenuTrigger asChild><Button variant="link" disabled={acts.length >= 6}><Plus size={13} />添加操作</Button></MenuTrigger>
              <MenuContent align="start">
                {!hasSearch && <MenuItem onSelect={() => addAct({ type: 'link', label: '搜索', href: '/search/', icon: 'search' })}>搜索</MenuItem>}
                {!hasTheme && <MenuItem onSelect={() => addAct({ type: 'theme' })}>昼夜切换</MenuItem>}
                {(!hasSearch || !hasTheme) && <MenuSeparator />}
                <MenuItem onSelect={() => addAct({ type: 'link', label: '', href: '/', icon: 'link' })}>图标链接……</MenuItem>
                <MenuItem onSelect={() => addAct({ type: 'link', label: '', href: '/' })}>文字链接……</MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </Section>
      </Body>
    </>
  );
}
