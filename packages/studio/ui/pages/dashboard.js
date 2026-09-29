import { html, useState, useEffect } from '../h.js';

const wan = (n) => (n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, '')}万` : n.toLocaleString('zh-CN'));

/** 仪表盘：只放数字。阅读量和点赞要服务端记录，还没接入时显示“—” */
export function Dashboard({ project }) {
  const [s, setS] = useState(null), [err, setErr] = useState('');
  const load = () => fetch('/api/stats').then((r) => r.json()).then(setS).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [project.entries.length]);
  if (err) return html`<div class="empty-state">${err}</div>`;
  const c = s?.comments;
  const cells = s && [
    ['页面', s.pages, '#/pages'],
    ['分类', s.categories, '#/taxonomy'],
    ['全部评论', c?.total, '#/comments', !c && '评论服务未连接'],
    ['未读评论', c?.unread, '#/comments', !c && '评论服务未连接'],
    ['全站字数', s.words == null ? null : wan(s.words)],
    ['总阅读量', s.views, null, '暂未统计'],
    ['文章点赞', s.likes, null, '暂未统计'],
  ];
  return html`<div class="bar"><b class="grow" style="font-weight:400;letter-spacing:.15em">仪表盘</b><button class="linkbtn" onClick=${load}>刷新</button></div>
    <div class="pad wide">
      <div class="stats">${cells ? cells.map(([label, v, href, hint]) => {
        const body = html`<div class="num">${v == null ? '—' : v}</div><div class="mono lbl">${label}</div>${v == null && hint && html`<div class="mono hint">${hint}</div>`}`;
        return href ? html`<a class="stat" key=${label} href=${href}>${body}</a>` : html`<div class="stat" key=${label}>${body}</div>`;
      }) : html`<div class="lbl">读取中……</div>`}</div>
    </div>`;
}
