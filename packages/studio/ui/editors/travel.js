import { html, useState, useRef } from '../h.js';
import { Field, Text, Num, InlineField, ImagePicker, assetUrl, useAutosave, SaveBar, Issues, Warnings } from '../components.js';
import { MetaEditor } from './meta.js';
import { NotesEditor } from './notes.js';
import { BlockList, nextId, allIds } from './blocks.js';

const NAMES = { text: '文字', single: '单图', pair: '双图', strip: '图组', grid: '网格', free: '自由排布', map: '地图' };
const PREFIX = { text: 't', single: 's', pair: 'p', strip: 'st', grid: 'g', free: 'f', map: 'm' };
const MODES = [['v', '竖向'], ['h', '横向'], ['mix', '混合']];

export function TravelEditor({ id, initial, project, refresh, preview }) {
  const [doc, setDoc] = useState(initial);
  const set = (patch) => setDoc((d) => ({ ...d, ...patch }));
  const state = useAutosave('travel', id, doc, preview.reload);
  const ids = () => allIds(doc.blocks);

  const add = (type) => {
    const stop = doc.blocks.at(-1)?.stop ?? doc.stops[0]?.id;
    const bid = nextId(ids(), PREFIX[type]);
    const make = {
      text: () => ({ type, writing: 'h', paras: [{ id: `${bid}p1`, text: '' }] }),
      single: () => ({ type, alt: '', layout: 'full' }),
      pair: () => ({ type, images: [{ alt: '' }, { alt: '' }] }),
      strip: () => ({ type, images: [{ alt: '', scale: 1, offset: 0 }, { alt: '', scale: 1, offset: 0 }] }),
      grid: () => ({ type, images: [{ alt: '' }, { alt: '' }] }),
      free: () => ({ type, ar: 1.6, items: [] }),
      map: () => ({ type, scope: 'route' }),
    }[type]();
    set({ blocks: [...doc.blocks, { id: bid, stop, ...make }] });
  };

  return html`<${SaveBar} state=${state} title=${doc.title || id}>${preview.button}<//>
    <div class="pad">
      <${MetaEditor} doc=${doc} set=${set} project=${project} refresh=${refresh} />
      <${Issues} issues=${state.issues} />
      <${Warnings} warnings=${state.warnings} />
      <${ReadingEditor} doc=${doc} set=${set} />
      <${FactsEditor} facts=${doc.facts ?? []} set=${(v) => set({ facts: v })} />
      <${StopsEditor} doc=${doc} set=${set} />
      <section class="box"><h2>内容块 <span class="lbl mono">${doc.blocks.length} 个</span></h2>
        <${BlockList} blocks=${doc.blocks} setBlocks=${(blocks) => set({ blocks })} label=${(b) => NAMES[b.type] ?? b.type}
          render=${(b, patch) => html`<${TravelBlock} b=${b} patch=${patch} doc=${doc} project=${project} refresh=${refresh} ids=${ids} />`}
          palette=${Object.keys(NAMES).map((t) => html`<button key=${t} onClick=${() => add(t)}>${NAMES[t]}</button>`)} />
      </section>
      <${NotesEditor} notes=${doc.notes} set=${set} />
    </div>`;
}

/* ───────────── 读法、事实、站点 ───────────── */

