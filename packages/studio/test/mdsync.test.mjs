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

/* ───────────── 长卷：Markdown 里只有标题、文字、地点和图 ───────────── */
const place = (extra = {}) => ({ type: 'place', lnglat: [-21.9426, 64.1466], ...extra });
const trip = () => ({
  title: '环岛', date: '2025-06-30', category: 'journeys', excerpt: 'x', map: true,
  reading: { default: 'h', allowed: ['v', 'h'], direction: 'ltr' },
  notes: { n1: { text: [{ t: '旁注' }] } },
  blocks: [
    { id: 'h-rey', type: 'h', level: 2, text: [{ t: '雷克雅未克', marks: [place({ en: 'Reykjavík', date: '06.20' })] }] },
    { id: 'p01', type: 'p', y: 0.3, text: [{ t: '落地是晚上。' }] },
    { id: 'p02', type: 'p', y: 0.3, text: [{ t: '住在港口边。' }] },
    { id: 's01', type: 'image', y: 0.15, scale: 0.92, src: '../../assets/a.jpg', alt: '', caption: '海。', layout: 'inline' },
    { id: 'p03', type: 'p', writing: 'v', text: [{ t: '向南' }, { t: '', marks: [{ type: 'note', ref: 'n1' }] }] },
    { id: 'm01', type: 'map', scope: 'route' },
    { id: 'h-vik', type: 'h', level: 2, text: [{ t: '维克' }] },
    { id: 'pr01', type: 'pair', y: 0.1, images: [{ src: '../../assets/a.jpg', alt: '', caption: '黑沙滩。' }, { src: '../../assets/b.jpg', alt: '' }] },
    { id: 'st01', type: 'strip', images: [{ src: '../../assets/c.jpg', alt: '', scale: 1, offset: 0 }, { src: '../../assets/d.jpg', alt: '', scale: 0.8, offset: 0.12 }] },
    { id: 'f01', type: 'free', ar: 1.6, items: [{ kind: 'image', src: '../../assets/e.jpg', alt: '', x: 0.04, y: 0.06, w: 0.56, z: 1 }, { kind: 'text', text: [{ t: '一句' }], x: 0.9, y: 0.1 }] },
  ],
});
const find = (d, id) => d.blocks.find((b) => b.id === id);

