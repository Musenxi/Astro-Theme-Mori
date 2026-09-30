import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMarkdown, fromMarkdown, similarity } from '../app/src/lib/mdsync.js';

const doc = () => ({
  title: '标题', date: '2025-01-01', category: 'essays', excerpt: 'x',
  notes: { n1: { text: [{ t: '旁注正文' }] } },
  blocks: [
    { id: 'b01', type: 'p', text: [{ t: '今年是 ' }, { t: '2025', marks: [{ type: 'tcy' }] }, { t: ' 年。' }] },
    { id: 'b02', type: 'h', level: 2, text: [{ t: '小节' }] },
    { id: 'b03', type: 'p', text: [{ t: '这里有一个' }, { t: '旁注', marks: [{ type: 'note', ref: 'n1' }] }, { t: '。' }] },
    { id: 'b04', type: 'quote', writing: 'v', text: [{ t: '一句引文' }], cite: '某人' },
    { id: 'b05', type: 'image', src: '../../assets/a.jpg', alt: '图', layout: 'inline' },
  ],
});

test('不动就不变：id、tcy、旁注类型、引文竖排、图片布局都原样保留', () => {
  const d = doc();
  const back = fromMarkdown(toMarkdown(d), d);
  assert.deepEqual(back.blocks, d.blocks);
  assert.deepEqual(back.notes, d.notes);
  assert.equal(back.title, '标题');
});

test('图片路径在文本里只有文件名', () => assert.match(toMarkdown(doc()), /!\[图\]\(a\.jpg\)/));

test('改几个字的段落沿用 id；新插入的段落取新 id；删掉的块消失', () => {
  const d = doc();
  let t = toMarkdown(d).replace('这里有一个', '这里有另一个');
  t = t.replace('## 小节\n', '## 小节\n\n刚写的新段落，和别的都不像。\n');
  const back = fromMarkdown(t, d);
  const byText = (s) => back.blocks.find((b) => JSON.stringify(b).includes(s));
  assert.equal(byText('另一个').id, 'b03');
  assert.equal(byText('刚写的').id, 'b06');
  assert.equal(new Set(back.blocks.map((b) => b.id)).size, back.blocks.length);
  const gone = fromMarkdown(t.replace(/> 一句引文\n> —— 某人\n\n/, ''), d);
  assert.ok(!gone.blocks.some((b) => b.id === 'b04'));
});

test('改成完全不同的一段：不沿用旧 id', () => {
  const d = doc();
  const back = fromMarkdown(toMarkdown(d).replace(/今年是 2025 年。/, '完全没有关系的另一件事情'), d);
  assert.ok(!back.blocks.some((b) => b.id === 'b01'));
});

test('改标题行改的是 title；删掉标题行则保留原标题', () => {
  const d = doc();
  assert.equal(fromMarkdown(toMarkdown(d).replace('# 标题', '# 新标题'), d).title, '新标题');
  assert.equal(fromMarkdown(toMarkdown(d).replace('# 标题\n\n', ''), d).title, '标题');
});

test('相似度', () => {
  assert.equal(similarity('abc', 'abc'), 1);
  assert.ok(similarity('今天天气不错', '今天天气很好') > 0.4);
  assert.ok(similarity('今天天气不错', '完全无关的话') < 0.2);
});

test('手写 JSON 里的裸字符串文字也能转，且不动就不变', () => {
  const d = { title: 'T', blocks: [{ id: 'b01', type: 'p', text: '一段裸字符串。' }, { id: 'b02', type: 'list', items: ['甲', '乙'] }], notes: { n1: { text: '注' } } };
  const md = toMarkdown(d);
  assert.match(md, /一段裸字符串。/);
  assert.deepEqual(fromMarkdown(md, d).blocks, d.blocks);
});

test('旁注：没改的原样保留（裸字符串不变成数组），改过的才更新', () => {
  const d = { title: 'T', blocks: [{ id: 'b01', type: 'p', text: [{ t: '甲', marks: [{ type: 'note', ref: 'n1' }] }] }], notes: { n1: { text: '裸字符串旁注' }, n2: { text: [{ t: '数组旁注' }] } } };
  const md = toMarkdown(d);
  assert.deepEqual(fromMarkdown(md, d).notes, d.notes);
  const edited = fromMarkdown(md.replace('裸字符串旁注', '改过的旁注'), d);
  assert.deepEqual(edited.notes.n2, d.notes.n2);
  assert.match(JSON.stringify(edited.notes.n1), /改过的旁注/);
});

