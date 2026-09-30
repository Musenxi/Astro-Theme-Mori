import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, assetUrl } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useRefresh } from '@/lib/hooks';
import type { Friend } from '@/lib/types';
import { assetName, AssetDialog } from '@/components/asset-picker';
import { SortableItem, SortableList } from '@/editor/sortable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Body, Empty, onCard, PageHeader } from '@/components/ui/page';

interface Row extends Friend { key: string }
let seq = 0;
const withKeys = (list: Friend[]): Row[] => list.map((f) => ({ ...f, key: `f${++seq}` }));
const plain = (rows: Row[]): Friend[] => rows.map(({ key: _k, ...f }) => ({ ...f, name: f.name.trim(), url: f.url.trim(), desc: f.desc?.trim() ?? '', avatar: f.avatar?.trim() || undefined }));
const isLocal = (a?: string) => !!a && !/^https?:/.test(a);
const avatarSrc = (a?: string) => (!a ? undefined : isLocal(a) ? assetUrl(assetName(a), 96) : a);
const withProto = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

/** 友人帐：粘贴对方的网址，自动带出站名、简介和头像；拖动排序；保存后网站上的“友人帐”页面就会更新 */
export default function Friends() {
  const refresh = useRefresh();
  const { data, refetch } = useQuery({ queryKey: ['friends'], queryFn: api.friends, staleTime: 0, refetchOnWindowFocus: false });
  const [rows, setRows] = useState<Row[]>([]);
  const [base, setBase] = useState('[]');
  const [url, setUrl] = useState('');
  const [probing, setProbing] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  useEffect(() => { if (data) { setRows(withKeys(data.friends)); setBase(JSON.stringify(data.friends.map((f) => ({ ...f, avatar: f.avatar || undefined, desc: f.desc ?? '' })))); } }, [data]);
  const dirty = useMemo(() => JSON.stringify(plain(rows).map(({ id, name, url, desc, avatar }) => ({ id, name, url, desc, avatar }))) !== JSON.stringify(JSON.parse(base).map(({ id, name, url, desc, avatar }: Friend) => ({ id, name, url, desc, avatar }))), [rows, base]);

  const put = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const probe = async (target: string) => {
    try { return await api.probeSite(withProto(target)); } catch (e) { toast.error((e as Error).message); return null; }
  };
  const addByUrl = async () => {
    const u = url.trim(); if (!u) return;
    setProbing('__new');
    const info = await probe(u);
    setRows((rs) => [...rs, ...withKeys([{ name: info?.name ?? '', url: withProto(u), desc: info?.desc ?? '', avatar: info?.avatar }])]);
    setUrl(''); setProbing(null);
    if (info) toast.success(`已加入「${info.name || u}」`);
  };
  const refill = async (r: Row) => {
    setProbing(r.key);
    const info = await probe(r.url);
    setProbing(null);
    if (info) { put(r.key, { name: r.name || info.name, desc: r.desc || info.desc, avatar: r.avatar || info.avatar }); toast.success('已补全空着的项'); }
  };
  const save = async () => {
    try { await api.saveFriends(plain(rows)); await Promise.all([refetch(), refresh()]); toast.success('已保存'); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <>
      <PageHeader title="友人帐" sub={`${rows.length} 位`} actions={dirty && <><Button variant="ghost" onClick={() => data && setRows(withKeys(data.friends))}>放弃修改</Button><Button variant="primary" onClick={save}>保存</Button></>} />
      <Body>
        <form className="mb-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); void addByUrl(); }}>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="粘贴对方的网址，自动带出站名、简介和头像" disabled={probing === '__new'} />
          <Button type="submit" variant="primary" disabled={!url.trim() || probing === '__new'}>{probing === '__new' ? '读取中……' : '添加'}</Button>
        </form>
        <SortableList items={rows} getId={(r) => r.key} onReorder={setRows}>
          <div className="space-y-2.5">
            {rows.map((r) => (
              <SortableItem key={r.key} id={r.key} className={cn('rounded-2xl bg-sunk/70', onCard)}>
                {(handle) => (
                  <div className="flex items-start gap-2 p-3">
                    <div className="pt-1.5">{handle}</div>
                    <button type="button" aria-label="换头像" onClick={() => setPicking(r.key)} className="mt-0.5 grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-lift text-ink-3 shadow-soft transition-shadow hover:ring-2 hover:ring-ink/25">
                      {r.avatar ? <img src={avatarSrc(r.avatar)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : <span className="grid h-full w-full place-items-center bg-ink/[.07] text-[16px] font-medium text-ink-2">{[...(r.name || '?')][0]}</span>}
                    </button>
                    <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-2 gap-y-1.5">
                      <Input value={r.name} placeholder="名字" onChange={(e) => put(r.key, { name: e.target.value })} />
                      <Input className="mono" value={r.url} placeholder="https://……" onChange={(e) => put(r.key, { url: e.target.value })} />
                      <Input className="col-span-2" value={r.desc ?? ''} placeholder="一句话" onChange={(e) => put(r.key, { desc: e.target.value })} />
                    </div>
                    <div className="flex flex-col">
                      <Button variant="ghost" size="icon-sm" aria-label="从网址补全" title="从网址补全空着的项" disabled={probing === r.key || !r.url.trim()} onClick={() => refill(r)}><RefreshCw size={14} className={cn(probing === r.key && 'animate-spin')} /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label="移除" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}><Trash2 size={14} /></Button>
                    </div>
                  </div>
                )}
              </SortableItem>
            ))}
          </div>
        </SortableList>
        {rows.length === 0 && <Empty>还没有友人。在上面粘贴一个网址开始。</Empty>}
        <p className="mt-6 text-[12px] leading-relaxed text-ink-3">友人帐会显示在版式为“友人帐”的页面上（在「页面」里新建，选“友人帐”版式）。头像可以是对方站点的图标网址，也可以点头像从图库里选一张。</p>
      </Body>
      <AssetDialog open={picking !== null} onOpenChange={(o) => !o && setPicking(null)} onPick={(n) => { if (picking) put(picking, { avatar: `../assets/${n}` }); setPicking(null); }} />
    </>
  );
}
