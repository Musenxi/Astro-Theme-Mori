import { html, render, useState, useEffect, useRef, useCallback } from './h.js';
import { api } from './api.js';
import { PostEditor } from './editors/post.js';
import { TravelEditor } from './editors/travel.js';
import { RawEditor } from './editors/raw.js';
import { Settings } from './editors/settings.js';
import { Comments } from './editors/comments.js';

const KIND_NAME = { post: '文章', travel: '游记' };
const parseHash = () => { const [, kind, id] = location.hash.match(/^#\/([a-z]+)(?:\/(.+))?$/) ?? []; return { kind: kind ?? '', id: id ? decodeURIComponent(id) : '' }; };

function App() {
  const [project, setProject] = useState(null);
  const [route, setRoute] = useState(parseHash());
  const [previewOn, setPreviewOn] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [error, setError] = useState('');
  const refresh = useCallback(() => api.project().then(setProject).catch((e) => setError(e.message)), []);
  useEffect(() => { refresh(); const on = () => setRoute(parseHash()); addEventListener('hashchange', on); return () => removeEventListener('hashchange', on); }, []);
  if (error) return html`<div class="empty-state">${error}</div>`;
  if (!project) return html`<div class="empty-state">读取项目……</div>`;

  const path = route.kind === 'post' ? `/posts/${route.id}/` : route.kind === 'travel' ? `/travels/${route.id}/` : '/';
  const togglePreview = async () => {
    if (!previewOn) { const r = await api.previewStart(); if (!r.up) return alert('预览服务没能启动。请在项目里先跑一次 pnpm install。'); }
    setPreviewOn(!previewOn);
  };
  const preview = {
    reload: () => setTimeout(() => setPreviewKey((k) => k + 1), 500),
    button: html`<button class="btn" onClick=${togglePreview}>${previewOn ? '关闭预览' : '预览'}</button>`,
  };

  let main;
  if (route.kind === 'new') main = html`<${NewEntry} kind=${route.id || 'post'} project=${project} refresh=${refresh} />`;
  else if (route.kind === 'comments') main = html`<${Comments} project=${project} refresh=${refresh} />`;
  else if (route.kind === 'settings') main = html`<${Settings} project=${project} refresh=${refresh} />`;
  else if (route.kind === 'build') main = html`<${Build} project=${project} />`;
  else if (route.kind === 'post' || route.kind === 'travel') main = html`<${EntryRoute} key=${route.kind + route.id} kind=${route.kind} id=${route.id} project=${project} refresh=${refresh} preview=${preview} />`;
  else main = html`<div class="empty-state">从左边选一篇，或新建一篇。</div>`;

  return html`<div class=${'shell' + (previewOn ? ' with-preview' : '')}>
    <${Side} project=${project} route=${route} />
    <div class="main">${main}</div>
    ${previewOn && html`<div class="preview">
      <div class="bar"><span class="mono lbl grow">预览 · ${path}</span><button class="linkbtn" onClick=${() => setPreviewKey((k) => k + 1)}>刷新</button><button class="linkbtn" onClick=${() => { api.previewStop(); setPreviewOn(false); }}>停止服务</button></div>
      <iframe key=${previewKey} src=${`http://127.0.0.1:${project.preview.port}${path}`}></iframe>
    </div>`}
  </div>`;
}

function Side({ project, route }) {
  const groups = ['travel', 'post'].map((kind) => ({ kind, list: project.entries.filter((e) => e.kind === kind) }));
  return html`<aside class="side">
    <header><h1>${project.config.title} · STUDIO</h1><div class="root mono">${project.root}</div></header>
    <nav>
      ${groups.map(({ kind, list }) => html`<div key=${kind}>
        <div class="group mono">${KIND_NAME[kind]} · ${list.length} <a class="linkbtn" href=${`#/new/${kind}`} style="margin-left:8px">新建</a></div>
        <ul>${list.map((e) => html`<li key=${e.id} class=${e.draft ? 'draft' : ''}><a href=${`#/${kind}/${e.id}`} aria-current=${route.kind === kind && route.id === e.id ? 'page' : undefined}>
          <span class="t">${e.title}</span><span class="m mono">${e.date.slice(2)}</span></a></li>`)}</ul>
      </div>`)}
    </nav>
    <footer class="mono"><a class="linkbtn" href="#/comments">评论${project.comments.pending ? html`<span class="badge">${project.comments.pending}</span>` : ''}</a><a class="linkbtn" href="#/settings">设置</a><a class="linkbtn" href="#/build">构建</a></footer>
  </aside>`;
}

function EntryRoute({ kind, id, project, refresh, preview }) {
  const [doc, setDoc] = useState(null), [err, setErr] = useState(''), [raw, setRaw] = useState(false);
  const load = () => api.entry(kind, id).then(setDoc).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  if (err) return html`<div class="empty-state">${err}</div>`;
  if (!doc) return html`<div class="empty-state">读取中……</div>`;
  // 表单和源码是同一份文件的两种编辑方式：切换时重新读一遍磁盘上的内容
  const toggle = async () => { await new Promise((r) => setTimeout(r, 900)); await load(); setRaw(!raw); };
  const p2 = { ...preview, button: html`${preview.button}<button class="btn" onClick=${toggle}>${raw ? '表单' : '源码'}</button>` };
  const Editor = raw ? RawEditor : kind === 'travel' ? TravelEditor : PostEditor;
  return html`<${Editor} key=${String(raw)} kind=${kind} id=${id} initial=${doc} project=${project} refresh=${refresh} preview=${p2} />`;
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

function Build({ project }) {
  const [log, setLog] = useState(''), [busy, setBusy] = useState(false), [code, setCode] = useState(null), [what, setWhat] = useState('');
  const pub = project.publish;
  const desc = !pub ? '' : pub.target === 'cloudflare-pages' ? `Cloudflare Pages · ${pub.project}` : `rsync → ${pub.dest}`;
  const run = async (kind) => {
    if (kind === 'publish' && !confirm(`发布会把当前内容上传到：${desc}\n线上的站点会随之更新。继续？`)) return;
    setBusy(true); setCode(null); setLog(''); setWhat(kind);
    const c = await (kind === 'publish' ? api.publish : api.build)(setLog);
    setCode(c); setBusy(false);
  };
  return html`<div class="pad"><h2 style="font-weight:400;font-size:20px;letter-spacing:.1em">构建与发布</h2>
    <p class="lbl" style="margin:10px 0">构建：运行 astro build，输出静态文件到项目的 dist/。发布：先构建，再上传 dist/。${pub ? html`当前发布目标：<span class="mono">${desc}</span>` : html`还没有发布目标——在 mori.config.ts 里加 <span class="mono">publish</span>（Cloudflare Pages 或 rsync 到 VPS）。`}</p>
    <div class="row"><button class="btn" disabled=${busy} onClick=${() => run('build')}>${busy && what === 'build' ? '构建中……' : '只构建'}</button>
      <button class="btn primary" disabled=${busy || !pub} onClick=${() => run('publish')}>${busy && what === 'publish' ? '发布中……' : '构建并发布'}</button>
      ${code !== null && html`<span class=${'status mono' + (code ? ' bad' : '')}>${code ? `失败（退出码 ${code}）` : '完成'}</span>`}</div>
    ${log && html`<pre class="log">${log}</pre>`}</div>`;
}

render(html`<${App} />`, document.getElementById('app'));
