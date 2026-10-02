import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postHtml, inline } from '../src/lib/feed-html.ts';

const ctx = { base: 'https://example.com', image: async (src: any) => `https://example.com/img/${src}.jpg` };
const S = (t: string, marks?: any[]) => ({ t, marks });

test('文章：段落、标题、引用、列表、代码、图片；链接变成绝对地址；文字被转义', async () => {
  const html = await postHtml({
    blocks: [
      { id: 'b1', type: 'p', text: [S('a < b & '), S('链接', [{ type: 'link', href: '/posts/x/' }]), S('，'), S('粗', [{ type: 'strong' }, { type: 'em' }])] },
      { id: 'b2', type: 'h', level: 2, text: [S('小节')] },
      { id: 'b3', type: 'quote', text: [S('引文')], cite: '某人', writing: 'h' },
      { id: 'b4', type: 'list', ordered: true, items: [[S('甲')], [S('乙')]] },
      { id: 'b5', type: 'code', code: '<b>x</b>' },
      { id: 'b6', type: 'image', src: 'pic', alt: '图', caption: '图注', layout: 'wide' },
    ],
    notes: {},
  } as any, ctx);
  assert.match(html, /<p>a &lt; b &amp; <a href="https:\/\/example\.com\/posts\/x\/">链接<\/a>，<strong><em>粗<\/em><\/strong><\/p>/);
  assert.match(html, /<h2>小节<\/h2>/);
  assert.match(html, /<blockquote><p>引文<\/p><p>—— 某人<\/p><\/blockquote>/);
  assert.match(html, /<ol><li>甲<\/li><li>乙<\/li><\/ol>/);
  assert.match(html, /<pre><code>&lt;b&gt;x&lt;\/b&gt;<\/code><\/pre>/);
  assert.match(html, /<figure><img src="https:\/\/example\.com\/img\/pic\.jpg" alt="图" \/><figcaption>图注<\/figcaption><\/figure>/);
});

test('旁注和脚注统一按出现顺序编号，文末列出正文；外链不改', async () => {
  const html = await postHtml({
    blocks: [{ id: 'b1', type: 'p', text: [S('甲', [{ type: 'fn', ref: 'f' }]), S('乙', [{ type: 'note', ref: 'n' }]), S('丙', [{ type: 'link', href: 'https://a.b/' }])] }],
    notes: { n: { text: [S('旁注正文')] }, f: { text: [S('脚注正文')] } },
  } as any, ctx);
  assert.match(html, /甲<sup>\[1\]<\/sup>乙<sup>\[2\]<\/sup><a href="https:\/\/a\.b\/">丙<\/a>/);
  assert.match(html, /<hr \/>\n<p>\[1\] 脚注正文<\/p>\n<p>\[2\] 旁注正文<\/p>/);
});

test('长卷：事实、二级标题、地点当普通文字、各种图块；地图不放', async () => {
  const place = { type: 'place', lnglat: [-21.9, 64.1], en: 'Reykjavík' };
  const html = await postHtml({
    facts: [{ label: '路线', value: '一号公路' }],
    notes: {},
    blocks: [
      { id: 'h1', type: 'h', level: 2, text: [S('雷克雅未克', [place])] },
      { id: 'p1', type: 'p', text: [S('到了。')] },
      { id: 'm1', type: 'map', scope: 'route' },
      { id: 'a', type: 'pair', images: [{ src: 'x', alt: 'x' }, { src: 'y', alt: 'y' }] },
      { id: 'f', type: 'free', ar: 1.5, items: [{ kind: 'image', src: 'z', alt: 'z', x: 0, y: 0, w: 0.5, z: 1 }, { kind: 'text', text: [S('竖排小字')], x: 0, y: 0 }] },
    ],
  } as any, ctx);
  assert.match(html, /<li><strong>路线<\/strong>：一号公路<\/li>/);
  assert.match(html, /<h2>雷克雅未克<\/h2>\n<p>到了。<\/p>/);
  assert.match(html, /<p>竖排小字<\/p>/);
  assert.equal((html.match(/<img /g) ?? []).length, 3);
});

test('行内：换行变 <br />，tcy 不留标签', () => {
  assert.equal(inline([S('a\nb'), S('2025', [{ type: 'tcy' }])] as any, 'https://e.com', new Map()), 'a<br />b2025');
});

test('空段落不放进订阅', async () => {
  const html = await postHtml({ blocks: [{ id: 'b1', type: 'p', text: [S('')] }, { id: 'b2', type: 'p', text: [S('有字')] }], notes: {} } as any, ctx);
  assert.equal(html, '<p>有字</p>');
});