function ReadingEditor({ doc, set }) {
  const r = doc.reading ?? { default: 'v', allowed: ['v', 'h', 'mix'], direction: 'ltr' };
  const put = (patch) => set({ reading: { ...r, ...patch } });
  const toggle = (m) => {
    const has = r.allowed.includes(m);
    if (has && r.allowed.length === 1) return;
    const allowed = has ? r.allowed.filter((x) => x !== m) : [...r.allowed, m];
    put({ allowed, default: allowed.includes(r.default) ? r.default : allowed[0] });
  };
  return html`<section class="box"><h2>读法</h2>
    <${Field} label="允许"><div class="row">${MODES.map(([m, n]) => html`<label class="row" key=${m}><input type="checkbox" checked=${r.allowed.includes(m)} onChange=${() => toggle(m)} />${n}</label>`)}</div><//>
    <${Field} label="默认"><select style="width:9em" value=${r.default} onChange=${(e) => put({ default: e.target.value })}>${MODES.filter(([m]) => r.allowed.includes(m)).map(([m, n]) => html`<option value=${m}>${n}</option>`)}</select><//>
    <${Field} label="横滚方向"><select style="width:12em" value=${r.direction} onChange=${(e) => put({ direction: e.target.value })}><option value="ltr">左 → 右</option><option value="rtl">右 → 左（手卷）</option></select><//>
  </section>`;
}

