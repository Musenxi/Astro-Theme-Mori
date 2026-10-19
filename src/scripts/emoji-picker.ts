import emoji from 'virtual:mori/emoji';

const NS = 'http://www.w3.org/2000/svg';

function smile(): SVGElement {
  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
  const el = (tag: string, a: Record<string, string>) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); svg.append(e); };
  el('circle', { cx: '12', cy: '12', r: '10' });
  el('path', { d: 'M8 14s1.5 2 4 2 4-2 4-2' });
  el('path', { d: 'M9 9h.01M15 9h.01' });
  return svg;
}

/** 评论框里的表情按钮：点开是一个面板，上面一排标签（每个表情包一个），下面是这个包的表情；点一个就在光标处插入 :[包名_表情名]。没有表情包就不画 */
export function emojiButton(text: HTMLTextAreaElement): HTMLElement | null {
  const packs = emoji.packs;
  if (!packs.length) return null;
  const wrap = document.createElement('span');
  wrap.className = 'cmt-emoji';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cmt-emoji-btn';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'Emoji');
  btn.append(smile());
  const panel = document.createElement('div');
  panel.className = 'cmt-emoji-panel';
  panel.hidden = true;
  const tabs = document.createElement('div');
  tabs.className = 'cmt-emoji-tabs';
  tabs.setAttribute('role', 'tablist');
  const grid = document.createElement('div');
  grid.className = 'cmt-emoji-grid';
  panel.append(tabs, grid);
  wrap.append(btn, panel);

  const show = (i: number) => {
    [...tabs.children].forEach((t, k) => t.setAttribute('aria-selected', String(k === i)));
    grid.replaceChildren(...packs[i].items.map((it) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = it.name;
      const img = document.createElement('img');
      Object.assign(img, { src: it.url, alt: it.name, loading: 'lazy', decoding: 'async', referrerPolicy: 'no-referrer' });
      b.append(img);
      b.addEventListener('click', () => {
        const tag = `:[${it.key}]`;
        const { selectionStart: a, selectionEnd: z } = text;
        text.setRangeText(tag, a, z, 'end');
        text.dispatchEvent(new Event('input', { bubbles: true }));
        text.focus();
        set(false);
      });
      return b;
    }));
  };
  packs.forEach((p, i) => {
    const t = document.createElement('button');
    t.type = 'button';
    t.setAttribute('role', 'tab');
    t.textContent = p.title;
    t.addEventListener('click', () => show(i));
    tabs.append(t);
  });
  show(0);

  const set = (open: boolean) => {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      const off = (e: Event) => { if (e.type === 'keydown' ? (e as KeyboardEvent).key === 'Escape' : !wrap.contains(e.target as Node)) { set(false); document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', off); } };
      document.addEventListener('pointerdown', off);
      document.addEventListener('keydown', off);
    }
  };
  btn.addEventListener('click', () => set(panel.hidden));
  return wrap;
}