/* ───────────── 游记：Markdown 里只有文字和图 ───────────── */
const trip = () => ({
  kind: 'travel', title: '环岛', date: '2025-06-30', category: 'journeys', excerpt: 'x',
  stops: [
    { id: 'rey', name: '雷克雅未克', en: 'Reykjavík', lnglat: [-21.9426, 64.1466], date: '06.20' },
    { id: 'vik', name: '维克', lnglat: [-19.006, 63.4186] },
  ],
  notes: { n1: { text: [{ t: '旁注' }] } },
  blocks: [
    { id: 't01', type: 'text', stop: 'rey', y: 0.3, paras: [{ id: 't01p1', text: [{ t: '落地是晚上。' }] }, { id: 't01p2', text: [{ t: '住在港口边。' }] }] },
    { id: 's01', type: 'single', stop: 'rey', y: 0.15, scale: 0.92, src: '../../assets/a.jpg', alt: '', caption: '海。', layout: 'inset' },
    { id: 't02', type: 'text', stop: 'rey', writing: 'v', paras: [{ id: 't02p1', text: [{ t: '向南' }, { t: '', marks: [{ type: 'note', ref: 'n1' }] }] }] },
    { id: 'm01', type: 'map', stop: 'rey', scope: 'route' },
    { id: 'p01', type: 'pair', stop: 'vik', y: 0.1, images: [{ src: '../../assets/a.jpg', alt: '', caption: '黑沙滩。' }, { src: '../../assets/b.jpg', alt: '' }] },
    { id: 'st01', type: 'strip', stop: 'vik', images: [{ src: '../../assets/c.jpg', alt: '', scale: 1, offset: 0 }, { src: '../../assets/d.jpg', alt: '', scale: 0.8, offset: 0.12 }] },
    { id: 'f01', type: 'free', stop: 'vik', ar: 1.6, items: [{ kind: 'image', src: '../../assets/e.jpg', alt: '', x: 0.04, y: 0.06, w: 0.56, z: 1 }, { kind: 'text', text: [{ t: '一句' }], x: 0.9, y: 0.1 }] },
  ],
});
const find = (d, id) => d.blocks.find((b) => b.id === id);

