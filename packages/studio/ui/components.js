import { html, useState, useEffect, useRef } from './h.js';
import { api } from './api.js';
import { spansToText, textToSpans, asSpans, compact } from './inline.js';

/** 内容 JSON 到图片的相对路径：src/content/{posts,travels}/x.json → ../../assets/name */
export const assetPath = (name) => `../../assets/${name}`;
export const assetName = (p) => (p ? p.split('/').pop() : '');
export const assetUrl = (p, w = 240) => (p ? `/asset/${encodeURIComponent(assetName(p))}?w=${w}` : '');

/** 行内文字输入：编辑框里是轻量标记（**粗** *斜* {文字|note:n1} ……），存回去是“文字 + 标注” */
export function InlineField({ value, onChange, rows = 2, placeholder, className = '' }) {
  const [text, setText] = useState(() => spansToText(asSpans(value)));
  const ta = useRef();
  const fit = () => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; } };
  useEffect(fit, [text]);
  return html`<textarea ref=${ta} class=${className} rows=${rows} placeholder=${placeholder} value=${text}
    onInput=${(e) => { setText(e.target.value); onChange(compact(textToSpans(e.target.value))); }} />`;
}

export function Field({ label, children }) {
  return html`<div class="field"><label>${label}</label><div>${children}</div></div>`;
}

/** 受控的普通输入：空字符串存成 undefined（可选字段不写进 JSON） */
export function Text({ value, onChange, optional = true, ...rest }) {
  return html`<input value=${value ?? ''} onInput=${(e) => onChange(optional && e.target.value === '' ? undefined : e.target.value)} ...${rest} />`;
}
export function Num({ value, onChange, ...rest }) {
  return html`<input type="number" class="cell" value=${value ?? ''} step="any" onInput=${(e) => onChange(e.target.value === '' ? undefined : +e.target.value)} ...${rest} />`;
}

/** 图库：选一张已有的，或拖入 / 选择新图片 */
export function Library({ assets, onPick, onClose, onUploaded }) {
  const [over, setOver] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const upload = async (files) => {
    setBusy(true); setErr('');
    try {
      let last;
      for (const f of files) last = (await api.upload(f)).name;
      await onUploaded();
      if (files.length === 1 && last) onPick(last);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return html`<div class="lib" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="panel">
      <div class="row"><b style="flex:1">图库</b><span class="mono lbl">${assets.length} 张 · src/assets</span><button class="linkbtn" onClick=${onClose}>关闭</button></div>
      <div class=${'drop' + (over ? ' over' : '')} style="margin-top:10px"
        onDragOver=${(e) => { e.preventDefault(); setOver(true); }} onDragLeave=${() => setOver(false)}
        onDrop=${(e) => { e.preventDefault(); setOver(false); upload([...e.dataTransfer.files]); }}>
        ${busy ? '上传中……' : html`把图片拖到这里，或 <label class="linkbtn" style="cursor:pointer">选择文件<input type="file" accept="image/*" multiple hidden onChange=${(e) => upload([...e.target.files])} /></label>`}
      </div>
      ${err && html`<p class="status bad" style="margin-top:8px">${err}</p>`}
      <div class="imgs">${assets.map((n) => html`<button key=${n} onClick=${() => onPick(n)}><img loading="lazy" src=${assetUrl(n, 240)} alt="" /><span>${n}</span></button>`)}</div>
    </div></div>`;
}

/** 图片字段：缩略图 + 选择 / 清除 */
export function ImagePicker({ value, onChange, project, refresh, optional = true }) {
  const [open, setOpen] = useState(false);
  return html`<div class="pick">
    ${value ? html`<img class="thumb" src=${assetUrl(value, 160)} alt="" />` : html`<div class="thumb empty mono">无</div>`}
    <div>
      <div class="mono lbl">${assetName(value) || '未选择'}</div>
      <button class="linkbtn" onClick=${() => setOpen(true)}>${value ? '更换' : '选择图片'}</button>
      ${value && optional && html` · <button class="linkbtn" onClick=${() => onChange(undefined)}>清除</button>`}
    </div>
    ${open && html`<${Library} assets=${project.assets} onClose=${() => setOpen(false)} onUploaded=${refresh}
      onPick=${(n) => { onChange(assetPath(n)); setOpen(false); }} />`}
  </div>`;
}

/**
 * 自动保存：内容变了 700ms 后写回项目文件。校验问题不阻止保存（写作过程中难免不完整），只在界面上提示。
 * 返回 { status: 'saved' | 'saving' | 'error', issues }
 */
export function useAutosave(kind, id, doc, onSaved) {
  const [state, setState] = useState({ status: 'saved', issues: [], warnings: [] });
  const first = useRef(true), timer = useRef(), latest = useRef(doc);
  latest.current = doc;
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setState((s) => ({ ...s, status: 'saving' }));
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = await api.save(kind, id, latest.current);
        setState({ status: 'saved', issues: r.errors ?? [], warnings: r.annotationWarnings ?? [] });
        onSaved?.();
      } catch (e) { setState({ status: 'error', issues: [{ path: '', message: e.message }], warnings: [] }); }
    }, 700);
    return () => clearTimeout(timer.current);
  }, [doc]);
  return state;
}

export function SaveBar({ state, title, children }) {
  const n = state.issues.length;
  const text = state.status === 'saving' ? '保存中……' : state.status === 'error' ? '保存失败' : n ? `已保存，有 ${n} 处需要检查` : '已保存';
  return html`<div class="bar">
    <b class="grow" style="font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${title}</b>
    <span class=${'status mono' + (state.status === 'error' || n ? ' bad' : '')}>${text}</span>
    ${children}
  </div>`;
}

export function Issues({ issues }) {
  if (!issues.length) return null;
  return html`<ul class="issues">${issues.map((i) => html`<li><span class="mono">${i.path || '文章'}</span> ${i.message}</li>`)}</ul>`;
}

/** 这次修改会让已有的划词批注找不到原文：只提醒，不阻止保存（读者的批注在评论区照常显示，只是引用旁会标“原文已修改”） */
export function Warnings({ warnings }) {
  if (!warnings?.length) return null;
  return html`<div class="notice"><b>这次修改会让 ${warnings.length} 条读者批注找不到原文：</b>
    <ul>${warnings.slice(0, 5).map((w) => html`<li>“${(w.quote ?? '').slice(0, 30)}${(w.quote ?? '').length > 30 ? '……' : ''}”</li>`)}</ul>
    ${warnings.length > 5 && html`<span class="lbl">还有 ${warnings.length - 5} 条。</span>`}
    <span class="lbl">这些批注会在评论区里保留，引用旁标注“原文已修改”，点击不再跳转。想保留的话，把这段文字改回去。</span></div>`;
}
