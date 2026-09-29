import { html, render, useState, useEffect, useRef, useCallback } from './h.js';
import { api } from './api.js';
import { PostEditor } from './editors/post.js';
import { TravelEditor } from './editors/travel.js';
import { RawEditor } from './editors/raw.js';
import { Settings } from './editors/settings.js';
import { Comments } from './editors/comments.js';
import { Dashboard } from './pages/dashboard.js';
import { EntryList } from './pages/list.js';
import { Taxonomy } from './pages/taxonomy.js';
import { Icon } from './icons.js';
import { Build } from './pages/build.js';
import { MarkdownPost } from './editors/markdown.js';

const KIND_NAME = { post: '文章', travel: '游记' };
const parseHash = () => { const [, kind, id] = location.hash.match(/^#\/([a-z]+)(?:\/(.+))?$/) ?? []; return { kind: kind ?? '', id: id ? decodeURIComponent(id) : '' }; };

function App() {
  const [project, setProject] = useState(null);
  const [route, setRoute] = useState(parseHash());
  const [previewOn, setPreviewOn] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const refresh = useCallback(() => api.project().then(setProject).catch((e) => setError(e.message)), []);
  useEffect(() => { refresh(); const on = () => setRoute(parseHash()); addEventListener('hashchange', on); return () => removeEventListener('hashchange', on); }, []);
  if (error) return html`<div class="empty-state">${error}</div>`;
  if (!project) return html`<div class="empty-state">读取项目……</div>`;

  const path = route.kind === 'post' ? `/posts/${route.id}/` : route.kind === 'travel' ? `/travels/${route.id}/` : '/';
  const togglePreview = async () => {
    if (!previewOn) { const r = await api.previewStart(); if (!r.up) return alert(`预览没能启动（等了 30 秒仍没有响应）。请确认项目已经安装好依赖（在项目里运行 pnpm install），然后再试。`); setPreviewUrl(r.url); }
    setPreviewOn(!previewOn);
  };
  const preview = {
    reload: () => setTimeout(() => setPreviewKey((k) => k + 1), 500),
    button: html`<button class="btn" onClick=${togglePreview}>${previewOn ? '关闭预览' : '预览'}</button>`,
  };

  let main;
  if (route.kind === '' || route.kind === 'dashboard') main = html`<${Dashboard} project=${project} />`;
  else if (route.kind === 'posts') main = html`<${EntryList} key="post" view="post" project=${project} refresh=${refresh} />`;
  else if (route.kind === 'travels') main = html`<${EntryList} key="travel" view="travel" project=${project} refresh=${refresh} />`;
  else if (route.kind === 'drafts') main = html`<${EntryList} key="draft" view="draft" project=${project} refresh=${refresh} />`;
  else if (route.kind === 'taxonomy') main = html`<${Taxonomy} key=${JSON.stringify(project.config.categories)} project=${project} refresh=${refresh} />`;
  else if (route.kind === 'new') main = html`<${NewEntry} kind=${route.id || 'post'} project=${project} refresh=${refresh} />`;
  else if (route.kind === 'comments') main = html`<${Comments} project=${project} refresh=${refresh} />`;
  else if (route.kind === 'settings') main = html`<${Settings} project=${project} refresh=${refresh} />`;
  else if (route.kind === 'build') main = html`<${Build} project=${project} refresh=${refresh} />`;
  else if (route.kind === 'post' || route.kind === 'travel') main = html`<${EntryRoute} key=${route.kind + route.id} kind=${route.kind} id=${route.id} project=${project} refresh=${refresh} preview=${preview} />`;
  else main = html`<div class="empty-state">没有这个页面。</div>`;

  return html`<div class=${'shell' + (previewOn ? ' with-preview' : '')}>
    <${Side} project=${project} route=${route} />
    <div class="main">${main}</div>
    ${previewOn && html`<div class="preview">
      <div class="bar"><span class="mono lbl grow">预览 · ${path}</span><button class="linkbtn" onClick=${() => setPreviewKey((k) => k + 1)}>刷新</button><button class="linkbtn" onClick=${() => { api.previewStop(); setPreviewOn(false); }}>停止服务</button></div>
      <iframe key=${previewKey} src=${`${previewUrl || project.preview.url || `http://localhost:${project.preview.port}`}${path}`}></iframe>
    </div>`}
  </div>`;
}

/** 侧栏：一级入口，文章、游记下面各有子项；当前所在的那一组自动展开 */
const NAV = [
  { key: 'dashboard', label: '仪表盘', icon: 'gauge', href: '#/dashboard' },
  { key: 'post', label: '文章', icon: 'code', children: [
    { key: 'posts', label: '管理', icon: 'eye', href: '#/posts' },
    { key: 'new/post', label: '撰写', icon: 'pencil', href: '#/new/post' },
    { key: 'taxonomy', label: '分类 / 标签', icon: 'tag', href: '#/taxonomy' },
  ] },
  { key: 'travel', label: '游记', icon: 'book', children: [
    { key: 'travels', label: '管理', icon: 'eye', href: '#/travels' },
    { key: 'new/travel', label: '撰写', icon: 'pencil', href: '#/new/travel' },
  ] },
  { key: 'drafts', label: '草稿箱', icon: 'draft', href: '#/drafts' },
  { key: 'comments', label: '评论', icon: 'message', href: '#/comments' },
];
const NAV_BOTTOM = [
  { key: 'build', label: '构建发布', icon: 'upload', href: '#/build' },
  { key: 'settings', label: '设定', icon: 'sliders', href: '#/settings' },
];
/** 当前路由对应哪个导航项：编辑某一篇时，落在它所属的“管理”上 */
const activeKey = (r) => (r.kind === 'new' ? `new/${r.id || 'post'}` : r.kind === 'post' ? 'posts' : r.kind === 'travel' ? 'travels' : r.kind || 'dashboard');

function Side({ project, route }) {
  const active = activeKey(route);
  const [closed, setClosed] = useState({});
  const drafts = project.entries.filter((e) => e.draft).length;
  const badge = { drafts, comments: project.comments.pending };
  const item = (n, child) => html`<a key=${n.key} class=${'nav-item' + (child ? ' child' : '')} href=${n.href} aria-current=${active === n.key ? 'page' : undefined}>
    <${Icon} name=${n.icon} /><span class="grow">${n.label}</span>${badge[n.key] ? html`<span class=${n.key === 'comments' ? 'badge' : 'count mono'}>${badge[n.key]}</span>` : ''}</a>`;
  return html`<aside class="side">
    <header><h1 title=${project.root}>${project.config.title}</h1><span class="mono lbl">STUDIO${project.dev ? ' · DEV' : ''}</span></header>
    <nav>
      ${NAV.map((n) => {
        if (!n.children) return item(n);
        const inside = n.children.some((c) => c.key === active);
        const open = inside || !closed[n.key];
        return html`<div key=${n.key}>
          <button class=${'nav-item group' + (inside ? ' inside' : '')} onClick=${() => { if (!inside) setClosed({ ...closed, [n.key]: open }); }} aria-expanded=${open}>
            <${Icon} name=${n.icon} /><span class="grow">${n.label}</span><span class=${'chev' + (open ? ' open' : '')}><${Icon} name="chevron" size=${14} /></span></button>
          ${open && n.children.map((c) => item(c, true))}
        </div>`;
      })}
      <div class="nav-spacer"></div>
      ${NAV_BOTTOM.map((n) => item(n))}
    </nav>
  </aside>`;
}

/** 一篇文章的三种编辑方式：Markdown（只有文章）/ 块 / JSON 源码。同一份文件，切换时重新读一遍磁盘上的内容 */
const MODES = { post: [['md', 'Markdown'], ['blocks', '块'], ['raw', '源码']], travel: [['blocks', '块'], ['raw', '源码']] };
const savedMode = () => { try { return localStorage.getItem('mori.studio.mode'); } catch { return null; } };

function EntryRoute({ kind, id, project, refresh, preview }) {
  const modes = MODES[kind];
  const [doc, setDoc] = useState(null), [err, setErr] = useState('');
  const [mode, setMode] = useState(() => { const m = savedMode(); return modes.some(([k]) => k === m) ? m : modes[0][0]; });
  const load = () => api.entry(kind, id).then(setDoc).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  if (err) return html`<div class="empty-state">${err}</div>`;
  if (!doc) return html`<div class="empty-state">读取中……</div>`;
  const switchTo = async (m) => {
    if (m === mode) return;
    await new Promise((r) => setTimeout(r, 900)); // 等自动保存写完
    await load(); setMode(m);
    if (m !== 'raw') try { localStorage.setItem('mori.studio.mode', m); } catch {}
  };
  const modeSwitch = html`<div class="seg in-bar">${modes.map(([k, n]) => html`<button key=${k} aria-pressed=${mode === k} onClick=${() => switchTo(k)}>${n}</button>`)}</div>`;
  const p2 = { ...preview, button: html`${modeSwitch}${preview.button}` };
  const props = { key: mode, kind, id, initial: doc, project, refresh, preview: p2 };
  if (mode === 'raw') return html`<${RawEditor} ...${props} />`;
  if (kind === 'travel') return html`<${TravelEditor} ...${props} />`;
  if (mode === 'md') return html`<${MarkdownPost} ...${props} preview=${preview} modeSwitch=${modeSwitch} />`;
  return html`<${PostEditor} ...${props} />`;
}

function NewEntry({ kind, project, refresh }) {
  const [id, setId] = useState(''), [title, setTitle] = useState(''), [category, setCategory] = useState(project.config.categories[0]?.id ?? ''), [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { await api.create(kind, { id, title, category }); await refresh(); location.hash = `#/${kind}/${id}`; } catch (x) { setErr(x.message); }
  };
  return html`<div class="pad"><h2 style="font-weight:400;font-size:20px;letter-spacing:.1em">新建${KIND_NAME[kind]}</h2>
    <form onSubmit=${submit} style="margin-top:16px">
      <div class="field"><label>标题</label><input value=${title} onInput=${(e) => setTitle(e.target.value)} required /></div>
      <div class="field"><label>地址名</label><div><input value=${id} onInput=${(e) => setId(e.target.value)} placeholder="英文、数字、连字符，如 my-first-post" pattern="[A-Za-z0-9][A-Za-z0-9_\\-]*" required /><div class="mono lbl">网址会是 /${kind === 'post' ? 'posts' : 'travels'}/${id || '……'}/</div></div></div>
      <div class="field"><label>栏目</label><select value=${category} onChange=${(e) => setCategory(e.target.value)}>${project.config.categories.map((c) => html`<option value=${c.id}>${c.zh}</option>`)}</select></div>
      ${err && html`<p class="issues">${err}</p>`}
      <button class="btn primary" type="submit" style="margin-top:12px">创建</button>
    </form></div>`;
}

render(html`<${App} />`, document.getElementById('app'));
