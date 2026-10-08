import { useRef, useState } from 'react';
import { Compass, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Doc } from '@/lib/types';
import { appendPlace } from '@/lib/places.js';

/* ───────────── 路线数据：轨迹、按照片建议地点 ───────────── */

/** `set` 改文章的设置（轨迹）；`edit` 改正文（加地点是在文末加一段只有地名的文字） */
export function RouteData({ doc, set, edit }: { doc: Doc; set: (patch: Doc) => void; edit: (fn: (d: Doc) => Doc) => void }) {
  const [msg, setMsg] = useState('');
  const [sug, setSug] = useState<Awaited<ReturnType<typeof api.exif>> | null>(null);
  const [names, setNames] = useState<Record<number, string>>({});
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const file = useRef<HTMLInputElement>(null);
  const track = doc.track as unknown[] | undefined;

  const importGpx = async (f: File) => {
    setMsg('读取中……');
    try { const j = await api.importGpx(f); set({ track: j.track }); setMsg(`已导入：${j.points} 个点，简化成 ${j.simplified} 个`); } catch (e) { setMsg((e as Error).message); }
  };
  const suggest = async () => {
    setMsg('读取照片的拍摄地点……');
    try {
      const j = await api.exif();
      setSug(j); setPicked(Object.fromEntries(j.stops.map((_, i) => [i, true]))); setNames({});
      setMsg(j.stops.length ? `${j.photos} 张图里 ${j.withGps} 张带位置，建议 ${j.stops.length} 处` : `${j.photos} 张图里没有带位置的（GPS）`);
    } catch (e) { setMsg((e as Error).message); }
  };
  const addPins = () => {
    if (!sug) return;
    const chosen = sug.stops.map((s, i) => ({ s, i })).filter(({ i }) => picked[i]);
    edit((d) => chosen.reduce((acc, { s, i }) => appendPlace(acc, { name: (names[i] ?? '').trim() || `未命名 ${i + 1}`, lnglat: s.lnglat, date: s.date }), d));
    setSug(null); setMsg(`已在文末加入 ${chosen.length} 个地点`);
    toast.success(`已加入 ${chosen.length} 个地点`);
  };

  return (
    <div>
      <p className="mb-2 text-12 text-muted-foreground">{track ? `已有轨迹，${track.length} 个点` : '没有轨迹：地图上按地点顺序连线'}</p>
      <div className="flex flex-wrap gap-2">
        <input ref={file} type="file" accept=".gpx,application/gpx+xml,text/xml" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importGpx(f); e.target.value = ''; }} />
        <Button size="sm" onClick={() => file.current?.click()}><Upload size={13} />导入 GPX 轨迹</Button>
        {track && <Button size="sm" variant="ghost" onClick={() => { set({ track: undefined }); setMsg('已清除轨迹'); }}>清除轨迹</Button>}
        <Button size="sm" onClick={suggest}><Compass size={13} />按照片的拍摄地点建议</Button>
      </div>
      {msg && <p className="mt-2 text-12 text-muted-foreground">{msg}</p>}
      {sug && sug.stops.length > 0 && (
        <div className="mt-3 space-y-3 rounded-xl bg-popover p-3 shadow-soft">
          {sug.stops.map((s, i) => (
            <label key={i} className="block">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={!!picked[i]} onChange={(e) => setPicked({ ...picked, [i]: e.target.checked })} className="accent-foreground" />
                <span className="mono text-11 text-muted-foreground">{s.date ?? '无日期'} · {s.count} 张 · {s.lnglat[1].toFixed(2)}, {s.lnglat[0].toFixed(2)}</span>
              </span>
              <Input className="mt-1.5" placeholder="地名" value={names[i] ?? ''} onChange={(e) => setNames({ ...names, [i]: e.target.value })} />
            </label>
          ))}
          <div className="flex gap-2 pt-1"><Button size="sm" variant="default" onClick={addPins}>把选中的加入文末</Button><Button size="sm" variant="ghost" onClick={() => setSug(null)}>取消</Button></div>
        </div>
      )}
    </div>
  );
}
