import { html, useState } from '../h.js';

/** 下一个块 id：同前缀里最大的序号 + 1，如 b07 → b08（id 创建后不再变，批注靠它定位） */
export function nextId(used, prefix, width = 2) {
  let max = 0;
  for (const id of used) {
    const m = id.match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) max = Math.max(max, +m[1]);
  }
  return prefix + String(max + 1).padStart(width, '0');
}

/** 收集一篇里所有块 / 段落的 id */
export function allIds(blocks) {
  const ids = [];
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (typeof v.id === 'string') ids.push(v.id); Object.values(v).forEach(walk); } };
  walk(blocks);
  return ids;
}

/** 一个块的外壳：类型名、id、上移 / 下移 / 删除，以及拖动手柄排序 */
export function BlockList({ blocks, setBlocks, render, label, palette }) {
  const [drag, setDrag] = useState(null), [over, setOver] = useState(null), [grab, setGrab] = useState(null);
  const move = (i, to) => {
    if (to < 0 || to >= blocks.length || to === i) return;
    const next = [...blocks];
    next.splice(to, 0, next.splice(i, 1)[0]);
    setBlocks(next);
  };
  return html`<div>
    ${blocks.map((b, i) => html`<div key=${b.id} class=${'blk' + (over === i && drag !== null && drag !== i ? ' dragover' : '')}
      draggable=${grab === i}
      onDragStart=${(e) => { setDrag(i); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver=${(e) => { if (drag !== null) { e.preventDefault(); setOver(i); } }}
      onDrop=${(e) => { e.preventDefault(); if (drag !== null) move(drag, i); setDrag(null); setOver(null); setGrab(null); }}
      onDragEnd=${() => { setDrag(null); setOver(null); setGrab(null); }}>
      <div class="hd mono">
        <span style="cursor:grab" title="拖动排序" onMouseDown=${() => setGrab(i)} onMouseUp=${() => setGrab(null)}>⋮⋮</span>
        <span>${label(b)}</span><span class="lbl">${b.id}</span><span class="grow"></span>
        <button title="上移" onClick=${() => move(i, i - 1)}>↑</button>
        <button title="下移" onClick=${() => move(i, i + 1)}>↓</button>
        <button title="删除这个块" onClick=${() => { if (confirm('删除这个块？')) setBlocks(blocks.filter((_, k) => k !== i)); }}>删除</button>
      </div>
      <div class="bd">${render(b, (patch) => setBlocks(blocks.map((x, k) => (k === i ? { ...x, ...patch } : x))), i)}</div>
    </div>`)}
    <div class="add"><span class="mono">添加</span>${palette}</div>
  </div>`;
}
