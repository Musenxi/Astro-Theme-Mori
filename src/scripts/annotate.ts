/**
 * 划词引用评论（spec §3.4）：读者选中正文里的一段文字，针对这段发表评论。
 *  - 选中后浮出一颗小玻璃按钮“引用评论”；点开是选区旁边的小输入框（手机上从底部弹出）；发完就收起，读者留在原处。
 *  - 划词发的评论也是评论：显示在文末评论区，带着引用的原文；点引用，回到正文里那一段并临时高亮（CSS Custom Highlight API，不改正文 DOM）。
 *  - 正文里被引用过的文字不留任何记号；读者划词时，如果选区和某条引用评论的原文重叠，选区下面浮出一张小卡，列出引用这段文字的评论。
 *  - 位置 = 块 id + 起止字符位置（跳过 data-skip 的旁注编号、标题序号等），另存原文和前后文，文章改了以后重新定位（anchor-text.ts）。
 *  - 只有使用 MORI 自建评论时才有；图片不能划词。
 */
import { t } from './i18n.ts';
import { chevronHtml } from '../lib/chevron.ts';
import { locate, contextOf, type Anchor } from '../lib/anchor-text.ts';
import { moriConfig, listComments, sendComment, mountTurnstile, remember, type MoriComment } from './cmt-api.ts';

/** 能划词的块：普通文章的段落 / 标题 / 引用，游记的文字块里的段落 */
const SELECTABLE = '.prose p[data-b], .prose h2[data-b], .prose h3[data-b], .prose blockquote[data-b], .b-text p[data-b], .b-text h2[data-b], .b-text h3[data-b], .b-text blockquote[data-b]';
const MAX_QUOTE = 600;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ───────────── 文本位置 ───────────── */

interface TextPart { node: Text; start: number; end: number }

/** 块里的文本节点（跳过 data-skip：旁注编号、二级标题序号、引文出处），以及它们在块文字里的位置 */
function parts(block: Element): TextPart[] {
  const out: TextPart[] = [];
  let pos = 0;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('[data-skip]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    out.push({ node: n, start: pos, end: pos + n.data.length });
    pos += n.data.length;
  }
  return out;
}
const textOf = (ps: TextPart[]) => ps.map((p) => p.node.data).join('');

/** 一个 DOM 边界点在块文字里的位置 */
function offsetOf(ps: TextPart[], container: Node, offset: number): number {
  const probe = document.createRange();
  probe.setStart(container, offset);
  probe.collapse(true);
  let sum = 0;
  for (const p of ps) {
    if (p.node === container) return p.start + offset;
    // 这个文本节点的末尾在边界之前（或正好在边界上）：整段都算
    if (probe.comparePoint(p.node, p.node.length) <= 0) sum = p.end;
  }
  return sum;
}

function rangeFor(ps: TextPart[], start: number, end: number): Range | null {
  const a = ps.find((p) => start >= p.start && start < p.end), b = ps.find((p) => end > p.start && end <= p.end);
  if (!a || !b) return null;
  const r = document.createRange();
  r.setStart(a.node, start - a.start);
  r.setEnd(b.node, end - b.start);
  return r;
}

const elementOf = (n: Node) => (n instanceof Element ? n : n.parentElement);

function currentSelection() {
  const sel = getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const s = elementOf(range.startContainer)?.closest<HTMLElement>(SELECTABLE), e = elementOf(range.endContainer)?.closest<HTMLElement>(SELECTABLE);
  if (!s || s !== e) return null; // 只在同一个块里划词
  const ps = parts(s), text = textOf(ps);
  const start = offsetOf(ps, range.startContainer, range.startOffset), end = offsetOf(ps, range.endContainer, range.endOffset);
  const quote = text.slice(start, end);
  if (end <= start || !quote.trim() || quote.length > MAX_QUOTE) return null;
  const anchor: Anchor = { start, end, quote, ...contextOf(text, start, end) };
  return { block: s, range: range.cloneRange(), anchor };
}

/** 在块里找回一条引用评论的位置；文章改过、找不到就是 null */
function resolve(block: Element, c: Pick<MoriComment, 'start' | 'end' | 'quote' | 'prefix' | 'suffix'>): Range | null {
  const ps = parts(block);
  const at = locate(textOf(ps), { start: c.start ?? 0, end: c.end ?? 0, quote: c.quote ?? '', prefix: c.prefix ?? '', suffix: c.suffix ?? '' });
  return at ? rangeFor(ps, at.start, at.end) : null;
}

