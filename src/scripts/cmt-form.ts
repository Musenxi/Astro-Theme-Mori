/** 写评论的表单：文末评论、回复、划词引用评论共用一个样子 */
import { t } from './i18n.ts';
import { emojiButton } from './emoji-picker.ts';
import { sendComment, mountTurnstile, remember, type MoriComment, type MoriCommentsConfig, type SendResult } from './cmt-api.ts';
import type { Anchor } from '../lib/anchor-text.ts';

type Child = Node | string | null | false | undefined;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids) if (c) e.append(c);
  return e;
}

interface FormOptions {
  /** 回复哪一条 */
  parent?: MoriComment | null;
  /** 划词引用评论：引用的块和位置，表单上方显示引用的原文 */
  anchor?: Anchor & { block: string };
  /** 有它就多一个“取消” */
  onCancel?: () => void;
  /** 发出去以后由调用方收尾；不给就在表单下面提示 */
  onSent?: (r: SendResult) => void;
}

export function commentForm(cfg: MoriCommentsConfig & { entry: string }, o: FormOptions = {}) {
  const { parent, anchor } = o;
  const name = h('input', { name: 'name', placeholder: t('js.cmt.name'), required: true, maxlength: '40', autocomplete: 'nickname', value: remember.get('mori-cmt-name') });
  const email = h('input', { name: 'email', type: 'email', placeholder: t('js.cmt.email'), required: true, maxlength: '120', autocomplete: 'email', value: remember.get('mori-cmt-email') });
  const url = h('input', { name: 'url', type: 'text', inputmode: 'url', placeholder: t('js.cmt.url'), maxlength: '200', autocomplete: 'url', value: remember.get('mori-cmt-url') });
  const text = h('textarea', { name: 'body', placeholder: parent ? t('js.cmt.replyTo', { name: parent.name }) : t('js.cmt.write'), required: true, rows: '4', maxlength: '4000' });
  // 蜜罐：真人看不到，机器人会填
  const trap = h('input', { name: 'website', class: 'cmt-trap', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
  const ts = h('div', { class: 'cmt-ts' });
  const msg = h('p', { class: 'cmt-msg', role: 'status' });
  const btn = h('button', { class: 'cmt-send', type: 'submit' }, (parent ? t('js.cmt.sendReply') : t('js.cmt.send')));
  const cancel = o.onCancel && h('button', { class: 'cmt-cancel', type: 'button', onclick: o.onCancel }, t('js.anno.cancel'));
  // 一块淡底：上面一栏是署名，中间写字，下面一栏是发表
  const f = h('form', { class: 'cmt-form' },
    anchor && h('blockquote', { class: 'cmt-quote' }, anchor.quote),
    h('div', { class: 'cmt-box' }, h('div', { class: 'cmt-row' }, name, email, url), text, h('div', { class: 'cmt-foot' }, emojiButton(text), cancel, btn)), trap, ts, msg);
  let widget: { token(): string; reset(): void } | null = null;
  // 人机验证控件在第一次聚焦时才加载
  f.addEventListener('focusin', async () => { if (!widget && cfg.turnstileSiteKey) widget = await mountTurnstile(cfg, ts); }, { once: true });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true; msg.textContent = t('js.cmt.sending'); msg.classList.remove('bad');
    try {
      // 回复的是一条回复时，评论服务把它挂在最上面那条下面（只有一层），正文开头点名，读的人才知道在回谁
      const mention = parent?.parentId ? `@${parent.name} ` : '';
      const at = anchor ? { block: anchor.block, start: anchor.start, end: anchor.end, quote: anchor.quote, prefix: anchor.prefix, suffix: anchor.suffix } : {};
      const r = await sendComment(cfg, { entry: cfg.entry, ...at, name: name.value, email: email.value, url: url.value, body: mention + text.value, website: trap.value, parentId: parent?.id, turnstile: widget?.token() });
      remember.set('mori-cmt-name', name.value); remember.set('mori-cmt-email', email.value); remember.set('mori-cmt-url', url.value);
      text.value = '';
      widget?.reset();
      msg.textContent = '';
      if (r.status === 'approved' && r.comment) document.dispatchEvent(new CustomEvent('mori:comment-added', { detail: r.comment }));
      if (o.onSent) o.onSent(r);
      else if (r.status !== 'approved') msg.textContent = t('js.cmt.pending');
    } catch (err: any) { msg.textContent = err.message; msg.classList.add('bad'); }
    btn.disabled = false;
  });
  return f;
}
