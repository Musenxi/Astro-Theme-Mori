/**
 * 文末评论区（自建评论）：进入视口才加载；列表按时间排，回复缩进一层；批注在列表里带一段引用的原文，点一下回到正文（annotate.ts 处理）。
 * 第三方评论（giscus / waline / twikoo / artalk）见 cmt-embed.ts。
 */
import { moriConfig, listComments, sendComment, mountTurnstile, remember, dotDate, type MoriComment, type MoriCommentsConfig } from './cmt-api.ts';

type Child = Node | string | null | false | undefined;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids) if (c) e.append(c);
  return e;
}

let offAdded: (() => void) | null = null;

function init() {
  const section = document.querySelector<HTMLElement>('#comments');
  const cfg = moriConfig();
  if (!section || !cfg || section.dataset.ready) return;
  section.dataset.ready = '1';
  const body = section.querySelector<HTMLElement>('[data-body]')!;
  const count = section.querySelector<HTMLElement>('[data-count]')!;
  let comments: MoriComment[] = [];

  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '500px' }); // 快速滚动时一次会收到多条记录，不能只看第一条
  io.observe(section);

  async function load() {
    body.replaceChildren(h('p', { class: 'mono lbl' }, '评论加载中……'));
    try { comments = await listComments(cfg!, cfg!.entry); render(); } catch (e: any) {
      body.replaceChildren(h('p', { class: 'mono lbl' }, `${e.message} `, h('button', { class: 'linkbtn', onclick: load }, '重试')));
    }
  }

  function render() {
    const top = comments.filter((c) => !c.parentId);
    const replies = (id: number) => comments.filter((c) => c.parentId === id);
    count.textContent = comments.length ? `${comments.length} 条` : '';
    queueMicrotask(() => document.dispatchEvent(new CustomEvent('mori:comments-rendered', { detail: comments })));
    const list = h('ol', { class: 'cmt-list' }, ...top.map((c) => item(c, replies(c.id))));
    body.replaceChildren(...(comments.length ? [list] : [h('p', { class: 'cmt-none' }, '还没有评论。')]), form(cfg!, null));
  }

  function item(c: MoriComment, kids: MoriComment[]): HTMLLIElement {
    const li: HTMLLIElement = h('li', { id: `c${c.id}`, class: 'cmt-item' },
      h('div', { class: 'cmt-meta mono' }, h('b', {}, c.name), dotDate(c.createdAt), c.block ? h('span', { class: 'cmt-tag' }, '批注') : null),
      c.block && c.quote ? quote(c) : null,
      h('div', { class: 'cmt-text' }, c.body),
      !c.parentId ? h('button', { class: 'linkbtn cmt-reply', type: 'button', onclick: (ev: Event) => toggleReply(li, c, ev.currentTarget as HTMLElement) }, '回复') : null,
      kids.length ? h('ol', { class: 'cmt-replies' }, ...kids.map((k) => item(k, []))) : null);
    return li;
  }

  /** 批注带着引用的原文（细线引用样式，过长截断）；点一下回到正文里那一段 */
  function quote(c: MoriComment) {
    const q = h('blockquote', { class: 'cmt-quote', tabindex: '0', role: 'button', title: '回到正文里的这一段' }, c.quote!);
    const go = () => document.dispatchEvent(new CustomEvent('mori:jump', { detail: c }));
    q.addEventListener('click', go);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    q.dataset.commentId = String(c.id);
    return q;
  }

  function toggleReply(li: HTMLElement, c: MoriComment, btn: HTMLElement) {
    const open = li.querySelector(':scope > form.cmt-form');
    if (open) { open.remove(); btn.textContent = '回复'; return; }
    btn.textContent = '取消回复';
    li.insertBefore(form(cfg!, c), li.querySelector(':scope > .cmt-replies'));
  }

  offAdded?.(); // 换页前的监听先拆掉
  const added = (e: Event) => {
    const c = (e as CustomEvent<MoriComment>).detail;
    if (c && !comments.some((x) => x.id === c.id)) { comments.push(c); render(); }
  };
  document.addEventListener('mori:comment-added', added);
  offAdded = () => document.removeEventListener('mori:comment-added', added);
}

/** 发表 / 回复的表单。parent 有值就是回复 */
function form(cfg: MoriCommentsConfig & { entry: string }, parent: MoriComment | null) {
  const name = h('input', { name: 'name', placeholder: '名字', required: true, maxlength: '40', autocomplete: 'nickname', value: remember.get('mori-cmt-name') });
  const email = h('input', { name: 'email', type: 'email', placeholder: '邮箱（可不填，不会公开）', maxlength: '120', autocomplete: 'email', value: remember.get('mori-cmt-email') });
  const text = h('textarea', { name: 'body', placeholder: parent ? `回复 ${parent.name}` : '写点什么', required: true, rows: '4', maxlength: '4000' });
  // 蜜罐：真人看不到，机器人会填
  const trap = h('input', { name: 'website', class: 'cmt-trap', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
  const ts = h('div', { class: 'cmt-ts' });
  const msg = h('p', { class: 'cmt-msg mono', role: 'status' });
  const btn = h('button', { class: 'cmt-send', type: 'submit' }, parent ? '发表回复 ' : '发表 ', h('span', {}, '→'));
  const f = h('form', { class: 'cmt-form' }, h('div', { class: 'cmt-row' }, name, email), text, trap, ts, h('div', { class: 'cmt-foot' }, msg, btn));
  let widget: { token(): string; reset(): void } | null = null;
  // 人机验证控件在第一次聚焦时才加载
  f.addEventListener('focusin', async () => { if (!widget && cfg.turnstileSiteKey) widget = await mountTurnstile(cfg, ts); }, { once: true });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true; msg.textContent = '发送中……'; msg.classList.remove('bad');
    try {
      const r = await sendComment(cfg, { entry: cfg.entry, name: name.value, email: email.value, body: text.value, website: trap.value, parentId: parent?.id, turnstile: widget?.token() });
      remember.set('mori-cmt-name', name.value); remember.set('mori-cmt-email', email.value);
      text.value = '';
      widget?.reset();
      if (r.status === 'approved' && r.comment) document.dispatchEvent(new CustomEvent('mori:comment-added', { detail: r.comment }));
      else msg.textContent = '已收到。通过审核后会显示在这里。';
      if (r.status === 'approved') msg.textContent = '';
    } catch (err: any) { msg.textContent = err.message; msg.classList.add('bad'); }
    btn.disabled = false;
  });
  return f;
}

document.addEventListener('astro:page-load', init);
init();

export {};