/* ───────────── 从评论区回到正文 ───────────── */

/** 让块出现在屏幕中间：长卷的横向读法由 travel.ts 接手（换算成竖向滚动距离），其余用原生滚动 */
function reveal(el: Element) {
  const ev = new CustomEvent('mori:reveal', { detail: { el, handled: false } });
  document.dispatchEvent(ev);
  if (!ev.detail.handled) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
}

/** 等滚动停下来再做事（跳得远时平滑滚动要好几秒；横向读法下位移还要再缓动一会儿） */
function whenSettled(cb: () => void) {
  let idle = 0;
  const finish = () => { removeEventListener('scroll', bump); clearTimeout(idle); clearTimeout(cap); setTimeout(cb, reduce ? 0 : 300); };
  const bump = () => { clearTimeout(idle); idle = window.setTimeout(finish, 160); };
  addEventListener('scroll', bump, { passive: true });
  const cap = window.setTimeout(finish, 4000); // 最多等 4 秒
  // 平滑滚动不是立刻开始：给 500ms 宽限，期间没开始滚动才当作“不需要滚”
  idle = window.setTimeout(finish, reduce ? 0 : 500);
}

let fadeTimer = 0;
function highlight(range: Range) {
  const css = CSS as any;
  if (!css.highlights || !(window as any).Highlight) return;
  clearTimeout(fadeTimer);
  css.highlights.set('mori-anno', new (window as any).Highlight(range));
  // 先高亮一会儿，再淡一档，然后消失
  fadeTimer = window.setTimeout(() => {
    css.highlights.delete('mori-anno');
    css.highlights.set('mori-anno-fade', new (window as any).Highlight(range));
    fadeTimer = window.setTimeout(() => css.highlights.delete('mori-anno-fade'), 900);
  }, 1800);
}

const blockOf = (id: string) => document.querySelector<HTMLElement>(`[data-b="${CSS.escape(id)}"]`);

function markGone(list: MoriComment[]) {
  for (const c of list) {
    if (!c.block) continue;
    const b = blockOf(c.block);
    const gone = !b || !resolve(b, c);
    document.querySelector(`.cmt-quote[data-comment-id="${c.id}"]`)?.classList.toggle('gone', gone);
  }
}

/* ───────────── 界面：按钮和输入框 ───────────── */

/** 挂在 document / window 上的监听，换页时要拆掉（Astro 换页不会替我们清） */
let off: Array<() => void> = [];
function on(target: EventTarget, type: string, fn: (e: any) => void, opts?: AddEventListenerOptions) {
  target.addEventListener(type, fn, opts);
  off.push(() => target.removeEventListener(type, fn, opts));
}

