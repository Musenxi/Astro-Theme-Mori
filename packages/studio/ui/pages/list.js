import { html, useState, useMemo } from '../h.js';
import { api } from '../api.js';

const TITLE = { post: '文章', travel: '游记', draft: '草稿箱' };
const NAME = { post: '文章', travel: '游记' };
const fmt = (n) => (n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n));

/** 文章 / 游记 / 草稿箱的管理表：搜索、按栏目和状态过滤、点列头排序，行尾发布 / 转草稿 / 删除 */
export function EntryList({ view, project, refresh }) {
  const [q, setQ] = useState(''), [cat, setCat] = useState(''), [tag, setTag] = useState(''), [status, setStatus] = useState('all'), [sort, setSort] = useState(['date', -1]), [err, setErr] = useState('');
  const cats = project.config.categories;
  const catName = (id) => cats.find((c) => c.id === id)?.zh ?? id ?? '';
  const base = project.entries.filter((e) => (view === 'draft' ? e.draft : e.kind === view));
  const tags = useMemo(() => [...new Set(base.flatMap((e) => e.tags ?? []))].sort(), [project.entries, view]);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = base.filter((e) => (!term || e.title.toLowerCase().includes(term) || e.id.toLowerCase().includes(term))
      && (!cat || e.category === cat) && (!tag || e.tags?.includes(tag))
      && (view === 'draft' || status === 'all' || (status === 'draft') === e.draft));
    const [key, dir] = sort;
    const val = (e) => (key === 'category' ? catName(e.category) : e[key] ?? '');
    return list.sort((a, b) => (typeof val(a) === 'number' ? val(a) - val(b) : String(val(a)).localeCompare(String(val(b)), 'zh')) * dir);
  }, [project.entries, view, q, cat, tag, status, sort]);

  const toggleDraft = async (e) => {
    try {
      const d = await api.entry(e.kind, e.id);
      if (e.draft) delete d.draft; else d.draft = true;
      await api.save(e.kind, e.id, d); await refresh();
    } catch (x) { setErr(x.message); }
  };
  const del = async (e) => {
    if (!confirm(`删除「${e.title}」？文件不会彻底删除，会保留在项目的回收站文件夹里。`)) return;
    try { await api.remove(e.kind, e.id); await refresh(); } catch (x) { setErr(x.message); }
  };
  const head = (key, label, cls = '') => html`<button class=${'th ' + cls} onClick=${() => setSort(([k, d]) => (k === key ? [key, -d] : [key, key === 'title' || key === 'category' ? 1 : -1]))}>${label}${sort[0] === key ? (sort[1] < 0 ? ' ↓' : ' ↑') : ''}</button>`;

  return html`<div class="bar"><b class="grow" style="font-weight:400;letter-spacing:.15em">${TITLE[view]} <span class="mono lbl">${rows.length === base.length ? base.length : `${rows.length} / ${base.length}`}</span></b>
      ${view !== 'draft' && html`<a class="btn primary" href=${`#/new/${view}`}>撰写</a>`}</div>
    <div class="pad wide">
      <div class="filters">
        <input class="cell" style="max-width:16em" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="搜索标题或地址名" />
        <select class="cell" style="width:auto" value=${cat} onChange=${(e) => setCat(e.target.value)}><option value="">全部栏目</option>${cats.map((c) => html`<option value=${c.id}>${c.zh}</option>`)}</select>
        ${tags.length > 0 && html`<select class="cell" style="width:auto" value=${tag} onChange=${(e) => setTag(e.target.value)}><option value="">全部标签</option>${tags.map((t) => html`<option value=${t}>${t}</option>`)}</select>`}
        ${view !== 'draft' && html`<div class="seg">${[['all', '全部'], ['pub', '已发布'], ['draft', '草稿']].map(([k, n]) => html`<button key=${k} aria-pressed=${status === k} onClick=${() => setStatus(k)}>${n}</button>`)}</div>`}
      </div>
      ${err && html`<p class="issues">${err}</p>`}
      <div class="table">
        <div class="tr thead">${head('title', '标题')}${head('category', '栏目')}<span class="th">标签</span>${head('date', '日期')}${head('words', '字数', 'r')}<span class="th">状态</span><span></span></div>
        ${rows.map((e) => html`<div class=${'tr' + (e.draft ? ' is-draft' : '')} key=${e.kind + e.id}>
          <a class="ttl" href=${`#/${e.kind}/${e.id}`}>${e.title}${view === 'draft' && html`<span class="mono lbl"> · ${NAME[e.kind]}</span>`}${e.pinned && html`<span class="mono lbl"> · 置顶</span>`}</a>
          <span>${catName(e.category)}</span>
          <span class="tags">${(e.tags ?? []).map((t) => html`<button key=${t} class="chip" onClick=${() => setTag(t)}>${t}</button>`)}</span>
          <span class="mono">${e.date}</span>
          <span class="mono r">${e.broken ? '' : fmt(e.words ?? 0)}</span>
          <span class="mono lbl">${e.draft ? '草稿' : '已发布'}</span>
          <span class="acts mono"><button class="linkbtn" onClick=${() => toggleDraft(e)}>${e.draft ? '发布' : '转草稿'}</button><button class="linkbtn" onClick=${() => del(e)}>删除</button></span>
        </div>`)}
        ${rows.length === 0 && html`<div class="empty-state" style="padding:48px 0">${base.length ? '没有符合条件的。' : view === 'draft' ? '草稿箱是空的。' : html`还没有${TITLE[view]}。<a href=${`#/new/${view}`} class="linkbtn">去撰写</a>`}</div>`}
      </div>
    </div>`;
}
