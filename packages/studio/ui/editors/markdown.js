import { html, useState, useEffect, useRef } from '../h.js';
import { api } from '../api.js';
import { useAutosave, SaveBar, Issues, Warnings, Library } from '../components.js';
import { createEditor } from '../vendor/cm.js';
import { toMarkdown, fromMarkdown } from '../mdsync.js';
import { MetaEditor } from './meta.js';

const TOOLS = [
  ['粗体', 'bold', '⌘B'], ['斜体', 'italic', '⌘I'], ['链接', 'link', '⌘K'], ['行内代码', 'code'],
  ['|'], ['大标题', 'h2'], ['小标题', 'h3'], ['引用', 'quote'], ['列表', 'list'],
  ['|'], ['图片', 'image'], ['旁注', 'addNote'],
];

/** 用 Markdown 写一篇文章：一个大文本框，标题是第一行 `# 标题`；保存时解析成块，元信息在右侧“信息”抽屉里 */
export function MarkdownPost({ id, initial, project, refresh, preview, modeSwitch }) {
  const [doc, setDoc] = useState(initial);
  const state = useAutosave('post', id, doc, preview.reload);
  const host = useRef(), ed = useRef(), pending = useRef(null);
  const [info, setInfo] = useState(false), [lib, setLib] = useState(false);
  const set = (patch) => setDoc((d) => ({ ...d, ...patch }));

  useEffect(() => {
    const apply = () => { if (pending.current !== null) { const text = pending.current; pending.current = null; setDoc((d) => fromMarkdown(text, d)); } };
    let timer;
    ed.current = createEditor({
      parent: host.current, doc: toMarkdown(initial), placeholder: '# 标题\n\n开始写……',
      onChange: (text) => { pending.current = text; clearTimeout(timer); timer = setTimeout(apply, 250); },
      onImages: async (files) => { const names = []; for (const f of files) names.push((await api.upload(f)).name); await refresh(); return names; },
    });
    ed.current.focus();
    return () => { clearTimeout(timer); apply(); ed.current.destroy(); };
  }, []);

  useEffect(() => {
    if (!info) return;
    const esc = (e) => e.key === 'Escape' && setInfo(false);
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [info]);

  const run = (name) => (name === 'image' ? setLib(true) : ed.current[name]());
  return html`<${SaveBar} state=${state} title=${doc.title || id}>${modeSwitch}<button class=${'btn' + (info ? ' on' : '')} onClick=${() => setInfo(!info)}>信息</button>${preview.button}<//>
    <div class="md-wrap">
      <div class="md-tools">${TOOLS.map(([label, name, key], i) => (label === '|' ? html`<span key=${i} class="sep"></span>` : html`<button key=${name} title=${key ?? ''} onMouseDown=${(e) => e.preventDefault()} onClick=${() => run(name)}>${label}</button>`))}
        <span class="grow"></span><span class="mono lbl">${doc.blocks.length} 块</span></div>
      ${(state.issues.length > 0 || state.warnings?.length > 0) && html`<div class="md-notices"><${Issues} issues=${state.issues} /><${Warnings} warnings=${state.warnings} /></div>`}
      <div class="md-host" ref=${host}></div>
    </div>
    ${info && html`<aside class="drawer">
      <div class="row" style="padding:12px 20px;border-bottom:1px solid var(--rule)"><b class="grow" style="font-weight:400;letter-spacing:.15em">信息</b><button class="linkbtn" onClick=${() => setInfo(false)}>关闭</button></div>
      <div style="padding:8px 20px 60px"><${MetaEditor} hideTitle=${true} doc=${doc} set=${set} project=${project} refresh=${refresh} /></div>
    </aside>`}
    ${lib && html`<${Library} assets=${project.assets} onClose=${() => setLib(false)} onUploaded=${refresh} onPick=${(n) => { ed.current.insertBlock(`![](${n})`); setLib(false); }} />`}`;
}
