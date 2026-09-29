import { html, useState } from '../h.js';
import { Field } from '../components.js';

const PRESETS = [['#002fa7', '克莱因蓝'], ['#b0442b', '朱'], ['#3f6b4f', '松绿'], ['#5b3f8c', '紫']];
// 和主题里的推导一致：亮色下亮度封顶，暗色下亮度托底（都在 OKLCH 里，色相和饱和度不变）
const light = (c) => `oklch(from ${c} min(l,.52) c h)`;
const dark = (c) => `oklch(from ${c} max(l,.7) min(c,.18) h)`;

async function put(key, value) {
  const res = await fetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
}

export function Settings({ project, refresh }) {
  const cfg = project.config;
  const [msg, setMsg] = useState('');
  const [accent, setAccent] = useState(cfg.accent);
  const [accentDark, setAccentDark] = useState(cfg.accentDark ?? '');
  const [override, setOverride] = useState(!!cfg.accentDark);
  const [title, setTitle] = useState(cfg.title);
  const [description, setDescription] = useState(cfg.description ?? '');
  const save = async (key, value) => {
    try { await put(key, value); await refresh(); setMsg(`已写入 mori.config.ts：${key}`); } catch (e) { setMsg(e.message); }
  };
  const sw = (bg, paper, ink, label) => html`<div style=${`background:${paper};color:${ink};padding:14px;border:1px solid var(--rule);flex:1`}>
    <div style=${`width:100%;height:28px;background:${bg}`}></div>
    <div style="margin-top:8px;font-size:13px">${label}</div>
    <div style=${`font-size:15px;margin-top:4px;color:${bg}`}>路线、当前位置、小标签</div></div>`;

  return html`<div class="bar"><b class="grow" style="font-weight:400">站点设置</b><span class="status mono">${msg}</span></div>
    <div class="pad">
      <section class="box" style="margin-top:0;border-top:0"><h2>刊名与简介</h2>
        <${Field} label="刊名"><input value=${title} onInput=${(e) => setTitle(e.target.value)} onBlur=${() => title !== cfg.title && title && save('title', title)} /><//>
        <${Field} label="简介"><input value=${description} onInput=${(e) => setDescription(e.target.value)} onBlur=${() => description !== (cfg.description ?? '') && save('description', description)} /><//>
      </section>
      <section class="box"><h2>主题色 <span class="lbl mono">唯一的强调色；亮暗两个版本自动推出</span></h2>
        <div class="row" style="margin:8px 0">
          ${PRESETS.map(([c, n]) => html`<button key=${c} title=${n} onClick=${() => { setAccent(c); save('accent', c); }}
            style=${`width:26px;height:26px;background:${c};outline:${accent === c ? '2px solid var(--ink)' : '1px solid var(--rule)'};outline-offset:2px`}></button>`)}
          <input type="color" value=${accent} style="width:36px;height:28px;padding:0;border:1px solid var(--rule)" onInput=${(e) => setAccent(e.target.value)} onChange=${(e) => save('accent', e.target.value)} />
          <span class="mono lbl">${accent}</span>
        </div>
        <div class="row" style="align-items:stretch;gap:0">
          ${sw(light(accent), '#f3f0e9', '#1d1b18', '亮色（亮度封顶，纸上看得清）')}
          ${sw(override && accentDark ? accentDark : dark(accent), '#151412', '#e8e3d9', override && accentDark ? '暗色（手动指定）' : '暗色（亮度托底，自动推出）')}
        </div>
        <label class="row" style="margin-top:10px"><input type="checkbox" checked=${override} onChange=${(e) => {
          setOverride(e.target.checked);
          if (!e.target.checked) { setAccentDark(''); if (cfg.accentDark) save('accentDark', null); }
          else if (!accentDark) setAccentDark('#7f9bff');
        }} /> 手动指定暗色版本
          ${override && html`<input type="color" value=${accentDark || '#7f9bff'} style="width:36px;height:28px;padding:0;border:1px solid var(--rule)" onInput=${(e) => setAccentDark(e.target.value)} onChange=${(e) => save('accentDark', e.target.value)} />`}
        </label>
      </section>
      <p class="lbl mono" style="margin-top:28px">改动写回 ${project.configPath}，只替换对应那一行，注释和排版不动；预览打开时会随之刷新。栏目、导航等复杂设置直接在这个文件里改。</p>
    </div>`;
}
