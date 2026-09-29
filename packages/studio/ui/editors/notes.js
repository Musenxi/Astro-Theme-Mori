import { html } from '../h.js';
import { InlineField } from '../components.js';

/** 旁注 / 脚注的正文。在正文里用 {文字|note:id} 或 {文字|fn:id} 引用；id 在这里定义 */
export function NotesEditor({ notes = {}, set }) {
  const ids = Object.keys(notes);
  const put = (n) => set({ notes: Object.keys(n).length ? n : undefined });
  const add = () => { let k = ids.length + 1; while (notes['n' + k]) k++; put({ ...notes, ['n' + k]: { text: '' } }); };
  const rename = (from, to) => {
    if (!to || to === from || notes[to]) return;
    put(Object.fromEntries(Object.entries(notes).map(([k, v]) => [k === from ? to : k, v])));
  };
  return html`<section class="box">
    <h2>旁注与脚注 <span class="lbl mono">正文里写 {文字|note:n1}（旁注）或 {文字|fn:n1}（脚注）</span></h2>
    ${ids.map((id) => html`<div class="row" key=${id} style="align-items:flex-start;margin:6px 0">
      <input class="cell mono" style="width:5.5em" value=${id} onChange=${(e) => rename(id, e.target.value.trim())} />
      <div style="flex:1"><${InlineField} rows=${1} value=${notes[id].text} onChange=${(v) => put({ ...notes, [id]: { text: v } })} /></div>
      <button class="linkbtn" onClick=${() => { const { [id]: _, ...rest } = notes; put(rest); }}>删</button>
    </div>`)}
    <div class="add"><button onClick=${add}>+ 添加一条</button></div>
  </section>`;
}
