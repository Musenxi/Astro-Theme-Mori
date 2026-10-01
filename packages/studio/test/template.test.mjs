import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toTravel, toArticle } from '../app/src/lib/template.js';
import { validateEntry } from 'astro-mori/validate';

const article = () => ({
  kind: 'article', title: '一篇', date: '2025-01-01', category: 'essays', excerpt: 'x', tags: ['a'],
  notes: { n1: { text: [{ t: '注' }] } },
  blocks: [
    { id: 'b01', type: 'p', text: [{ t: '开头' }] },
    { id: 'b02', type: 'h', level: 2, text: [{ t: '维克' }] },
    { id: 'b03', type: 'p', text: [{ t: '黑沙滩' }, { t: '', marks: [{ type: 'note', ref: 'n1' }] }] },
    { id: 'b04', type: 'p', text: [{ t: '风大' }] },
    { id: 'b05', type: 'image', src: '../../assets/a.jpg', alt: '', caption: '海', layout: 'inline' },
    { id: 'b06', type: 'quote', writing: 'v', text: [{ t: '竖排一句' }] },
    { id: 'b07', type: 'list', items: [[{ t: '一' }], [{ t: '二' }]] },
  ],
});

test('普通文章 → 游记：## 是站点，段落沿用 id 进文字块，图片是单图，竖排引文是竖排文字块', () => {
  const t = toTravel(article());
  assert.equal(t.kind, 'travel');
  assert.deepEqual(t.stops.map((s) => s.name), ['起点', '维克']);
  assert.deepEqual(t.blocks.map((b) => b.type), ['text', 'text', 'single', 'text', 'text']);
  assert.deepEqual(t.blocks[1].paras.map((p) => p.id), ['b03', 'b04']);
  assert.equal(t.blocks[2].layout, 'inset');
  assert.equal(t.blocks[3].writing, 'v');
  // 列表是文字块里的一段（不再拆成一项一段）：换过去不丢结构
  assert.equal(t.blocks[4].paras.length, 1);
  assert.equal(t.blocks[4].paras[0].type, 'list');
  assert.equal(t.blocks[4].paras[0].items.length, 2);
  assert.deepEqual(t.tags, ['a']);
  assert.ok(validateEntry('travel', t).errors.every((e) => !/重复|id/.test(e.message)), JSON.stringify(validateEntry('travel', t).errors));
});

test('游记 → 普通文章：站点变成 ## 标题，文字段沿用 id，地图丢掉；游记的设置留在文件里，换回来能找回经纬度', () => {
  const t = toTravel(article());
  t.stops[1] = { ...t.stops[1], en: 'Vík', lnglat: [-19, 63.4] };
  t.blocks.push({ id: 'm01', type: 'map', stop: t.stops[1].id, scope: 'route' });
  const a = toArticle(t);
  assert.equal(a.kind, 'article');
  assert.ok(a.blocks.some((b) => b.type === 'h' && b.text[0].t === '维克'));
  assert.ok(a.blocks.some((b) => b.id === 'b03' && b.type === 'p'));
  assert.ok(!a.blocks.some((b) => b.type === 'map'));
  assert.ok(a.stops);
  assert.equal(validateEntry('post', a).ok, true, JSON.stringify(validateEntry('post', a).errors));
  const back = toTravel(a);
  assert.deepEqual(back.stops.find((s) => s.name === '维克').lnglat, [-19, 63.4]);
});

test('空的普通文章也能换成游记，并且能通过校验', () => {
  const t = toTravel({ kind: 'article', title: 'x', date: '2025-01-01', category: 'c', excerpt: '', blocks: [{ id: 'b01', type: 'p', text: '' }] });
  assert.equal(t.stops.length, 1);
  assert.equal(validateEntry('travel', t).ok, true, JSON.stringify(validateEntry('travel', t).errors));
});

test('来回换一次：开头不会多出一个“起点”小标题，段落 id 不变', () => {
  const a = article();
  const back = toArticle(toTravel(a));
  assert.equal(back.blocks[0].id, 'b01');
  assert.equal(back.blocks[0].type, 'p');
  for (const id of ['b01', 'b03', 'b04']) assert.ok(back.blocks.some((b) => b.id === id && b.type === 'p'), id);
});

test('文章里的小标题、引用（含出处）、列表、代码换成游记再换回来，结构、id、内容都不丢', () => {
  const a = {
    kind: 'article', title: 'x', date: '2025-01-01', category: 'c', excerpt: '', notes: {},
    blocks: [
      { id: 'b01', type: 'p', text: [{ t: '前言' }] },
      { id: 'b02', type: 'h', level: 3, text: [{ t: '小标题' }] },
      { id: 'b03', type: 'quote', writing: 'h', text: [{ t: '一句话' }], cite: '某人' },
      { id: 'b04', type: 'list', ordered: true, items: [[{ t: '一' }], [{ t: '二' }]] },
      { id: 'b05', type: 'code', lang: 'ts', code: 'const a = 1;\n\nconst b = 2;' },
    ],
  };
  const t = toTravel(a);
  assert.deepEqual(t.blocks[0].paras.map((p) => p.type ?? 'p'), ['p', 'h', 'quote', 'list', 'code']);
  assert.equal(validateEntry('travel', t).ok, true, JSON.stringify(validateEntry('travel', t).errors));
  const back = toArticle(t);
  const pick = (blocks) => blocks.map(({ id, type, level, text, cite, ordered, items, lang, code }) => ({ id, type, level, text, cite, ordered, items, lang, code }));
  assert.deepEqual(pick(back.blocks), pick(a.blocks));
});
