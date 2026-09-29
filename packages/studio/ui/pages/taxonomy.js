import { html, useState, useMemo } from '../h.js';

const post = (url, body, method = 'POST') => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ?? `失败（${r.status}）`); return j; });

/** 分类（写回 mori.config.ts 的 categories）和标签（改每篇文章的 tags） */
export function Taxonomy({ project, refresh }) {
  const used = (id) => project.entries.filter((e) => e.category === id).length;
  const [rows, setRows] = useState(() => project.config.categories.map((c) => ({ ...c, orig: c.id })));
  const [msg, setMsg] = useState(''), [bad, setBad] = useState(false);
  const dirty = JSON.stringify(rows.map(({ orig, ...c }) => c)) !== JSON.stringify(project.config.categories.map((c) => ({ ...c })));
  const put = (i, patch) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const move = (i, to) => { if (to < 0 || to >= rows.length) return; const n = [...rows]; n.splice(to, 0, n.splice(i, 1)[0]); setRows(n); };
  const add = () => { let k = rows.length + 1; while (rows.some((r) => r.id === 'c' + k)) k++; setRows([...rows, { id: 'c' + k, zh: '', en: '', orig: null }]); };
  const save = async () => {
    try {
      const renames = Object.fromEntries(rows.filter((r) => r.orig && r.orig !== r.id).map((r) => [r.orig, r.id]));
      const j = await post('/api/categories', { categories: rows.map(({ orig, ...c }) => ({ ...c, empty: c.empty || undefined })), renames }, 'PUT');
      await refresh(); setRows(j.categories.map((c) => ({ ...c, orig: c.id }))); setBad(false); setMsg(j.moved ? `已保存，并更新了 ${j.moved} 篇文章的栏目` : '已保存');
    } catch (e) { setBad(true); setMsg(e.message); }
  };

  const counts = useMemo(() => { const m = new Map(); for (const e of project.entries) for (const t of e.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh')); }, [project.entries]);
  const [editing, setEditing] = useState(null), [name, setName] = useState('');
  const rename = async (from, to) => {
    try { const j = await post('/api/tags/rename', { from, to }); await refresh(); setEditing(null); setBad(false); setMsg(`已更新 ${j.changed} 篇`); } catch (e) { setBad(true); setMsg(e.message); }
  };

  return html`<div class="bar"><b class="grow" style="font-weight:400;letter-spacing:.15em">分类 / 标签</b><span class=${'status mono' + (bad ? ' bad' : '')}>${msg}</span></div>
    <div class="pad">
      <section class="box" style="margin-top:0;border-top:0"><h2>分类 <span class="lbl mono">顺序就是栏目在页面上的先后</span></h2>
        <div class="table cats">
          <div class="tr thead"><span class="th">中文名</span><span class="th">英文名</span><span class="th">地址名</span><span class="th r">篇数</span><span></span></div>
          ${rows.map((r, i) => html`<div class="tr" key=${r.orig ?? 'new' + i}>
            <input class="cell" value=${r.zh} placeholder="中文名" onInput=${(e) => put(i, { zh: e.target.value })} />
            <input class="cell" value=${r.en ?? ''} placeholder="English" onInput=${(e) => put(i, { en: e.target.value })} />
            <input class="cell mono" value=${r.id} onInput=${(e) => put(i, { id: e.target.value.trim() })} />
            <span class="mono r">${r.orig ? used(r.orig) : 0}</span>
            <span class="acts mono"><button class="linkbtn" onClick=${() => move(i, i - 1)}>↑</button><button class="linkbtn" onClick=${() => move(i, i + 1)}>↓</button>
              <button class="linkbtn" disabled=${!!r.orig && used(r.orig) > 0} title=${r.orig && used(r.orig) ? '还有文章在用这个分类，先把它们改到别的分类' : ''} onClick=${() => setRows(rows.filter((_, k) => k !== i))}>删</button></span>
          </div>`)}
        </div>
        <div class="row" style="margin-top:10px"><button class="linkbtn" onClick=${add}>+ 添加分类</button><span class="grow"></span>
          ${dirty && html`<button class="btn" onClick=${() => { setRows(project.config.categories.map((c) => ({ ...c, orig: c.id }))); setMsg(''); }}>放弃修改</button><button class="btn primary" onClick=${save}>保存</button>`}</div>
        <p class="lbl mono" style="margin-top:8px">地址名是网址里用的英文名；改它会同时更新用到它的文章。</p>
      </section>
      <section class="box"><h2>标签 <span class="lbl mono">${counts.length} 个 · 在文章的「信息」里给文章加标签</span></h2>
        ${counts.length === 0 ? html`<p class="lbl">还没有标签。</p>` : html`<div class="table tagt">${counts.map(([t, n]) => html`<div class="tr" key=${t}>
          ${editing === t
            ? html`<span class="row"><input class="cell" autofocus value=${name} onInput=${(e) => setName(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter' && name.trim() && name.trim() !== t) rename(t, name); if (e.key === 'Escape') setEditing(null); }} />
                <span class="mono lbl" style="white-space:nowrap">${counts.some(([x]) => x === name.trim() && x !== t) ? '已有这个标签，将合并' : '回车确认'}</span></span>`
            : html`<span>${t}</span>`}
          <span class="mono r">${n} 篇</span>
          <span class="acts mono"><button class="linkbtn" onClick=${() => { setEditing(t); setName(t); }}>改名 / 合并</button>
            <button class="linkbtn" onClick=${() => confirm(`从 ${n} 篇文章里去掉标签「${t}」？`) && rename(t, null)}>删除</button></span>
        </div>`)}</div>`}
      </section>
    </div>`;
}
