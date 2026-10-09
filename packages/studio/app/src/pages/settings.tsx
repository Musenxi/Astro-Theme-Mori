import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useProject, useRefresh } from '@/lib/hooks';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  const [head, setHead] = useState('');
  const [accent, setAccent] = useState('#002fa7');
  const [accentDark, setAccentDark] = useState('');
  const [override, setOverride] = useState(false);
  const [auto, setAuto] = useState(String(autosaveSeconds()));
  const [edits, setEdits] = useState<Record<string, string>>({}); // 还没保存的、用选项改的设定（键是配置路径）
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (cfg) { setTitle(cfg.title); setDescription(cfg.description ?? ''); setAccent(cfg.accent); setAccentDark(cfg.accentDark ?? ''); setOverride(!!cfg.accentDark); } }, [cfg?.title, cfg?.description, cfg?.accent, cfg?.accentDark]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (cfg) setHead(cfg.head ?? ''); }, [cfg?.head]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cfg) return null;
  const rawAvatar = cfg.comments?.avatar;
  const avatarKey = rawAvatar == null || rawAvatar === '' ? 'cravatar' : rawAvatar; // 配置里是自定义地址时，三个选项都不亮

  const put = (key: string, value: string) => setEdits((e) => ({ ...e, [key]: value }));
  const autoN = Math.min(3600, Math.max(1, Math.round(Number(auto)) || 60));
  const accentDarkNow = override ? accentDark : '';
  const dirty = (title && title !== cfg.title) || description !== (cfg.description ?? '') || accent !== cfg.accent || accentDarkNow !== (cfg.accentDark ?? '') || Object.keys(edits).length > 0 || autoN !== autosaveSeconds() || head.trim() !== (cfg.head ?? '');

  const save = async () => {
    setBusy(true);
    try {
      if (title && title !== cfg.title) await api.setConfig('title', title);
      if (description !== (cfg.description ?? '')) await api.setConfig('description', description);
      if (accent !== cfg.accent) await api.setConfig('accent', accent);
      if (accentDarkNow !== (cfg.accentDark ?? '')) await api.setConfig('accentDark', accentDarkNow || null);
      for (const [k, v] of Object.entries(edits)) await api.setConfig(k, v);
      if (head.trim() !== (cfg.head ?? '')) await api.setConfig('head', head.trim() || null);
      setAutosaveSeconds(autoN); setAuto(String(autoN));
      setEdits({});
      await refresh();
      toast.success('已保存');
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };

  return (
    <>
      <PageHeader title="设定" actions={<Button variant="default" onClick={() => void save()} disabled={busy || !dirty}>保存</Button>} />
      <Body>
        <Section title="刊名与简介"><Card>
          <Field label="刊名"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="简介"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </Card></Section>

        <Section title="首页与归档"><Card>
          <Field label="版式">
            <Segmented value={edits['home.style'] ?? cfg.home?.style ?? 'quote'} onValueChange={(v) => put('home.style', v)} options={[{ value: 'quote', label: '引文版' }, { value: 'cover', label: '封面版' }, { value: 'list', label: '列表' }]} />
          </Field>
          <Field label="展示篇数">
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={8} className="w-24" value={edits['home.count'] ?? String(cfg.home?.count ?? 4)} onChange={(e) => put('home.count', e.target.value)} />
              <span className="text-soft-foreground">篇</span>
            </div>
          </Field>
          <Field label="首页排法">
            <Segmented value={edits['home.direction'] ?? cfg.home?.direction ?? 'h'} onValueChange={(v) => put('home.direction', v)} options={[{ value: 'h', label: '横排' }, { value: 'v', label: '竖排' }]} />
          </Field>
          <Field label="目次排法">
            <Segmented value={edits['home.tocDirection'] ?? cfg.home?.tocDirection ?? cfg.home?.direction ?? 'h'} onValueChange={(v) => put('home.tocDirection', v)} options={[{ value: 'h', label: '横排' }, { value: 'v', label: '竖排' }]} />
          </Field>
        </Card></Section>

        <Section title="订阅"><Card>
          <Field label="订阅内容">
            <Segmented value={edits['feed.content'] ?? cfg.feed?.content ?? 'excerpt'} onValueChange={(v) => put('feed.content', v)} options={[{ value: 'excerpt', label: '只放摘要' }, { value: 'full', label: '放全文' }]} />
          </Field>
        </Card></Section>

        {project?.comments.provider === 'mori' && (
          <Section title="评论"><Card>
            <Field label="状态">
              <Segmented value={edits['comments.status'] ?? cfg.comments?.status ?? 'on'} onValueChange={(v) => put('comments.status', v)} options={[{ value: 'on', label: '开启' }, { value: 'readonly', label: '禁用，显示历史评论' }, { value: 'off', label: '禁用，不显示' }]} />
            </Field>
            <Field label="头像服务">
              <Segmented value={edits['comments.avatar'] ?? avatarKey} onValueChange={(v) => put('comments.avatar', v)} options={[{ value: 'cravatar', label: 'Cravatar' }, { value: 'gravatar', label: 'Gravatar' }, { value: 'none', label: '不显示' }]} />
            </Field>
          </Card></Section>
        )}

        <Section title="自定义代码"><Card>
          <Field label="<head>" hint="只在构建出的站点里生效，预览里没有。">
            <Textarea variant="code" rows={6} spellCheck={false} value={head} onChange={(e) => setHead(e.target.value)} />
          </Field>
        </Card></Section>

        <Section title="编辑器"><Card>
          <Field label="自动保存间隔">
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={3600} className="w-24" value={auto} onChange={(e) => setAuto(e.target.value)} />
              <span className="text-soft-foreground">秒</span>
            </div>
          </Field>
        </Card></Section>

        <Section title="主题色"><Card>
          <div className="flex items-center gap-2.5 pb-3">
            {PRESETS.map(([c, n]) => (
              <button key={c} type="button" title={n} aria-label={n} onClick={() => setAccent(c)} style={{ '--c': c }} className={cn('h-7 w-7 rounded-full bg-(--c) outline-offset-2 transition-[outline-color,transform] hover:scale-110', accent === c ? 'outline outline-2 outline-foreground' : 'outline outline-1 outline-transparent hover:outline-muted-foreground')} />
            ))}
            <input type="color" value={accent} aria-label="自选颜色" onChange={(e) => setAccent(e.target.value)} className="ml-1 h-8 w-10 cursor-pointer rounded-md border-0 bg-transparent p-0" />
            <span className="mono text-muted-foreground">{accent}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <Swatch bg={light(accent)} paper="#f3f0e8" ink="#1d1b18" label="亮色" />
            <Swatch bg={override && accentDark ? accentDark : dark(accent)} paper="#151412" ink="#ececec" label="暗色" />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <SwitchField checked={override} label="手动指定暗色版本" onCheckedChange={(v) => { setOverride(v); if (v && !accentDark) setAccentDark('#7f9bff'); }} />
            {override && <input type="color" value={accentDark || '#7f9bff'} aria-label="暗色版本" onChange={(e) => setAccentDark(e.target.value)} className="h-8 w-10 cursor-pointer rounded-md border-0 bg-transparent p-0" />}
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