test('长卷：文本里只有标题、文字、地点和图片，没有任何排版指令；地点是 geo 链接', () => {
  const t = toMarkdown(trip());
  assert.doesNotMatch(t, /:::|\{|\}/);
  assert.match(t, /^## \[雷克雅未克\]\(geo:64\.1466,-21\.9426\?en=Reykjavík&date=06\.20\)$/m);
  assert.match(t, /^!\[\]\(a\.jpg "海。"\)$/m);
  assert.match(t, /^向南\[\^n1\]$/m);
  assert.match(t, /^## 维克$/m);
});

test('长卷：不动就不变（地点、版式、竖排、内缩、图组、自由排布里的小段文字、地图、旁注、位置）', () => {
  const d = trip();
  const back = fromMarkdown(toMarkdown(d), d);
  assert.deepEqual(back.blocks, d.blocks);
  assert.deepEqual(back.notes, d.notes);
  assert.equal(back.title, '环岛');
  assert.equal(back.map, true);
  assert.deepEqual(back.reading, d.reading);
});

test('长卷：改几个字的段落沿用 id，横滚位置跟着走；块的顺序和 id 都不变', () => {
  const d = trip();
  const back = fromMarkdown(toMarkdown(d).replace('落地是晚上。', '落地是深夜。'), d);
  const p = find(back, 'p01');
  assert.equal(p.y, 0.3);
  assert.ok(JSON.stringify(p.text).includes('深夜'));
  assert.deepEqual(back.blocks.map((b) => b.id), d.blocks.map((b) => b.id));
});

test('长卷：新写的段落是新块（b 开头的新 id），插在写的位置；别的块 id 不变', () => {
  const d = trip();
  const back = fromMarkdown(toMarkdown(d).replace('住在港口边。', '住在港口边。\n\n第三段，刚写的，和别的都不像。'), d);
  const added = back.blocks.find((b) => JSON.stringify(b).includes('第三段'));
  assert.equal(added.type, 'p');
  assert.match(added.id, /^b\d\d$/);
  assert.deepEqual(back.blocks.map((b) => b.id).filter((id) => id !== added.id), d.blocks.map((b) => b.id));
  assert.equal(back.blocks.indexOf(added), 3);
  assert.equal(new Set(back.blocks.map((b) => b.id)).size, back.blocks.length);
});

test('长卷：新贴一行图片是新的单图块', () => {
  const d = trip();
  const back = fromMarkdown(toMarkdown(d).replace('## 维克', '![新图](n.jpg "新图注")\n\n## 维克'), d);
  const added = back.blocks.find((b) => b.src === '../../assets/n.jpg');
  assert.equal(added.type, 'image');
  assert.equal(added.caption, '新图注');
  assert.match(added.id, /^b\d\d$/);
});

test('长卷：改图注只改图注，位置、缩放、内缩跟着走', () => {
  const d = trip();
  const back = fromMarkdown(toMarkdown(d).replace('"海。"', '"夜里的海。"'), d);
  const s = find(back, 's01');
  assert.equal(s.caption, '夜里的海。');
  assert.equal(s.y, 0.15);
  assert.equal(s.layout, 'inline');
  assert.equal(s.scale, 0.92);
});

test('长卷：双图删掉一张退成单图，图组和自由排布保留剩下的；全删就没了，地图不受影响', () => {
  const d = trip();
  let back = fromMarkdown(toMarkdown(d).replace('![](b.jpg)\n\n', ''), d);
  assert.equal(find(back, 'pr01').type, 'image');
  assert.equal(find(back, 'pr01').src, '../../assets/a.jpg');
  assert.equal(find(back, 'pr01').y, 0.1);
  back = fromMarkdown(toMarkdown(d).replace('![](e.jpg)\n\n', '').replace('![](c.jpg)\n\n', '').replace('![](d.jpg)\n\n', ''), d);
  assert.equal(find(back, 'st01'), undefined);
  assert.deepEqual(find(back, 'f01').items, [d.blocks.at(-1).items[1]]); // 自由排布里只剩那段小文字
  assert.ok(find(back, 'm01'));
});

test('长卷：把标题上的地点链接删掉，标题还是原来那一块，地点没了', () => {
  const d = trip();
  const back = fromMarkdown(toMarkdown(d).replace(/\[雷克雅未克\]\(geo:[^)]*\)/, '雷克雅未克'), d);
  assert.equal(back.blocks[0].id, 'h-rey');
  assert.equal(JSON.stringify(back.blocks[0]).includes('place'), false);
});

test('长卷：在文字里加地点——选中一个词写成 [词](geo:纬度,经度)，其余标记原样', () => {
  const d = trip();
  const t = toMarkdown(d).replace('住在港口边。', '住在[港口](geo:64.15,-21.93?en=Harbour)边。');
  const back = fromMarkdown(t, d);
  const p = find(back, 'p02');
  assert.equal(p.id, 'p02');
  assert.equal(p.y, 0.3);
  assert.deepEqual(p.text.find((x) => x.marks?.some((m) => m.type === 'place')), { t: '港口', marks: [{ type: 'place', lnglat: [-21.93, 64.15], en: 'Harbour' }] });
});

test('长卷：地点链接里改了坐标，文字块沿用 id，标题上的地点也改', () => {
  const d = trip();
  const back = fromMarkdown(toMarkdown(d).replace('geo:64.1466,-21.9426', 'geo:64.2,-21.8'), d);
  assert.equal(back.blocks[0].id, 'h-rey');
  assert.deepEqual(back.blocks[0].text[0].marks[0].lnglat, [-21.8, 64.2]);
});

test('老游记：打开就是转换后的结构；站名成了带地点的二级标题，段落 id 沿用', () => {
  const legacy = {
    kind: 'travel', title: '环岛', date: '2025-01-01', category: 'journeys', excerpt: '', notes: {},
    stops: [{ id: 'rey', name: '雷克雅未克', en: 'Reykjavík', lnglat: [-21.9426, 64.1466], date: '06.20' }],
    blocks: [{ id: 't01', type: 'text', stop: 'rey', y: 0.3, paras: [{ id: 't01p1', text: [{ t: '落地是晚上。' }] }] }, { id: 's01', type: 'single', stop: 'rey', src: '../../assets/a.jpg', alt: '', layout: 'inset' }],
  };
  const md = toMarkdown(legacy);
  assert.match(md, /^## \[雷克雅未克\]\(geo:64\.1466,-21\.9426\?en=Reykjavík&date=06\.20\)$/m);
  const back = fromMarkdown(md.replace('落地是晚上。', '落地是深夜。'), legacy);
  assert.equal(back.stops, undefined);
  assert.equal(back.kind, undefined);
  assert.equal(back.map, true);
  assert.deepEqual(back.blocks.map((b) => b.id), ['h-rey', 't01p1', 's01']);
  assert.equal(find(back, 't01p1').y, 0.3);
  assert.equal(find(back, 's01').layout, 'inline');
});

/* ───────────── 长卷的文字也能有小标题、引用、列表、代码（和普通文章一样） ───────────── */

const rich = () => ({
  title: '环岛', date: '2025-01-01', category: 'journeys', excerpt: '', notes: {},
  blocks: [
    { id: 'b01', type: 'p', text: [{ t: '落地是晚上。' }] },
    { id: 'b02', type: 'h', level: 3, text: [{ t: '港口' }] },
    { id: 'b03', type: 'quote', text: [{ t: '一句话' }], cite: '某人' },
    { id: 'b04', type: 'list', ordered: false, items: [[{ t: '面包' }], [{ t: '咖啡' }]] },
    { id: 'b05', type: 'code', lang: 'ts', code: 'a();\n\nb();' },
  ],
});

test('小标题、引用、列表、代码写成和文章一样的 Markdown，不动就不变', () => {
  const d = rich();
  const t = toMarkdown(d);
  assert.match(t, /^### 港口$/m);
  assert.match(t, /^> 一句话\n> —— 某人$/m);
  assert.match(t, /^- 面包\n- 咖啡$/m);
  assert.match(t, /^```ts\na\(\);\n\nb\(\);\n```$/m);
  assert.deepEqual(fromMarkdown(t, d).blocks, d.blocks);
});

test('把一段普通文字改成引用，还是原来那一段（沿用 id，位置跟着走）；改成小标题也一样', () => {
  const d = rich();
  d.blocks[0].y = 0.4;
  const t = toMarkdown(d).replace('落地是晚上。', '> 落地是晚上。').replace('### 港口', '港口');
  const back = fromMarkdown(t, d);
  assert.equal(back.blocks[0].id, 'b01');
  assert.equal(back.blocks[0].type, 'quote');
  assert.equal(back.blocks[0].y, 0.4);
  assert.equal(back.blocks[1].id, 'b02');
  assert.equal(back.blocks[1].type, 'p');
});
