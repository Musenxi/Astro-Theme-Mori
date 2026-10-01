import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Eye, FilePen, MoreHorizontal, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useProject, useRefresh } from '@/lib/hooks';
import type { PageSummary } from '@/lib/types';
import { NewEntryDialog } from '@/components/new-entry';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/confirm';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/action-menu';
import { Body, Empty, PageHeader } from '@/components/page';

export default function PageList() {
  const { data: project } = useProject();
  const refresh = useRefresh();
  const confirm = useConfirm();
  const nav = useNavigate();
  const [compose, setCompose] = useState(false);
  const pages = project?.pages ?? [];
  const navCustom = !!project?.config.nav;
  const inNav = (p: PageSummary) => (navCustom ? project!.config.nav!.some((n) => n.href === `/${p.id}/`) : !p.draft);

  const toggleDraft = async (p: PageSummary) => {
    try {
      const doc = await api.entry('page', p.id);
      if (p.draft) delete doc.draft; else doc.draft = true;
      await api.saveEntry('page', p.id, doc); await refresh();
      toast.success(p.draft ? `「${p.title}」已发布` : `「${p.title}」已转为草稿`);
    } catch (x) { toast.error((x as Error).message); }
  };
  const remove = async (p: PageSummary) => {
    if (!(await confirm({ title: `删除页面「${p.title}」？`, description: '文件不会彻底删除，会保留在项目的回收站文件夹里。如果页头入口里有它，也请一并去掉。', confirmLabel: '删除', danger: true }))) return;
    try { await api.removeEntry('page', p.id); await refresh(); toast.success('已删除'); } catch (x) { toast.error((x as Error).message); }
  };

  return (
    <>
      <PageHeader title="页面" sub={`${pages.length}`} actions={<Button variant="default" onClick={() => setCompose(true)}><Plus size={14} />新建页面</Button>} />
      <Body wide>
        <div className="space-y-0.5">
          {pages.map((p) => (
            <div key={p.id} className="group grid grid-cols-[minmax(0,1fr)_7rem_7rem_5rem_2rem] items-center gap-x-4 rounded-xl px-4 py-3.5 transition-colors hover:bg-foreground/[.045]">
              <Link to={`/pages/${p.id}`} className={cn('flex min-w-0 items-baseline gap-2', p.draft && 'text-muted-foreground')}>
                <span className="truncate font-medium">{p.title}</span>
                <span className="mono shrink-0 text-11 text-muted-foreground">/{p.id}/</span>
              </Link>
              <span className="text-soft-foreground">{p.template === 'friends' ? '友人帐版式' : '普通页面'}</span>
              <span className={cn('w-fit rounded-full px-2.5 py-px text-12', inNav(p) ? 'bg-foreground/[.07] text-soft-foreground' : 'bg-foreground/[.04] text-muted-foreground')}>{inNav(p) ? '在页头入口' : '不在页头'}</span>
              <span className={cn('flex items-center gap-1.5 text-12-5', p.draft ? 'text-soft-foreground' : 'text-muted-foreground')}><i className={cn('h-1.5 w-1.5 rounded-full', p.draft ? 'border border-soft-foreground' : 'bg-muted-foreground/60')} />{p.draft ? '草稿' : '已发布'}</span>
              <Menu>
                <MenuTrigger asChild><button type="button" aria-label="更多" className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground opacity-0 transition-[opacity,background-color] hover:bg-foreground/[.08] hover:text-foreground focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"><MoreHorizontal size={16} /></button></MenuTrigger>
                <MenuContent>
                  <MenuItem icon={<Pencil size={14} />} onSelect={() => nav(`/pages/${p.id}`)}>编辑</MenuItem>
                  <MenuItem icon={p.draft ? <Send size={14} /> : <FilePen size={14} />} onSelect={() => toggleDraft(p)}>{p.draft ? '发布' : '转为草稿'}</MenuItem>
                  {project?.preview.url && <MenuItem icon={<Eye size={14} />} onSelect={() => window.open(`${project.preview.url}/${p.id}/`, '_blank')}>在预览里打开</MenuItem>}
                  <MenuSeparator />
                  <MenuItem danger icon={<Trash2 size={14} />} onSelect={() => remove(p)}>删除</MenuItem>
                </MenuContent>
              </Menu>
            </div>
          ))}
          {pages.length === 0 && <Empty>还没有页面。</Empty>}
        </div>
      </Body>
      <NewEntryDialog open={compose} onOpenChange={setCompose} kind="page" />
    </>
  );
}
