import { html, useState, useEffect } from '../h.js';

const TABS = [['pending', '待审'], ['approved', '已通过'], ['hidden', '已隐藏']];
const call = async (method, url, body) => {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error ?? `失败（${r.status}）`), { status: r.status });
  return j;
};
const when = (t) => { const d = new Date(t); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/** 评论管理：待审列表，一键通过 / 隐藏 / 删除（spec §5.1：不另做后台，放进 Studio） */
export function Comments({ project, refresh }) {
  const c = project.comments;
  const [tab, setTab] = useState('pending'), [list, setList] = useState(null), [stats, setStats] = useState(null), [err, setErr] = useState(''), [token, setToken] = useState('');
  const title = (entry) => { const [kind, id] = entry.split('/'); return project.entries.find((e) => e.id === id && (kind === 'posts' ? 'post' : 'travel') === e.kind)?.title ?? entry; };

  const load = async () => {
    setErr('');
    try { const [l, s] = await Promise.all([call('GET', `/api/comments?status=${tab}`), call('GET', '/api/comments/stats')]); setList(l.comments); setStats(s); } catch (e) { setErr(e.status === 401 ? 'token' : e.message); }
  };
  useEffect(() => { if (c.provider === 'mori' && c.hasToken) load(); }, [tab, c.hasToken]);

  if (c.provider !== 'mori') return html`<div class="pad"><h2 style="font-weight:400;font-size:20px;letter-spacing:.1em">评论</h2><p class="lbl" style="margin-top:10px">还没有启用自建评论。在 mori.config.ts 里加 <span class="mono">comments: { provider: 'mori', endpoint: '评论服务的地址' }</span>；用第三方评论（Giscus / Waline / Twikoo / Artalk）时，评论在各自的后台里管理。</p></div>`;

  const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(c.endpoint);
  const saveToken = async (v) => { await call('PUT', '/api/comments/token', { token: v }); await refresh(); setErr(''); setToken(''); };
  if (!c.hasToken || err === 'token') return html`<div class="pad"><h2 style="font-weight:400;font-size:20px;letter-spacing:.1em">评论 · 管理令牌</h2>
    ${local
      ? html`<p style="margin:10px 0">评论服务在本机（<span class="mono">${c.endpoint}</span>）。用 <span class="mono">pnpm dev</span> 启动的那个，管理令牌就是 <b class="mono">dev-token</b>。</p>
        <div class="row" style="margin-bottom:14px"><button class="btn primary" onClick=${() => saveToken('dev-token')}>使用 dev-token</button><span class="lbl">（也可以在下面填别的）</span></div>`
      : html`<p style="margin:10px 0">评论服务：<span class="mono">${c.endpoint}</span>。管理令牌是部署评论服务时设置的 <span class="mono">ADMIN_TOKEN</span>。</p>`}
    ${err === 'token' && html`<p class="issues">令牌不对，评论服务拒绝了。${local ? '如果你是自己用别的令牌启动的服务，请填那个。' : ''}</p>`}
    <div class="row"><input class="cell" type="password" value=${token} onInput=${(e) => setToken(e.target.value)} placeholder="管理令牌" style="max-width:26em" />
      <button class="btn" disabled=${!token} onClick=${() => saveToken(token)}>保存</button></div>
    <p class="lbl mono" style="margin-top:14px">令牌只保存在本机项目根目录的 .mori-studio.json 里（已加进 .gitignore），也可以用环境变量 MORI_ADMIN_TOKEN。</p></div>`;

  const act = async (id, fn) => { try { await fn(); await load(); await refresh(); } catch (e) { setErr(e.message); } };
  return html`<div class="bar"><b class="grow" style="font-weight:400">评论</b><span class="status mono">${stats ? `待审 ${stats.pending} · 已通过 ${stats.approved} · 已隐藏 ${stats.hidden}` : ''}</span><button class="linkbtn" onClick=${load}>刷新</button></div>
    <div class="pad">
      <div class="tabs">${TABS.map(([k, n]) => html`<button key=${k} aria-pressed=${tab === k} onClick=${() => setTab(k)}>${n}${stats && stats[k] ? ` ${stats[k]}` : ''}</button>`)}</div>
      ${err && err !== 'token' && html`<p class="issues">${err}</p>`}
      ${list === null ? html`<p class="lbl" style="margin-top:14px">读取中……</p>` : list.length === 0 ? html`<p class="lbl" style="margin-top:14px">这里没有评论。</p>` : list.map((m) => html`<div class="cm" key=${m.id}>
        <div class="meta mono"><b>${m.name}</b><span>${when(m.createdAt)}</span><span>${title(m.entry)}</span>${m.block && html`<span style="color:var(--accent)">批注</span>`}${m.parentId && html`<span>回复 #${m.parentId}</span>`}</div>
        ${m.quote && html`<blockquote>${m.quote}</blockquote>`}
        <div class="txt">${m.body}</div>
        <div class="acts mono">
          ${m.status !== 'approved' && html`<button class="linkbtn" onClick=${() => act(m.id, () => call('PATCH', `/api/comments/${m.id}`, { status: 'approved' }))}>通过</button>`}
          ${m.status !== 'hidden' && html`<button class="linkbtn" onClick=${() => act(m.id, () => call('PATCH', `/api/comments/${m.id}`, { status: 'hidden' }))}>隐藏</button>`}
          <button class="linkbtn" onClick=${() => { if (confirm('永久删除这条评论（及它下面的回复）？')) act(m.id, () => call('DELETE', `/api/comments/${m.id}`)); }}>删除</button>
        </div></div>`)}
    </div>`;
}
