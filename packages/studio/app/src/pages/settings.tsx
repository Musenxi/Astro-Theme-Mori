import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useProject, useRefresh } from '@/lib/hooks';
import { Field } from '@/components/field';
import { Input } from '@/components/ui/input';
import { Body, Card, PageHeader, Section } from '@/components/page';
import { Segmented } from '@/components/segmented';
import { SwitchField } from '@/components/switch-field';
import { cn } from '@/lib/cn';
import { autosaveSeconds, setAutosaveSeconds } from '@/lib/prefs';

const PRESETS: Array<[string, string]> = [['#002fa7', '克莱因蓝'], ['#b0442b', '朱'], ['#3f6b4f', '松绿'], ['#5b3f8c', '紫']];
// 和主题里的推导一致：亮色下亮度封顶，暗色下亮度托底（都在 OKLCH 里，色相和饱和度不变）
const light = (c: string) => `oklch(from ${c} min(l,.52) c h)`;
const dark = (c: string) => `oklch(from ${c} max(l,.7) min(c,.18) h)`;

export default function Settings() {
  const { data: project } = useProject();
  const refresh = useRefresh();
  const cfg = project?.config;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [accent, setAccent] = useState('#002fa7');
  const [accentDark, setAccentDark] = useState('');
  const [override, setOverride] = useState(false);
  const [auto, setAuto] = useState(String(autosaveSeconds()));
  useEffect(() => { if (cfg) { setTitle(cfg.title); setDescription(cfg.description ?? ''); setAccent(cfg.accent); setAccentDark(cfg.accentDark ?? ''); setOverride(!!cfg.accentDark); } }, [cfg?.title, cfg?.description, cfg?.accent, cfg?.accentDark]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cfg) return null;
  const rawAvatar = cfg.comments?.avatar;
  const avatarKey = rawAvatar == null || rawAvatar === '' ? 'cravatar' : rawAvatar; // 配置里是自定义地址时，三个选项都不亮

  const save = async (key: string, value: string | null) => {
    try { await api.setConfig(key, value); await refresh(); toast.success('已保存'); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <>
      <PageHeader title="设定" />
      <Body>
        <Section title="刊名与简介"><Card>
          <Field label="刊名"><Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title && title !== cfg.title && save('title', title)} /></Field>
          <Field label="简介"><Input value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => description !== (cfg.description ?? '') && save('description', description)} /></Field>
        </Card></Section>

        <Section title="首页与归档"><Card>
          <Field label="版式">
            <Segmented value={cfg.home?.style ?? 'quote'} onValueChange={(v) => save('home.style', v)} options={[{ value: 'quote', label: '引文版' }, { value: 'cover', label: '封面版' }]} />
          </Field>
          <Field label="首页排法">
            <Segmented value={cfg.home?.direction ?? 'h'} onValueChange={(v) => save('home.direction', v)} options={[{ value: 'h', label: '横排' }, { value: 'v', label: '竖排' }]} />
          </Field>
          <Field label="归档排法">
            <Segmented value={cfg.archive?.direction ?? cfg.home?.direction ?? 'h'} onValueChange={(v) => save('archive.direction', v)} options={[{ value: 'h', label: '横排' }, { value: 'v', label: '竖排' }]} />
          </Field>
        </Card></Section>

        <Section title="订阅"><Card>
          <Field label="订阅内容">
            <Segmented value={cfg.feed?.content ?? 'excerpt'} onValueChange={(v) => save('feed.content', v)} options={[{ value: 'excerpt', label: '只放摘要' }, { value: 'full', label: '放全文' }]} />
          </Field>
        </Card></Section>

        {project?.comments.provider === 'mori' && (
          <Section title="评论"><Card>
            <Field label="头像服务">
              <Segmented value={avatarKey} onValueChange={(v) => save('comments.avatar', v)} options={[{ value: 'cravatar', label: 'Cravatar' }, { value: 'gravatar', label: 'Gravatar' }, { value: 'none', label: '不显示' }]} />
            </Field>
          </Card></Section>
        )}

        <Section title="编辑器"><Card>
          <Field label="自动保存间隔">
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={3600} className="w-24" value={auto} onChange={(e) => setAuto(e.target.value)} onBlur={() => { const n = Math.min(3600, Math.max(1, Math.round(Number(auto)) || 60)); setAuto(String(n)); setAutosaveSeconds(n); }} />
              <span className="text-soft-foreground">秒</span>
            </div>
          </Field>
        </Card></Section>

        <Section title="主题色"><Card>
          <div className="flex items-center gap-2.5 pb-3">
            {PRESETS.map(([c, n]) => (
              <button key={c} type="button" title={n} aria-label={n} onClick={() => { setAccent(c); void save('accent', c); }} style={{ '--c': c }} className={cn('h-7 w-7 rounded-full bg-(--c) outline-offset-2 transition-[outline-color,transform] hover:scale-110', accent === c ? 'outline outline-2 outline-foreground' : 'outline outline-1 outline-transparent hover:outline-muted-foreground')} />
            ))}
            <input type="color" value={accent} aria-label="自选颜色" onChange={(e) => setAccent(e.target.value)} onBlur={(e) => e.target.value !== cfg.accent && save('accent', e.target.value)} className="ml-1 h-8 w-10 cursor-pointer rounded-md border-0 bg-transparent p-0" />
            <span className="mono text-muted-foreground">{accent}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <Swatch bg={light(accent)} paper="#f3f0e8" ink="#1d1b18" label="亮色" />
            <Swatch bg={override && accentDark ? accentDark : dark(accent)} paper="#151412" ink="#e8e3d9" label="暗色" />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <SwitchField checked={override} label="手动指定暗色版本" onCheckedChange={(v) => { setOverride(v); if (!v) { setAccentDark(''); if (cfg.accentDark) void save('accentDark', null); } else if (!accentDark) setAccentDark('#7f9bff'); }} />
            {override && <input type="color" value={accentDark || '#7f9bff'} aria-label="暗色版本" onChange={(e) => setAccentDark(e.target.value)} onBlur={(e) => save('accentDark', e.target.value)} className="h-8 w-10 cursor-pointer rounded-md border-0 bg-transparent p-0" />}
          </div>
        </Card></Section>
      </Body>
    </>
  );
}

function Swatch({ bg, paper, ink, label }: { bg: string; paper: string; ink: string; label: string }) {
  return (
    <div style={{ '--paper': paper, '--ink': ink, '--bg': bg }} className="rounded-xl bg-(--paper) p-4 text-(--ink) shadow-soft">
      <div className="h-8 w-full rounded-lg bg-(--bg)" />
      <div className="mt-2 text-12-5">{label}</div>
    </div>
  );
}
