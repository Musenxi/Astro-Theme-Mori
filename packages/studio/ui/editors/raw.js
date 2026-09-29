import { html, useState } from '../h.js';
import { useAutosave, SaveBar, Issues } from '../components.js';

/** 源码模式：直接编辑 JSON。JSON 语法有错时不保存，只提示；语法对了才走自动保存和校验 */
export function RawEditor({ kind, id, initial, preview }) {
  const [text, setText] = useState(JSON.stringify(initial, null, 2));
  const [doc, setDoc] = useState(initial);
  const [syntax, setSyntax] = useState('');
  const state = useAutosave(kind, id, doc, preview.reload);
  return html`<${SaveBar} state=${state} title=${(doc.title || id) + '（源码）'}>${preview.button}<//>
    <div class="pad">
      ${syntax && html`<p class="issues">JSON 语法错误：${syntax}（修好之前不会保存）</p>`}
      <${Issues} issues=${state.issues} />
      <textarea class="code" rows="40" style="width:100%;font:12.5px/1.6 var(--mono);white-space:pre;border:1px solid var(--rule);padding:10px" spellcheck="false" value=${text}
        onInput=${(e) => {
          setText(e.target.value);
          try { setDoc(JSON.parse(e.target.value)); setSyntax(''); } catch (err) { setSyntax(err.message); }
        }} />
    </div>`;
}
