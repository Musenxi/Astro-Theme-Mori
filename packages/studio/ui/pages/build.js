import { html, useState, useEffect } from '../h.js';
import { api } from '../api.js';

const TARGETS = { git: 'GitHub 仓库', 'cloudflare-pages': 'Cloudflare Pages', rsync: '自己的服务器', local: '本地文件夹' };
const describe = (p) => {
  if (!p) return '';
  if (p.target === 'git') return `Git 仓库 · ${p.branch ? `${p.branch} 分支` : '当前分支'}`;
  if (p.target === 'cloudflare-pages') return `Cloudflare Pages · ${p.project}${p.branch ? `（${p.branch} 分支）` : ''}`;
  if (p.target === 'local') return `本地文件夹 → ${p.dest}`;
  return `服务器 → ${p.dest}`;
};
const json = async (url, method, body) => {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `失败（${r.status}）`);
  return j;
};

/** git 目标的表单：显示仓库状态；还不是仓库就填地址并连接；是仓库就选远端、分支、提交说明 */
function GitForm({ form, set }) {
  const [info, setInfo] = useState(null), [url, setUrl] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const load = () => json('/api/git').then(setInfo).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const connect = async () => { setBusy(true); setErr(''); try { setInfo(await json('/api/git/init', 'POST', { url: url.trim(), branch: form.branch || 'main' })); } catch (e) { setErr(e.message); } setBusy(false); };
  if (!info) return html`<p class="lbl">读取仓库状态……</p>`;
  const origin = info.remotes?.find((r) => r.name === (form.remote || 'origin'));
  return html`<div>
    ${!info.isRepo || !info.remotes.length
      ? html`<p class="lbl" style="margin-bottom:8px">把文章和设置推送到你在 GitHub 上的仓库，推送后由 GitHub 或 Cloudflare Pages 自动构建上线。先填仓库的地址：</p>
        <div class="field"><label>仓库地址</label><input value=${url} onInput=${(e) => setUrl(e.target.value)} placeholder="https://github.com/你的用户名/仓库名.git" /></div>
        <div class="row"><button class="btn" disabled=${busy || !url.trim()} onClick=${connect}>${busy ? '连接中……' : '连接仓库'}</button></div>`
      : html`<p class="lbl" style="margin-bottom:8px">已连接 ${(origin ?? info.remotes[0]).url.replace(/^https?:\/\/|\.git$/g, '')}（${info.branch} 分支）<br />${info.changed ? `有 ${info.changed} 处改动还没发布` : '没有未发布的改动'}${info.last ? `　最近一次提交：${info.last}` : ''}${info.nested ? html`<br />这个项目放在另一个仓库的文件夹里，发布会推送到那个仓库。` : ''}</p>
        ${info.remotes.length > 1 && html`<div class="field"><label>远端</label><select value=${form.remote || 'origin'} onChange=${(e) => set({ remote: e.target.value })}>${info.remotes.map((r) => html`<option value=${r.name}>${r.name} · ${r.url}</option>`)}</select></div>`}
        <div class="field"><label>分支</label><input value=${form.branch ?? ''} onInput=${(e) => set({ branch: e.target.value })} placeholder=${`默认 ${info.branch}`} /></div>
        <div class="field"><label>提交说明</label><input value=${form.message ?? ''} onInput=${(e) => set({ message: e.target.value })} placeholder="默认：更新内容 加日期时间" /></div>
        <p class="lbl">发布前会先检查站点能否正常生成，通过了才会推送。用的是这台电脑上已经登录的 Git 账号；推送失败时，先在终端运行 gh auth login 登录。管理令牌不会被上传。</p>`}
    ${err && html`<p class="issues">${err}</p>`}
  </div>`;
}