test('游记：文本里只有站名、文字和图片，没有任何排版指令', () => {
  const t = toMarkdown(trip());
  assert.doesNotMatch(t, /:::|\{|\}/);
  assert.match(t, /^## 雷克雅未克$/m);
  assert.match(t, /^!\[\]\(a\.jpg "海。"\)$/m);
  assert.match(t, /^逆时针|向南\[\^n1\]$/m);
});

test('游记：不动就不变（站点、版式、竖排、内缩、图组、自由排布里的小段文字、地图、旁注）', () => {
  const d = trip();
  const back = fromMarkdown(toMarkdown(d), d);
  assert.deepEqual(back.stops, d.stops);
  assert.deepEqual(back.blocks, d.blocks);
  assert.deepEqual(back.notes, d.notes);
  assert.equal(back.title, '环岛');
});

test('游记：改几个字的段落沿用块和段落 id，横滚位置跟着走', () => {
  const d = trip();
  const back = fromMarkdown(toMarkdown(d).replace('落地是晚上。', '落地是深夜。'), d);
  const t01 = find(back, 't01');
  assert.equal(t01.y, 0.3);
  assert.equal(t01.paras[0].id, 't01p1');
  assert.ok(JSON.stringify(t01.paras[0].text).includes('深夜'));
  assert.deepEqual(back.blocks.map((b) => b.id), trip().blocks.map((b) => b.id));
});

test('游记：在文字块后面接着写，进同一个文字块；隔着图再写，是新文字块', () => {
  const d = trip();
  let t = toMarkdown(d).replace('住在港口边。', '住在港口边。\n\n第三段，刚写的，和别的都不像。');
  const a = fromMarkdown(t, d);
  assert.equal(find(a, 't01').paras.length, 3);
  assert.match(find(a, 't01').paras[2].id, /^t01p\d$/);
  t = toMarkdown(d).replace('![](a.jpg "海。")', '![](a.jpg "海。")\n\n图后面的一段新文字，写得很长很长。');
  const b = fromMarkdown(t, d);
  const added = b.blocks.find((x) => JSON.stringify(x).includes('图后面'));
  assert.equal(added.type, 'text');
  assert.match(added.id, /^t\d\d$/);
  assert.notEqual(added.id, 't01');
  assert.equal(new Set(b.blocks.map((x) => x.id)).size, b.blocks.length);
});

test('游记：新贴一行图片是新的单图块', () => {
  const d = trip();
  const back = fromMarkdown(toMarkdown(d).replace('## 维克', '![新图](n.jpg "新图注")\n\n## 维克'), d);
  const added = back.blocks.find((b) => b.src === '../../assets/n.jpg');
  assert.equal(added.type, 'single');
  assert.equal(added.stop, 'rey');
  assert.equal(added.caption, '新图注');
  assert.match(added.id, /^s\d\d$/);
});

test('游记：改图注只改图注；换掉图片文件就是删一张再加一张', () => {
  const d = trip();
  const back = fromMarkdown(toMarkdown(d).replace('"海。"', '"夜里的海。"'), d);
  assert.equal(find(back, 's01').caption, '夜里的海。');
  assert.equal(find(back, 's01').y, 0.15);
  assert.equal(find(back, 's01').layout, 'inset');
});

test('游记：双图删掉一张退成单图，图组和自由排布保留剩下的；全删就没了，地图不受影响', () => {
  const d = trip();
  let t = toMarkdown(d).replace('![](b.jpg)\n\n', '');
  let back = fromMarkdown(t, d);
  assert.equal(find(back, 'p01').type, 'single');
  assert.equal(find(back, 'p01').src, '../../assets/a.jpg');
  assert.equal(find(back, 'p01').y, 0.1);
  t = toMarkdown(d).replace('![](e.jpg)\n\n', '').replace('![](c.jpg)\n\n', '').replace('![](d.jpg)\n\n', '');
  back = fromMarkdown(t, d);
  assert.equal(find(back, 'st01'), undefined);
  assert.deepEqual(find(back, 'f01').items, [d.blocks[6].items[1]]); // 自由排布里只剩那段小文字
  assert.ok(find(back, 'm01'));
});

test('游记：新站点取新 id、没写经纬度；站名改了沿用旧站点', () => {
  const d = trip();
  const t = toMarkdown(d).replace('## 维克', '## 维克镇') + '\n## 阿克雷里\n\n新的一站，写了一段和别的都不像的话。\n';
  const back = fromMarkdown(t, d);
  assert.equal(back.stops[1].id, 'vik');
  assert.equal(back.stops[1].name, '维克镇');
  assert.deepEqual(back.stops[1].lnglat, [-19.006, 63.4186]);
  const s = back.stops[2];
  assert.equal(s.name, '阿克雷里');
  assert.deepEqual(s.lnglat, [0, 0]);
  assert.equal(back.blocks.find((b) => b.stop === s.id).type, 'text');
  assert.equal(new Set(back.blocks.map((b) => b.id)).size, back.blocks.length);
});

test('游记：原 JSON 里块不是按站点排的，改一个字也不该让别的块换 id', () => {
  const d = trip();
  d.blocks = [d.blocks.at(-1), ...d.blocks.slice(0, -1)];
  const back = fromMarkdown(toMarkdown(d).replace('落地是晚上。', '落地是深夜。'), d);
  assert.deepEqual(back.blocks.map((b) => b.id).sort(), d.blocks.map((b) => b.id).sort());
});

/* ───────────── 游记的文字也能有小标题、引用、列表、代码（游记是文章的超集） ───────────── */

const rich = () => ({
  kind: 'travel', title: '环岛', date: '2025-01-01', category: 'journeys', excerpt: '', notes: {},
  stops: [{ id: 'rey', name: '雷克雅未克', lnglat: [0, 0] }],
  blocks: [{ id: 't01', type: 'text', stop: 'rey', paras: [
    { id: 't01p1', text: [{ t: '落地是晚上。' }] },
    { id: 't01p2', type: 'h', text: [{ t: '港口' }] },
    { id: 't01p3', type: 'quote', text: [{ t: '一句话' }], cite: '某人' },
    { id: 't01p4', type: 'list', ordered: false, items: [[{ t: '面包' }], [{ t: '咖啡' }]] },
    { id: 't01p5', type: 'code', lang: 'ts', code: 'a();\n\nb();' },
  ] }],
});

test('游记：小标题、引用、列表、代码写成和文章一样的 Markdown，不动就不变', () => {
  const d = rich();
  const t = toMarkdown(d);
  assert.match(t, /^### 港口$/m);
  assert.match(t, /^> 一句话\n> —— 某人$/m);
  assert.match(t, /^- 面包\n- 咖啡$/m);
  assert.match(t, /^```ts\na\(\);\n\nb\(\);\n```$/m);
  const back = fromMarkdown(t, d);
  assert.deepEqual(back.blocks, d.blocks);
  assert.deepEqual(back.stops, d.stops);
});

test('游记：新写的引用、列表、小标题接进前一个文字块，代码里的空行不会把它截断', () => {
  const d = rich();
  d.blocks[0].paras = [d.blocks[0].paras[0]];
  const text = toMarkdown(d) + '\n### 新小标题\n\n> 引一句\n> —— 谁\n\n1. 甲\n2. 乙\n\n```\nx\n\ny\n```\n';
  const back = fromMarkdown(text, d);
  assert.equal(back.blocks.length, 1);
  const ps = back.blocks[0].paras;
  assert.deepEqual(ps.map((p) => p.type ?? 'p'), ['p', 'h', 'quote', 'list', 'code']);
  assert.equal(ps[0].id, 't01p1');
  assert.equal(ps[2].cite, '谁');
  assert.equal(ps[3].ordered, true);
  assert.equal(ps[4].code, 'x\n\ny');
  assert.equal(new Set(ps.map((p) => p.id)).size, 5);
});

test('游记：把一段普通文字改成引用，还是原来那一段（沿用 id）；改成小标题也一样', () => {
  const d = rich();
  const t = toMarkdown(d).replace('落地是晚上。', '> 落地是晚上。').replace('### 港口', '港口');
  const back = fromMarkdown(t, d);
  const ps = back.blocks[0].paras;
  assert.equal(ps[0].id, 't01p1');
  assert.equal(ps[0].type, 'quote');
  assert.equal(ps[1].id, 't01p2');
  assert.equal(ps[1].type ?? 'p', 'p');
});
