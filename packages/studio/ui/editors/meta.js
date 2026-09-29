import { html, useState } from '../h.js';
import { Field, Text, ImagePicker } from '../components.js';

/** 普通文章与游记共用的元信息 + 置顶设置 */
export function MetaEditor({ doc, set, project, refresh, hideTitle }) {
  const pin = doc.pin;
  const setPin = (patch) => set({ pin: { ...pin, ...patch } });
  const cats = project.config.categories;
  return html`
    ${!hideTitle && html`<input class="title-in" value=${doc.title} placeholder="标题" onInput=${(e) => set({ title: e.target.value })} />`}
    <div style=${hideTitle ? '' : 'margin-top:14px'}>
      <${Field} label="英文副题"><${Text} value=${doc.subtitle} onChange=${(v) => set({ subtitle: v })} placeholder="Iceland, counter-clockwise" /><//>
      <${Field} label="日期"><input type="date" value=${String(doc.date ?? '').slice(0, 10)} onInput=${(e) => set({ date: e.target.value })} /><//>
      <${Field} label="栏目">
        <select value=${doc.category} onChange=${(e) => set({ category: e.target.value })}>
          ${!cats.some((c) => c.id === doc.category) && html`<option value=${doc.category}>${doc.category || '（未选）'}</option>`}
          ${cats.map((c) => html`<option value=${c.id}>${c.zh} · ${c.en}</option>`)}
        </select>
      <//>
      <${Field} label="标签"><${TagsInput} value=${doc.tags} onChange=${(v) => set({ tags: v })} known=${[...new Set(project.entries.flatMap((e) => e.tags ?? []))]} /><//>
      <${Field} label="摘要"><${Text} optional=${false} value=${doc.excerpt} onChange=${(v) => set({ excerpt: v ?? '' })} placeholder="目次里标题下面那一行" /><//>
      <${Field} label="封面"><${ImagePicker} value=${doc.cover} onChange=${(v) => set({ cover: v })} project=${project} refresh=${refresh} /><//>
      ${doc.cover && html`<${Field} label="封面说明"><${Text} value=${doc.coverAlt} onChange=${(v) => set({ coverAlt: v })} /><//>`}
      <${Field} label="草稿"><label class="row"><input type="checkbox" checked=${!!doc.draft} onChange=${(e) => set({ draft: e.target.checked || undefined })} /> <span class="lbl">只在本地预览里可见，不发布</span></label><//>
    </div>

    <section class="box">
      <h2>首页置顶 ${pin ? html`<button class="linkbtn" onClick=${() => set({ pin: undefined })}>取消置顶</button>` : html`<button class="linkbtn" onClick=${() => set({ pin: { order: 0, quote: [''], caption: '', meta: [] } })}>设为置顶</button>`}</h2>
      ${pin && html`
        <${Field} label="顺序"><input type="number" style="width:6em" value=${pin.order ?? 0} onInput=${(e) => setPin({ order: +e.target.value })} /><//>
        <${Field} label="开篇引文"><${QuoteLines} value=${pin.quote} onChange=${(v) => setPin({ quote: v })} /><//>
        <${Field} label="图注"><${Text} optional=${false} value=${pin.caption} onChange=${(v) => setPin({ caption: v ?? '' })} placeholder="地点 · 日期 · 路线" /><//>
        <${Field} label="三条信息"><${MetaRows} value=${pin.meta ?? []} onChange=${(v) => setPin({ meta: v })} /><//>
        <${Field} label="封面图"><${ImagePicker} value=${pin.image} onChange=${(v) => setPin({ image: v })} project=${project} refresh=${refresh} /><span class="lbl mono">不选就用文章封面</span><//>
        <${Field} label="图片说明"><${Text} value=${pin.alt} onChange=${(v) => setPin({ alt: v })} /><//>
        <${Field} label="淡出强度"><div class="row"><input type="range" min="0" max="1" step="0.05" value=${pin.fade ?? 0.5} onInput=${(e) => setPin({ fade: +e.target.value })} /><span class="mono lbl">${(pin.fade ?? 0.5).toFixed(2)}</span></div><//>
      `}
    </section>`;
}

/** 标签：逗号分隔地输入；输入框里保留原样，存回去是去重后的数组（空就不写进 JSON） */
function TagsInput({ value, onChange, known }) {
  const [text, setText] = useState((value ?? []).join('，'));
  const parse = (s) => [...new Set(s.split(/[,，、]/).map((t) => t.trim()).filter(Boolean))];
  return html`<input list="known-tags" value=${text} placeholder="用逗号分隔，如 旅行，摄影"
    onInput=${(e) => { setText(e.target.value); const t = parse(e.target.value); onChange(t.length ? t : undefined); }}
    onBlur=${() => setText(parse(text).join('，'))} />
    <datalist id="known-tags">${known.map((t) => html`<option key=${t} value=${t} />`)}</datalist>`;
}

/** 引文：一行一句，已按句读断好；首尾的「」由主题补 */
function QuoteLines({ value, onChange }) {
  const [text, setText] = useState((value ?? []).join('\n'));
  return html`<textarea rows="3" value=${text} placeholder="一行一句，按句读断好" onInput=${(e) => { setText(e.target.value); onChange(e.target.value.split('\n').filter((l) => l.trim() !== '').length ? e.target.value.split('\n').filter((l) => l.trim() !== '') : ['']); }} />`;
}

function MetaRows({ value, onChange }) {
  const set = (i, patch) => onChange(value.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return html`<div>
    ${value.map((r, i) => html`<div class="row" style="margin-bottom:4px">
      <input class="cell" style="width:7em" value=${r.label} placeholder="标签" onInput=${(e) => set(i, { label: e.target.value })} />
      <input class="cell" value=${r.value} placeholder="内容" onInput=${(e) => set(i, { value: e.target.value })} />
      <button class="linkbtn" onClick=${() => onChange(value.filter((_, k) => k !== i))}>删</button>
    </div>`)}
    ${value.length < 3 && html`<button class="linkbtn" onClick=${() => onChange([...value, { label: '', value: '' }])}>添加一条</button>`}
  </div>`;
}
