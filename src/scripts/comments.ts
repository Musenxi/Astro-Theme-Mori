/**
 * 文末评论区（自建评论）：进入视口才加载；列表按时间排，回复缩进一层；引用评论在列表里带一段引用的原文，点一下回到正文（annotate.ts 处理）。
 * 第三方评论（giscus / waline / twikoo / artalk）见 cmt-embed.ts。
 */
import { t } from './i18n.ts';
import { mountEmbed } from './cmt-embed.ts';
import { avatarUrl } from '../lib/avatar.mjs';
import { parseComment } from '../lib/comment-md.mjs';
import emoji from 'virtual:mori/emoji';
import { moriConfig, listComments, numDate, type MoriComment } from './cmt-api.ts';
import { commentForm, h } from './cmt-form.ts';

/** 评论正文（Markdown 节点，见 comment-md.mjs）→ DOM。全部用 createElement 和文字节点，不经过 innerHTML */
function md(nodes: any[]): Node[] {
  const items = (list: any[][]) => list.map((it) => h('li', {}, ...md(it)));
  return nodes.map((n): Node => {
    switch (n.type) {
      case 'text': return document.createTextNode(n.text);
      case 'br': return h('br');
      case 'emoji': {
        const url = emoji.map[n.name];
        return url ? h('img', { class: 'emoji', src: url, alt: `:[${n.name}]`, title: n.name, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' }) : document.createTextNode(`:[${n.name}]`);
      }
      case 'code': return h('code', {}, n.text);
      case 'pre': return h('pre', {}, h('code', {}, n.text));
      case 'a': return h('a', { href: n.href, rel: 'nofollow ugc noopener noreferrer', target: '_blank' }, ...md(n.children));
      case 'ul': return h('ul', {}, ...items(n.items));
      case 'ol': return h('ol', { start: n.start === 1 ? undefined : String(n.start) }, ...items(n.items));
      case 'quote': return h('blockquote', {}, ...md(n.children));
      case 'b': return h('strong', {}, ...md(n.children));
      case 'i': return h('em', {}, ...md(n.children));
      case 'del': return h('del', {}, ...md(n.children));
      default: return h('p', {}, ...md(n.children));
    }
  });
}

let offAdded: (() => void) | null = null;

function init() {
  const section = document.querySelector<HTMLElement>('#comments');
  if (!section || section.dataset.ready) return;
  // 第三方评论：进入视口再加载脚本；每次换页都用新的页面标识重新挂载
  if (section.dataset.provider !== 'mori') {
    section.dataset.ready = '1';
    const c = JSON.parse(section.dataset.config!);
    const host = section.querySelector<HTMLElement>('[data-body]')!;
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      host.replaceChildren(h('p', { class: 'meta' }, t('js.cmt.loading')));
      mountEmbed(c, host, { entry: section.dataset.entry!, title: document.title }).catch((e) => host.replaceChildren(h('p', { class: 'meta' }, e.message)));
    }, { rootMargin: '500px' });
    io.observe(section);
    return;
  }
  const cfg = moriConfig();
  if (!cfg) return;
  section.dataset.ready = '1';
  const readonly = cfg.status === 'readonly'; // 禁用但留着历史评论：不给表单，也不给回复
  const body = section.querySelector<HTMLElement>('[data-body]')!;
  const count = section.querySelector<HTMLElement>('[data-count]')!;
  let comments: MoriComment[] = [];

  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '500px' }); // 快速滚动时一次会收到多条记录，不能只看第一条
  io.observe(section);

  async function load() {
    body.replaceChildren(h('p', { class: 'meta' }, t('js.cmt.loading')));
    try { comments = await listComments(cfg!, cfg!.entry); render(); } catch (e: any) {
      body.replaceChildren(h('p', { class: 'meta' }, `${e.message} `, h('button', { class: 'linkbtn', onclick: load }, t('js.cmt.retry'))));
    }
  }

  function render() {
    const top = comments.filter((c) => !c.parentId);
    const replies = (id: number) => comments.filter((c) => c.parentId === id);
    count.textContent = comments.length ? t('js.cmt.count', { n: comments.length }) : '';
    queueMicrotask(() => document.dispatchEvent(new CustomEvent('mori:comments-rendered', { detail: comments })));
    const list = h('ol', { class: 'cmt-list' }, ...top.map((c) => item(c, replies(c.id))));
    if (readonly) {
      section!.hidden = !comments.length;
      body.replaceChildren(h('p', { class: 'cmt-none' }, t('js.cmt.closed')), list);
      return;
    }
    body.replaceChildren(commentForm(cfg!), comments.length ? list : h('p', { class: 'cmt-none' }, t('js.cmt.none')));
  }

  function item(c: MoriComment, kids: MoriComment[]): HTMLLIElement {
    // 头像一栏，右边是名字、日期、回复一行，下面是引用的原文和正文；回复缩进到正文那一栏
    const li: HTMLLIElement = h('li', { id: `c${c.id}`, class: 'cmt-item' },
      avatar(c),
      h('div', { class: 'cmt-main' },
        h('div', { class: 'cmt-meta' }, byline(c), h('time', { class: 'cmt-date' }, numDate(c.createdAt)),
          readonly ? null : h('button', { class: 'cmt-reply', type: 'button', onclick: (ev: Event) => toggleReply(li, c, ev.currentTarget as HTMLElement) }, t('js.cmt.reply'))),
        c.block && c.quote ? quote(c) : null,
        h('div', { class: 'cmt-text' }, ...md(parseComment(c.body))),
        kids.length ? h('ol', { class: 'cmt-replies' }, ...kids.map((k) => item(k, []))) : null));
    return li;
  }

  /** 头像：评论服务给的哈希 + 站点配置的头像服务。关掉头像就不画；没有哈希（老评论）或图片加载失败时用名字的第一个字 */
  function avatar(c: MoriComment) {
    if (!cfg!.avatar) return null;
    const initial = () => h('span', { class: 'cmt-av', 'aria-hidden': 'true' }, [...c.name.trim()][0] ?? '');
    const src = avatarUrl(cfg!.avatar, c.avatar);
    if (!src) return initial();
    const img = h('img', { class: 'cmt-av', src, alt: '', width: '36', height: '36', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => img.replaceWith(initial()), { once: true });
    return img;
  }

  /** 名字；读者留了网址就是链接（nofollow ugc：不给外链传递权重，新窗口打开）。博主发的后面带“博主” */
  function byline(c: MoriComment) {
    const name = h('b', {}, c.name);
    const by = c.url && /^https?:\/\//i.test(c.url) ? h('a', { class: 'cmt-by', href: c.url, rel: 'nofollow ugc noopener noreferrer', target: '_blank' }, name) : name;
    return c.author ? h('span', { class: 'cmt-who' }, by, h('span', { class: 'cmt-author' }, t('js.cmt.author'))) : by;
  }

  /** 引用评论带着引用的原文（细线引用样式，过长截断）；点一下回到正文里那一段 */
  function quote(c: MoriComment) {
    const q = h('blockquote', { class: 'cmt-quote', tabindex: '0', role: 'button', title: t('js.cmt.jump') }, c.quote!);
    const go = () => document.dispatchEvent(new CustomEvent('mori:jump', { detail: c }));
    q.addEventListener('click', go);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    q.dataset.commentId = String(c.id);
    return q;
  }

  function toggleReply(li: HTMLElement, c: MoriComment, btn: HTMLElement) {
    const main = li.querySelector<HTMLElement>(':scope > .cmt-main')!;
    const open = main.querySelector(':scope > form.cmt-form');
    if (open) { open.remove(); btn.textContent = t('js.cmt.reply'); return; }
    btn.textContent = t('js.cmt.cancelReply');
    const f = commentForm(cfg!, { parent: c });
    main.insertBefore(f, main.querySelector(':scope > .cmt-replies'));
    f.querySelector('textarea')!.focus();
  }

  offAdded?.(); // 换页前的监听先拆掉
  const added = (e: Event) => {
    const c = (e as CustomEvent<MoriComment>).detail;
    if (c && !comments.some((x) => x.id === c.id)) { comments.push(c); render(); }
  };
  document.addEventListener('mori:comment-added', added);
  offAdded = () => document.removeEventListener('mori:comment-added', added);
}

document.addEventListener('astro:page-load', init);
init();

export {};
