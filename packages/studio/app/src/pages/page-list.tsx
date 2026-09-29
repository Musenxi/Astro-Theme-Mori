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
import { useConfirm } from '@/components/ui/dialog';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/dropdown';
import { Body, Empty, PageHeader } from '@/components/ui/page';

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
      <PageHeader title="页面" sub={`${pages.length}`} actions={<Button variant="primary" onClick={() => setCompose(true)}><Plus size={14} />新建页面</Button>} />
      <Body wide>
        <p className="mb-5 max-w-xl text-[12.5px] leading-relaxed text-ink-3">页面是“关于”“留言”“友人帐”这样的独立页，网址是 <span className="mono">/页面名/</span>。想让它出现在网站顶部的玻璃入口里，去「页头入口」设置。</p>
        <div className="border-t border-ink">
          {pages.map((p) => (
            <div key={p.id} className="group grid grid-cols-[minmax(0,1fr)_7rem_6rem_5rem_2rem] items-center gap-x-4 border-b border-rule py-3 transition-colors hover:bg-sunk/50">
              <Link to={`/pages/${p.id}`} className={cn('flex min-w-0 items-baseline gap-2', p.draft && 'italic text-ink-3')}>
                <span className="truncate hover:text-accent">{p.title}</span>
                <span className="mono shrink-0 text-[11px] not-italic text-ink-3">/{p.id}/</span>
              </Link>
              <span className="text-ink-2">{p.template === 'friends' ? '友人帐版式' : '普通页面'}</span>
              <span className={cn('text-[12.5px]', inNav(p) ? 'text-accent' : 'text-ink-3')}>{inNav(p) ? '在页头入口' : '不在页头'}</span>
              <span className={cn('text-[12.5px]', p.draft ? 'text-warn' : 'text-ink-3')}>{p.draft ? '草稿' : '已发布'}</span>
              <Menu>
                <MenuTrigger asChild><button type="button" aria-label="更多" className="grid h-7 w-7 place-items-center rounded-sm text-ink-3 opacity-0 transition-[opacity,background-color] hover:bg-sunk hover:text-ink focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"><MoreHorizontal size={16} /></button></MenuTrigger>
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
          {pages.length === 0 && <Empty>还没有页面。点右上角“新建页面”。</Empty>}
        </div>
      </Body>
      <NewEntryDialog open={compose} onOpenChange={setCompose} kind="page" />
    </>
  );
}
