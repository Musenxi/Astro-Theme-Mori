import emoji from 'virtual:mori/emoji';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 表情在页面里的写法；没登记的名字原样留着文字 */
export function emojiHtml(name: string): string {
  const url = emoji.map[name];
  return url ? `<img class="emoji" src="${escapeHtml(url)}" alt=":[${escapeHtml(name)}]" title="${escapeHtml(name)}" loading="lazy" decoding="async">` : escapeHtml(`:[${name}]`);
}
