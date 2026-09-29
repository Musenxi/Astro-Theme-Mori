import { html, useState } from '../h.js';
import { Field, Text, InlineField, ImagePicker, useAutosave, SaveBar, Issues, Warnings } from '../components.js';
import { spansToText, textToSpans, asSpans, compact } from '../inline.js';
import { MetaEditor } from './meta.js';
import { NotesEditor } from './notes.js';
import { BlockList, nextId, allIds } from './blocks.js';

const NAMES = { p: '段落', h: '标题', quote: '引用', image: '图片', list: '列表', code: '代码' };
const MAKE = {
  p: () => ({ type: 'p', text: '' }),
  h: () => ({ type: 'h', level: 2, text: '' }),
  quote: () => ({ type: 'quote', text: '', writing: 'h' }),
  image: () => ({ type: 'image', alt: '', layout: 'wide' }),
  list: () => ({ type: 'list', items: [''] }),
  code: () => ({ type: 'code', code: '' }),
};

export function PostEditor({ id, initial, project, refresh, preview }) {
  const [doc, setDoc] = useState(initial);
  const set = (patch) => setDoc((d) => ({ ...d, ...patch }));
  const state = useAutosave('post', id, doc, preview.reload);
  const setBlocks = (blocks) => set({ blocks });
  const add = (type) => set({ blocks: [...doc.blocks, { id: nextId(allIds(doc.blocks), 'b'), ...MAKE[type]() }] });

  return html`<${SaveBar} state=${state} title=${doc.title || id}>${preview.button}<//>
    <div class="pad">
      <${MetaEditor} doc=${doc} set=${set} project=${project} refresh=${refresh} />
      <${Issues} issues=${state.issues} />
      <${Warnings} warnings=${state.warnings} />
      <section class="box"><h2>正文</h2>
        <${BlockList} blocks=${doc.blocks} setBlocks=${setBlocks} label=${(b) => NAMES[b.type] ?? b.type}
          render=${(b, patch) => html`<${PostBlock} b=${b} patch=${patch} project=${project} refresh=${refresh} />`}
          palette=${Object.keys(NAMES).map((t) => html`<button key=${t} onClick=${() => add(t)}>${NAMES[t]}</button>`)} />
      </section>
      <${NotesEditor} notes=${doc.notes} set=${set} />
    </div>`;
}

function PostBlock({ b, patch, project, refresh }) {
  switch (b.type) {
    case 'p': return html`<${InlineField} rows=${3} value=${b.text} onChange=${(v) => patch({ text: v })} placeholder="正文。**粗** *斜* [链接](地址) {文字|note:n1}" />`;
    case 'h': return html`<div class="row">
      <select style="width:6em" value=${b.level ?? 2} onChange=${(e) => patch({ level: +e.target.value })}><option value="2">二级</option><option value="3">三级</option></select>
      <${InlineField} rows=${1} value=${b.text} onChange=${(v) => patch({ text: v })} placeholder="标题" /></div>`;
    case 'quote': return html`<${InlineField} rows=${2} value=${b.text} onChange=${(v) => patch({ text: v })} placeholder="引文" />
      <div class="grid2" style="margin-top:6px"><${Text} value=${b.cite} onChange=${(v) => patch({ cite: v })} placeholder="出处，如《考工记》" />
      <select value=${b.writing ?? 'h'} onChange=${(e) => patch({ writing: e.target.value })}><option value="h">横排</option><option value="v">竖排</option></select></div>`;
    case 'image': return html`<${ImagePicker} value=${b.src} onChange=${(v) => patch({ src: v })} project=${project} refresh=${refresh} optional=${false} />
      <div class="grid2" style="margin-top:6px"><input value=${b.alt ?? ''} placeholder="替代文字（读屏用）" onInput=${(e) => patch({ alt: e.target.value })} />
      <select value=${b.layout ?? 'wide'} onChange=${(e) => patch({ layout: e.target.value })}><option value="wide">跨出正文栏</option><option value="inline">与正文同宽</option></select></div>
      <input style="margin-top:6px" value=${b.caption ?? ''} placeholder="图注" onInput=${(e) => patch({ caption: e.target.value || undefined })} />`;
    case 'list': return html`<${ListField} b=${b} patch=${patch} />`;
    case 'code': return html`<div class="grid2" style="margin-bottom:6px"><input value=${b.lang ?? ''} placeholder="语言，如 ts" onInput=${(e) => patch({ lang: e.target.value || undefined })} /></div>
      <textarea class="code" rows="6" value=${b.code} spellcheck="false" onInput=${(e) => patch({ code: e.target.value })} />`;
  }
  return html`<span class="lbl">不认识的块类型 ${b.type}</span>`;
}

function ListField({ b, patch }) {
  const [text, setText] = useState(b.items.map((it) => spansToText(asSpans(it))).join('\n'));
  return html`<textarea rows="4" value=${text} placeholder="一行一项" onInput=${(e) => {
      setText(e.target.value);
      patch({ items: e.target.value.split('\n').map((l) => compact(textToSpans(l))) });
    }} />
    <label class="row" style="margin-top:4px"><input type="checkbox" checked=${!!b.ordered} onChange=${(e) => patch({ ordered: e.target.checked || undefined })} /> <span class="lbl">有序列表</span></label>`;
}