function init() {
  const cfg = moriConfig();
  if (!cfg || cfg.annotations === false || cfg.status === 'readonly') return;
  if (document.body.dataset.annoReady) return;
  document.body.dataset.annoReady = '1';
  off.forEach((f) => f()); off = [];

  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'anno-btn glass'; btn.textContent = t('js.anno.btn'); btn.hidden = true;

  const pop = document.createElement('form');
  pop.className = 'anno-pop glass'; pop.hidden = true;
  pop.innerHTML = `
    <blockquote class="anno-q"></blockquote>
    <div class="anno-row"><input name="name" placeholder="${t('js.cmt.name')}" required maxlength="40" autocomplete="nickname"><input name="email" type="email" placeholder="${t('js.anno.email')}" required maxlength="120" autocomplete="email"></div>
    <input name="url" type="text" inputmode="url" placeholder="${t('js.cmt.url')}" maxlength="200" autocomplete="url">
    <textarea name="body" placeholder="${t('js.anno.write')}" required rows="3" maxlength="4000"></textarea>
    <input name="website" class="cmt-trap" tabindex="-1" autocomplete="off" aria-hidden="true">
    <div class="anno-ts"></div>
    <div class="anno-foot"><span class="anno-msg" role="status"></span><button type="button" class="anno-cancel linkbtn">${t('js.anno.cancel')}</button><button type="submit" class="anno-send">${t('js.cmt.send')}${chevronHtml()}</button></div>`;
  // 选区和已有引用评论的原文重叠时，列出引用它的评论
  const seen = document.createElement('div');
  seen.className = 'anno-seen glass'; seen.hidden = true;
  seen.addEventListener('pointerdown', (e) => e.preventDefault()); // 点卡片不能让选区丢掉
  document.body.append(btn, seen, pop);

  /** 已知的评论：评论区画好时给一份，读者刚发的补进来；文章一打开就先自己取一次，划词时不必等读者翻到文末 */
  let known: MoriComment[] = [];
  listComments(cfg, cfg.entry).then((l) => { if (!known.length) known = l; }).catch(() => {});
  on(document, 'mori:comment-added', (e) => { const c = (e as CustomEvent<MoriComment>).detail; if (c && !known.some((x) => x.id === c.id)) known.push(c); });

  /** 引用了选区文字的引用评论（原文位置和选区有重叠），按时间 */
  function citing(s: NonNullable<ReturnType<typeof currentSelection>>): MoriComment[] {
    const id = s.block.dataset.b, text = textOf(parts(s.block));
    return known.filter((c) => !c.parentId && c.block === id).filter((c) => {
      const at = locate(text, { start: c.start ?? 0, end: c.end ?? 0, quote: c.quote ?? '', prefix: c.prefix ?? '', suffix: c.suffix ?? '' });
      return !!at && at.start < s.anchor.end && at.end > s.anchor.start;
    }).sort((a, b) => a.createdAt - b.createdAt);
  }
  function fillSeen(list: MoriComment[]) {
    const el = (tag: string, cls: string, text: string) => { const n = document.createElement(tag); n.className = cls; n.textContent = text; return n; };
    seen.replaceChildren(...list.map((c) => {
      const d = el('div', 'anno-seen-i', '');
      d.append(el('b', '', c.name), el('p', 'anno-seen-t', c.body));
      for (const r of known.filter((x) => x.parentId === c.id)) { const p = el('p', 'anno-seen-r', ''); p.append(el('b', '', r.name), document.createTextNode(`  ${r.body}`)); d.append(p); }
      return d;
    }));
  }

  const $ = <T extends HTMLElement>(s: string) => pop.querySelector<T>(s)!;
  const name = $<HTMLInputElement>('[name=name]'), email = $<HTMLInputElement>('[name=email]'), url = $<HTMLInputElement>('[name=url]'), text = $<HTMLTextAreaElement>('[name=body]');
  const trap = $<HTMLInputElement>('[name=website]'), msg = $('.anno-msg'), send = $<HTMLButtonElement>('.anno-send');

  let cur: ReturnType<typeof currentSelection> = null;
  let popOpen = false;
  let hasSeen = false;
  let widget: { token(): string; reset(): void } | null = null;

  /* 按钮 / 输入框跟着选区走：横向读法下文字会随滚动横移；输入框打开时暂停跟随，不让它在读者打字时滑出屏幕 */
  function place() {
    if (cur && !popOpen) {
      const rects = cur.range.getClientRects(), r = rects[rects.length - 1] ?? cur.range.getBoundingClientRect();
      const off = !r || (r.width === 0 && r.height === 0) || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth;
      btn.hidden = off;
      seen.hidden = off || !hasSeen;
      if (!off) {
        btn.style.left = Math.min(innerWidth - btn.offsetWidth - 8, Math.max(8, r.right - btn.offsetWidth / 2)) + 'px';
        let top = r.bottom + 8;
        if (hasSeen) {
          seen.style.left = Math.min(innerWidth - seen.offsetWidth - 8, Math.max(8, r.left)) + 'px';
          top = Math.min(top, innerHeight - seen.offsetHeight - btn.offsetHeight - 20);
          seen.style.top = top + 'px';
          top += seen.offsetHeight + 6;
        }
        btn.style.top = Math.min(innerHeight - btn.offsetHeight - 8, top) + 'px';
      }
    }
    if (!btn.hidden || popOpen) requestAnimationFrame(place);
  }
  const show = () => { btn.hidden = false; requestAnimationFrame(place); };

  let selTimer = 0;
  on(document, 'selectionchange', () => {
    clearTimeout(selTimer);
    selTimer = window.setTimeout(() => {
      if (popOpen) return;
      const s = currentSelection();
      if (s && !elementOf(getSelection()!.anchorNode!)?.closest('.anno-pop, #comments, form')) {
        cur = s;
        const list = citing(s);
        fillSeen(list); hasSeen = list.length > 0;
        show();
      } else { cur = null; hasSeen = false; btn.hidden = true; seen.hidden = true; }
    }, 140);
  });

  // 点按钮时不能让选区丢掉
  btn.addEventListener('pointerdown', (e) => e.preventDefault());
  btn.addEventListener('click', async () => {
    if (!cur) return;
    popOpen = true; btn.hidden = true; seen.hidden = true;
    $('.anno-q').textContent = cur.anchor.quote;
    name.value = remember.get('mori-cmt-name'); email.value = remember.get('mori-cmt-email'); url.value = remember.get('mori-cmt-url'); msg.textContent = '';
    const r = cur.range.getBoundingClientRect(), rects = cur.range.getClientRects(), last = rects[rects.length - 1] ?? r;
    pop.hidden = false;
    // 桌面：贴着选区下方；手机：CSS 里改成从底部弹出
    pop.style.left = Math.min(innerWidth - pop.offsetWidth - 12, Math.max(12, last.left)) + 'px';
    const below = last.bottom + 10, fits = below + pop.offsetHeight < innerHeight - 12;
    pop.style.top = (fits ? below : Math.max(12, r.top - pop.offsetHeight - 10)) + 'px';
    (name.value ? text : name).focus();
    if (!widget && cfg.turnstileSiteKey) widget = await mountTurnstile(cfg, $('.anno-ts'));
  });

  function close() {
    popOpen = false; pop.hidden = true; btn.hidden = true; seen.hidden = true; hasSeen = false; cur = null;
    text.value = '';
  }
  $('.anno-cancel').addEventListener('click', close);
  on(window, 'keydown', (e) => { if (e.key === 'Escape' && popOpen) close(); });
  on(document, 'pointerdown', (e) => { if (popOpen && !(e.target as Element).closest('.anno-pop')) close(); });

  pop.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!cur) return;
    send.disabled = true; msg.textContent = t('js.cmt.sending'); msg.classList.remove('bad');
    try {
      const a = cur.anchor;
      const r = await sendComment(cfg, {
        entry: cfg.entry, block: cur.block.dataset.b, start: a.start, end: a.end, quote: a.quote, prefix: a.prefix, suffix: a.suffix,
        name: name.value, email: email.value, url: url.value, body: text.value, website: trap.value, turnstile: widget?.token(),
      });
      remember.set('mori-cmt-name', name.value); remember.set('mori-cmt-email', email.value); remember.set('mori-cmt-url', url.value);
      widget?.reset();
      getSelection()?.removeAllRanges();
      if (r.status === 'approved' && r.comment) document.dispatchEvent(new CustomEvent('mori:comment-added', { detail: r.comment }));
      toast(r.status === 'approved' ? t('js.anno.posted') : t('js.anno.pending'));
      close();
    } catch (err: any) { msg.textContent = err.message; msg.classList.add('bad'); }
    send.disabled = false;
  });

  function toast(s: string) {
    const el = document.createElement('div');
    el.className = 'anno-toast glass meta'; el.textContent = s;
    document.body.append(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3200);
  }

  on(document, 'mori:jump', (e) => {
    const c = (e as CustomEvent<MoriComment>).detail;
    const quote = document.querySelector<HTMLElement>(`.cmt-quote[data-comment-id="${c.id}"]`);
    if (quote?.classList.contains('gone') || !c.block) return; // 原文已修改：不再跳转
    const block = blockOf(c.block);
    const range = block && resolve(block, c);
    if (!block || !range) { quote?.classList.add('gone'); return; }
    reveal(block);
    whenSettled(() => highlight(range)); // 等滚动到位再高亮
  });

  // 评论区画好以后，检查每条引用评论在现在的正文里还找不找得到
  on(document, 'mori:comments-rendered', (e) => { known = (e as CustomEvent<MoriComment[]>).detail; markGone(known); });
}

// 换页后这些浮层是新的一份：init 靠 body 上的标记避免重复，换页时 body 被替换所以标记自然消失
document.addEventListener('astro:page-load', init);
init();

export {};