/** 构建与发布。发布目标存在 mori.config.ts 的 publish 里，这里可以直接设置；设好之后“构建并发布”就是一键更新线上站点 */
export function Build({ project, refresh }) {
  const pub = project.publish;
  const [editing, setEditing] = useState(!pub);
  const [form, setForm] = useState(pub ?? { target: 'git' });
  const [formErr, setFormErr] = useState('');
  const [log, setLog] = useState(''), [busy, setBusy] = useState(false), [code, setCode] = useState(null), [what, setWhat] = useState('');

  const savePublish = async (value) => {
    setFormErr('');
    const r = await fetch('/api/publish-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publish: value }) });
    const j = await r.json();
    if (!r.ok) return setFormErr(j.error);
    await refresh(); setEditing(!value);
  };
  const run = async (kind) => {
    if (kind === 'publish' && !confirm(`发布会把当前内容发布到：${describe(pub)}\n线上的站点会随之更新。继续？`)) return;
    setBusy(true); setCode(null); setLog(''); setWhat(kind);
    const c = await (kind === 'publish' ? api.publish : api.build)(setLog);
    setCode(c); setBusy(false);
  };
  const set = (patch) => setForm({ ...form, ...patch });

  return html`<div class="bar"><b class="grow" style="font-weight:400;letter-spacing:.15em">构建与发布</b>
      ${code !== null && html`<span class=${'status mono' + (code ? ' bad' : '')}>${code ? `失败（退出码 ${code}）` : what === 'publish' ? '已发布' : '构建完成'}</span>`}</div>
    <div class="pad">
      <section class="box" style="margin-top:0;border-top:0"><h2>发布到哪里</h2>
        ${!editing && pub ? html`<div class="row"><span class="grow">${describe(pub)}</span>
            <button class="linkbtn" onClick=${() => { setForm(pub); setEditing(true); }}>修改</button>
            <button class="linkbtn" onClick=${() => confirm('清除发布设置？（不会影响已经发布的站点）') && savePublish(null)}>清除</button></div>`
          : html`<div>
            <div class="row" style="gap:0;margin-bottom:10px">${Object.entries(TARGETS).filter(([k]) => k !== 'local' || project.dev || pub?.target === 'local').map(([k, n]) => html`<button key=${k} class="btn" aria-pressed=${form.target === k} onClick=${() => setForm({ target: k })}
              style=${`border-radius:0;margin-right:-1px;${form.target === k ? 'background:var(--ink);color:var(--paper);border-color:var(--ink)' : ''}`}>${n}</button>`)}</div>
            ${form.target === 'git' ? html`<${GitForm} form=${form} set=${set} />`
              : form.target === 'local' ? html`<div class="field"><label>文件夹</label><input value=${form.dest ?? ''} onInput=${(e) => set({ dest: e.target.value })} placeholder="~/Sites/blog" /></div>
                <p class="lbl">生成站点后复制到这个文件夹，用来在本机试一下发布。文件夹需要是空的，或之前由 Studio 发布过；里面别的文件不会被动。</p>`
              : form.target === 'cloudflare-pages'
              ? html`<div class="field"><label>项目名</label><input value=${form.project ?? ''} onInput=${(e) => set({ project: e.target.value })} placeholder="Cloudflare 里的项目名称" /></div>
                <div class="field"><label>分支</label><input value=${form.branch ?? ''} onInput=${(e) => set({ branch: e.target.value })} placeholder="选填，填 main 表示发布到正式站" /></div>
                <p class="lbl">第一次使用前，需要在这台电脑上登录一次 Cloudflare：在终端运行 <span class="mono" style="user-select:all">npx wrangler login</span>。</p>`
              : html`<div class="field"><label>服务器路径</label><input value=${form.dest ?? ''} onInput=${(e) => set({ dest: e.target.value })} placeholder="用户名@服务器地址:/网站目录/" /></div>
                <p class="lbl">需要先配置好免密登录。发布时，服务器上的网站目录会和新站点完全一致，多余的旧文件会被删除。</p>`}
            ${formErr && html`<p class="issues">${formErr}</p>`}
            <div class="row" style="margin-top:10px"><button class="btn primary" onClick=${() => savePublish(form)}>保存</button>${pub && html`<button class="btn" onClick=${() => { setEditing(false); setFormErr(''); }}>取消</button>`}</div>
          </div>`}
      </section>
      <section class="box"><h2>更新站点</h2>
        <p class="lbl" style="margin:4px 0 12px">构建：生成站点文件，检查内容有没有错误。构建并发布：先生成，成功后再发布到上面选的位置。</p>
        <div class="row"><button class="btn primary" disabled=${busy || !pub} title=${pub ? '' : '先在上面设置发布到哪里'} onClick=${() => run('publish')}>${busy && what === 'publish' ? '发布中……' : '构建并发布'}</button>
          <button class="btn" disabled=${busy} onClick=${() => run('build')}>${busy && what === 'build' ? '构建中……' : '只构建'}</button></div>
        ${log && html`<pre class="log">${log}</pre>`}
      </section>
    </div>`;
}