function FactsEditor({ facts, set }) {
  const put = (i, patch) => set(facts.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  return html`<section class="box"><h2>事实 <span class="lbl mono">封面里的“路线 / 日期 / 里程”</span></h2>
    ${facts.map((f, i) => html`<div class="row" style="margin-bottom:4px" key=${i}>
      <input class="cell" style="width:7em" value=${f.label} placeholder="标签" onInput=${(e) => put(i, { label: e.target.value })} />
      <input class="cell" value=${f.value} placeholder="内容" onInput=${(e) => put(i, { value: e.target.value })} />
      <button class="linkbtn" onClick=${() => set(facts.filter((_, k) => k !== i))}>删</button></div>`)}
    <div class="add"><button onClick=${() => set([...facts, { label: '', value: '' }])}>+ 添加一条</button></div>
  </section>`;
}

function StopsEditor({ doc, set }) {
  const stops = doc.stops;
  const used = (sid) => doc.blocks.filter((b) => b.stop === sid).length;
  const put = (i, patch) => set({ stops: stops.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const rename = (i, to) => {
    const from = stops[i].id;
    if (!to || to === from || stops.some((s) => s.id === to) || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(to)) return;
    // 改站点 id 时，引用它的块一起改
    set({ stops: stops.map((s, k) => (k === i ? { ...s, id: to } : s)), blocks: doc.blocks.map((b) => (b.stop === from ? { ...b, stop: to } : b)) });
  };
  const move = (i, to) => { if (to < 0 || to >= stops.length) return; const n = [...stops]; n.splice(to, 0, n.splice(i, 1)[0]); set({ stops: n }); };
  const add = () => { let k = stops.length + 1; while (stops.some((s) => s.id === 's' + k)) k++; set({ stops: [...stops, { id: 's' + k, name: '', lnglat: [0, 0] }] }); };
  return html`<section class="box"><h2>站点 <span class="lbl mono">${stops.length} 个 · 顺序就是路线的先后 · 经纬度：经度在前</span></h2>
    ${stops.map((s, i) => html`<div class="blk" key=${i}><div class="bd">
      <div class="row" style="margin-bottom:6px"><span class="mono lbl" style="width:2em">${String(i + 1).padStart(2, '0')}</span>
        <input class="cell" value=${s.name} placeholder="站名" onInput=${(e) => put(i, { name: e.target.value })} />
        <input class="cell" value=${s.en ?? ''} placeholder="英文名" onInput=${(e) => put(i, { en: e.target.value || undefined })} />
        <button title="上移" class="linkbtn" onClick=${() => move(i, i - 1)}>↑</button><button title="下移" class="linkbtn" onClick=${() => move(i, i + 1)}>↓</button>
        <button class="linkbtn" onClick=${() => { if (!used(s.id) || confirm(`有 ${used(s.id)} 个块属于这一站，删了它们会报错。仍要删除？`)) set({ stops: stops.filter((_, k) => k !== i) }); }}>删</button></div>
      <div class="grid3">
        <label class="row"><span class="mono lbl">id</span><input class="cell mono" value=${s.id} onChange=${(e) => rename(i, e.target.value.trim())} /></label>
        <label class="row"><span class="mono lbl">经度</span><${Num} value=${s.lnglat[0]} onChange=${(v) => put(i, { lnglat: [v ?? 0, s.lnglat[1]] })} /></label>
        <label class="row"><span class="mono lbl">纬度</span><${Num} value=${s.lnglat[1]} onChange=${(v) => put(i, { lnglat: [s.lnglat[0], v ?? 0] })} /></label>
      </div>
      <input class="cell" style="margin-top:6px" value=${s.date ?? ''} placeholder="到达日期，只用于显示，如 06.20" onInput=${(e) => put(i, { date: e.target.value || undefined })} />
    </div></div>`)}
    <div class="add"><button onClick=${add}>+ 添加站点</button></div>
  </section>`;
}

/* ───────────── 块 ───────────── */

function Place({ b, patch, doc }) {
  return html`<div class="grid3" style="margin-bottom:8px">
    <label class="row"><span class="mono lbl">站点</span><select value=${b.stop} onChange=${(e) => patch({ stop: e.target.value })}>${doc.stops.map((s) => html`<option value=${s.id}>${s.name || s.id}</option>`)}</select></label>
    <label class="row"><span class="mono lbl" title="横滚时的上下位置：0 顶 1 底">y</span><${Num} value=${b.y} onChange=${(v) => patch({ y: v })} min="0" max="1" placeholder="0.5" /></label>
    <label class="row"><span class="mono lbl" title="横滚时的缩放">缩放</span><${Num} value=${b.scale} onChange=${(v) => patch({ scale: v })} min="0.1" placeholder="1" /></label>
  </div>`;
}

const Pic = ({ v, onChange, project, refresh }) => html`<${ImagePicker} value=${v} onChange=${onChange} project=${project} refresh=${refresh} optional=${false} />`;

function TravelBlock({ b, patch, doc, project, refresh, ids }) {
  const place = html`<${Place} b=${b} patch=${patch} doc=${doc} />`;
  const imgs = (list, extra) => html`${list.map((im, i) => html`<div key=${i} style="border-top:1px solid var(--rule);padding:8px 0">
    <${Pic} v=${im.src} onChange=${(v) => patch({ images: list.map((x, k) => (k === i ? { ...x, src: v } : x)) })} project=${project} refresh=${refresh} />
    <div class="grid2" style="margin-top:6px"><input class="cell" placeholder="替代文字" value=${im.alt ?? ''} onInput=${(e) => patch({ images: list.map((x, k) => (k === i ? { ...x, alt: e.target.value } : x)) })} />
      <input class="cell" placeholder="图注" value=${im.caption ?? ''} onInput=${(e) => patch({ images: list.map((x, k) => (k === i ? { ...x, caption: e.target.value || undefined } : x)) })} /></div>
    ${extra?.(im, i)}
    ${list.length > (b.type === 'pair' ? 2 : 2) && b.type !== 'pair' && html`<button class="linkbtn" onClick=${() => patch({ images: list.filter((_, k) => k !== i) })}>移除这张</button>`}
  </div>`)}`;

  switch (b.type) {
    case 'text': return html`${place}
      <div class="grid2" style="margin-bottom:6px">
        <select value=${b.writing ?? 'h'} onChange=${(e) => patch({ writing: e.target.value })}><option value="h">横排</option><option value="v">竖排</option></select>
        <select value=${b.head === undefined ? 'auto' : String(b.head)} onChange=${(e) => patch({ head: e.target.value === 'auto' ? undefined : e.target.value === 'true' })}><option value="auto">站点标题：自动（这一站第一个文字块）</option><option value="true">站点标题：显示</option><option value="false">站点标题：不显示</option></select></div>
      ${b.paras.map((p, i) => html`<div class="row" key=${p.id} style="align-items:flex-start;margin-bottom:4px">
        <span class="mono lbl" style="width:5.5em;padding-top:6px">${p.id}</span>
        <div style="flex:1"><${InlineField} rows=${2} value=${p.text} onChange=${(v) => patch({ paras: b.paras.map((x, k) => (k === i ? { ...x, text: v } : x)) })} placeholder="这一段" /></div>
        ${b.paras.length > 1 && html`<button class="linkbtn" onClick=${() => patch({ paras: b.paras.filter((_, k) => k !== i) })}>删</button>`}</div>`)}
      <div class="add"><button onClick=${() => { let n = b.paras.length + 1; const used = new Set(ids()); while (used.has(`${b.id}p${n}`)) n++; patch({ paras: [...b.paras, { id: `${b.id}p${n}`, text: '' }] }); }}>+ 添加一段</button></div>`;
    case 'single': return html`${place}<${Pic} v=${b.src} onChange=${(v) => patch({ src: v })} project=${project} refresh=${refresh} />
      <div class="grid2" style="margin-top:6px"><input class="cell" placeholder="替代文字" value=${b.alt ?? ''} onInput=${(e) => patch({ alt: e.target.value })} />
      <select value=${b.layout ?? 'full'} onChange=${(e) => patch({ layout: e.target.value })}><option value="full">通栏</option><option value="inset">内缩</option></select></div>
      <input class="cell" style="margin-top:6px" placeholder="图注" value=${b.caption ?? ''} onInput=${(e) => patch({ caption: e.target.value || undefined })} />`;
    case 'pair': return html`${place}${imgs(b.images)}`;
    case 'grid': return html`${place}${imgs(b.images)}<div class="add"><button onClick=${() => patch({ images: [...b.images, { alt: '' }] })}>+ 添加一张</button></div>`;
    case 'strip': return html`${place}${imgs(b.images, (im, i) => html`<div class="grid2" style="margin-top:6px">
        <label class="row"><span class="mono lbl">缩放</span><${Num} value=${im.scale} onChange=${(v) => patch({ images: b.images.map((x, k) => (k === i ? { ...x, scale: v ?? 1 } : x)) })} /></label>
        <label class="row"><span class="mono lbl">上下错开</span><${Num} value=${im.offset} onChange=${(v) => patch({ images: b.images.map((x, k) => (k === i ? { ...x, offset: v ?? 0 } : x)) })} /></label></div>`)}
      <div class="add"><button onClick=${() => patch({ images: [...b.images, { alt: '', scale: 1, offset: 0 }] })}>+ 添加一张</button></div>`;
    case 'map': return html`${place}<select value=${b.scope ?? 'route'} onChange=${(e) => patch({ scope: e.target.value })}><option value="route">全程路线</option><option value="stop">只看这一站附近</option></select>`;
    case 'free': return html`${place}<${FreeCanvas} b=${b} patch=${patch} project=${project} refresh=${refresh} />`;
  }
  return html`<span class="lbl">不认识的块类型 ${b.type}</span>`;
}

/* ───────────── 自由排布：在画布上直接拖动 ───────────── */

function FreeCanvas({ b, patch, project, refresh }) {
  const [sel, setSel] = useState(null);
  const box = useRef();
  const items = b.items;
  const put = (i, p) => patch({ items: items.map((it, k) => (k === i ? { ...it, ...p } : it)) });
  const round = (v) => Math.round(v * 1000) / 1000;
  const clamp = (v) => Math.min(1, Math.max(0, v));

  // 拖动：按指针移动量换算成占画布的比例
  const startDrag = (e, i) => {
    e.preventDefault(); setSel(i);
    const r = box.current.getBoundingClientRect(), it = items[i], sx = e.clientX, sy = e.clientY, x0 = it.x, y0 = it.y;
    const move = (ev) => put(i, { x: round(clamp(x0 + (ev.clientX - sx) / r.width)), y: round(clamp(y0 + (ev.clientY - sy) / r.height)) });
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };
  const s = sel !== null ? items[sel] : null;
  const addImage = (name) => patch({ items: [...items, { kind: 'image', src: `../../assets/${name}`, alt: '', x: 0.1, y: 0.1, w: 0.4, z: items.length + 1 }] });
  const [lib, setLib] = useState(false);

  return html`<div>
    <div class="row" style="margin-bottom:6px"><label class="row"><span class="mono lbl">画布宽高比</span><${Num} value=${b.ar} onChange=${(v) => v && patch({ ar: v })} min="0.2" /></label><span class="mono lbl">拖动图片调整位置；下面调宽度和叠放</span></div>
    <div ref=${box} style=${`position:relative;width:100%;aspect-ratio:${b.ar};border:1px dashed var(--rule);background:var(--paper-2);touch-action:none`}>
      ${items.map((it, i) => it.kind === 'image'
        ? html`<img key=${i} src=${assetUrl(it.src, 400)} draggable="false" onPointerDown=${(e) => startDrag(e, i)}
            style=${`position:absolute;left:${it.x * 100}%;top:${it.y * 100}%;width:${it.w * 100}%;z-index:${it.z ?? 1};cursor:move;outline:${sel === i ? '2px solid var(--accent)' : '1px solid var(--rule)'}`} />`
        : html`<div key=${i} onPointerDown=${(e) => startDrag(e, i)} class="mono"
            style=${`position:absolute;left:${it.x * 100}%;top:${it.y * 100}%;writing-mode:vertical-rl;cursor:move;padding:2px;z-index:99;outline:${sel === i ? '2px solid var(--accent)' : '1px dashed var(--ink-3)'};background:var(--paper)`}>文字</div>`)}
    </div>
    ${s && html`<div class="grid3" style="margin-top:8px">
      <label class="row"><span class="mono lbl">x</span><${Num} value=${s.x} onChange=${(v) => put(sel, { x: v ?? 0 })} min="0" max="1" /></label>
      <label class="row"><span class="mono lbl">y</span><${Num} value=${s.y} onChange=${(v) => put(sel, { y: v ?? 0 })} min="0" max="1" /></label>
      ${s.kind === 'image' && html`<label class="row"><span class="mono lbl">宽度</span><${Num} value=${s.w} onChange=${(v) => put(sel, { w: v ?? 0.3 })} min="0.05" max="1" /></label>`}
    </div>
    ${s.kind === 'image' ? html`<div class="grid2" style="margin-top:6px"><label class="row"><span class="mono lbl">叠放</span><${Num} value=${s.z} onChange=${(v) => put(sel, { z: Math.round(v ?? 1) })} /></label><input class="cell" placeholder="替代文字" value=${s.alt ?? ''} onInput=${(e) => put(sel, { alt: e.target.value })} /></div>`
      : html`<div style="margin-top:6px"><${InlineField} rows=${2} value=${s.text} onChange=${(v) => put(sel, { text: v })} placeholder="竖排的一小段文字" /></div>`}
    <button class="linkbtn" style="margin-top:6px" onClick=${() => { patch({ items: items.filter((_, k) => k !== sel) }); setSel(null); }}>移除选中的</button>`}
    <div class="add"><button onClick=${() => setLib(true)}>+ 加一张图</button><button onClick=${() => patch({ items: [...items, { kind: 'text', text: '', x: 0.85, y: 0.1 }] })}>+ 加一段竖排文字</button></div>
    ${lib && html`<${LibraryPick} project=${project} refresh=${refresh} onPick=${(n) => { addImage(n); setLib(false); }} onClose=${() => setLib(false)} />`}
  </div>`;
}

import { Library } from '../components.js';
function LibraryPick({ project, refresh, onPick, onClose }) {
  return html`<${Library} assets=${project.assets} onPick=${onPick} onClose=${onClose} onUploaded=${refresh} />`;
}
