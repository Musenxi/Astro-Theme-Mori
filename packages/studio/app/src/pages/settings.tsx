import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useProject, useRefresh } from '@/lib/hooks';
import { Field, Input } from '@/components/ui/input';
import { Body, Card, PageHeader, Section } from '@/components/ui/page';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';

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
  useEffect(() => { if (cfg) { setTitle(cfg.title); setDescription(cfg.description ?? ''); setAccent(cfg.accent); setAccentDark(cfg.accentDark ?? ''); setOverride(!!cfg.accentDark); } }, [cfg?.title, cfg?.description, cfg?.accent, cfg?.accentDark]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cfg) return null;

  const save = async (key: string, value: string | null) => {
    try { await api.setConfig(key, value); await refresh(); toast.success('已保存'); } catch (e) { toast.error((e as Error).message); }
  };
  const en = cfg.lang === 'en';

  return (
    <>
      <PageHeader title="设定" sub="保存后预览会随之刷新" />
      <Body>
        <Section title="刊名与简介"><Card>
          <Field label="刊名"><Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title && title !== cfg.title && save('title', title)} /></Field>
          <Field label="简介"><Input value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => description !== (cfg.description ?? '') && save('description', description)} /></Field>
        </Card></Section>

        <Section title="首页与归档"><Card>
          <Field label="版式" hint={(cfg.home?.style ?? 'quote') === 'cover' ? '墨色封面 + 满版刊名，往下滚时刊名缩进页头' : '封面大图，引文压在图上，点左侧目录切换'}>
            <Segmented value={cfg.home?.style ?? 'quote'} onValueChange={(v) => save('home.style', v)} options={[{ value: 'quote', label: '引文版' }, { value: 'cover', label: '封面版' }]} />
          </Field>
          <Field label="首页排法" hint={en ? undefined : (cfg.home?.direction ?? 'h') === 'v' ? '引文、目次、编者按竖着排' : undefined}>
            <Segmented value={cfg.home?.direction ?? 'h'} onValueChange={(v) => save('home.direction', v)} options={[{ value: 'h', label: '横排' }, { value: 'v', label: '竖排' }]} />
          </Field>
          <Field label="归档排法" hint={(cfg.archive?.direction ?? cfg.home?.direction ?? 'h') === 'v' ? '像手卷一样从右往左展开' : '时间轴往下走'}>
            <Segmented value={cfg.archive?.direction ?? cfg.home?.direction ?? 'h'} onValueChange={(v) => save('archive.direction', v)} options={[{ value: 'h', label: '横排' }, { value: 'v', label: '竖排' }]} />
          </Field>
          <p className="pl-[7.5rem] text-[12px] text-ink-3">{en ? '英文站没有竖排（竖排只对中日文有意义）。' : '在手机等窄屏上，首页和归档一律横排，不受这里的设置影响。'}</p>
        </Card></Section>

        <Section title="订阅" hint="读者用阅读器订阅：/feed"><Card>
          <Field label="订阅内容" hint={(cfg.feed?.content ?? 'excerpt') === 'full' ? '文章的正文、游记的文字和图片都放进订阅，读者在阅读器里就能读完' : '阅读器里只显示标题和摘要，读者点进来看全文'}>
            <Segmented value={cfg.feed?.content ?? 'excerpt'} onValueChange={(v) => save('feed.content', v)} options={[{ value: 'excerpt', label: '只放摘要' }, { value: 'full', label: '放全文' }]} />
          </Field>
        </Card></Section>

        <Section title="主题色" hint="网站的强调色，亮暗两个版本自动推出。Studio 里只在链接、光标这类小地方用到它"><Card>
          <div className="flex items-center gap-2.5 pb-3">
            {PRESETS.map(([c, n]) => (
              <button key={c} type="button" title={n} aria-label={n} onClick={() => { setAccent(c); void save('accent', c); }} style={{ background: c }} className={cn('h-7 w-7 rounded-full outline-offset-2 transition-[outline-color,transform] hover:scale-110', accent === c ? 'outline outline-2 outline-ink' : 'outline outline-1 outline-transparent hover:outline-ink-3')} />
            ))}
            <input type="color" value={accent} aria-label="自选颜色" onChange={(e) => setAccent(e.target.value)} onBlur={(e) => e.target.value !== cfg.accent && save('accent', e.target.value)} className="ml-1 h-8 w-10 cursor-pointer rounded-md border-0 bg-transparent p-0" />
            <span className="mono text-ink-3">{accent}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <Swatch bg={light(accent)} paper="#f3f0e8" ink="#1d1b18" label="亮色（亮度封顶，纸上看得清）" />
            <Swatch bg={override && accentDark ? accentDark : dark(accent)} paper="#151412" ink="#e8e3d9" label={override && accentDark ? '暗色（手动指定）' : '暗色（亮度托底，自动推出）'} />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Switch checked={override} label="手动指定暗色版本" onCheckedChange={(v) => { setOverride(v); if (!v) { setAccentDark(''); if (cfg.accentDark) void save('accentDark', null); } else if (!accentDark) setAccentDark('#7f9bff'); }} />
            {override && <input type="color" value={accentDark || '#7f9bff'} aria-label="暗色版本" onChange={(e) => setAccentDark(e.target.value)} onBlur={(e) => save('accentDark', e.target.value)} className="h-8 w-10 cursor-pointer rounded-md border-0 bg-transparent p-0" />}
          </div>
        </Card></Section>

        <p className="mt-12 text-[12px] leading-relaxed text-ink-3">分类在「文章 → 分类 / 标签」里管理，网站顶部的入口在「页面 → 页头入口」。评论服务等更多设置，需要直接编辑站点的配置文件（{project?.configPath}）。</p>
      </Body>
    </>
  );
}

function Swatch({ bg, paper, ink, label }: { bg: string; paper: string; ink: string; label: string }) {
  return (
    <div style={{ background: paper, color: ink }} className="rounded-xl p-4 shadow-soft">
      <div style={{ background: bg }} className="h-8 w-full rounded-lg" />
      <div className="mt-2 text-[12.5px]">{label}</div>
      <div style={{ color: bg }} className="mt-1 text-[15px]">路线、当前位置、小标签</div>
    </div>
  );
}
