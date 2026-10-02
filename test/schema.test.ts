import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEntry } from '../src/schema/validate.ts';

const meta = { title: 'T', date: '2025-01-01', category: 'a', excerpt: 'x' };
const post = { ...meta, blocks: [{ id: 'b1', type: 'p', text: 'hi' }] };
const legacy = { ...meta, stops: [{ id: 's1', name: '甲', lnglat: [0, 0] }], blocks: [{ id: 't1', type: 'text', stop: 's1', paras: [{ id: 'p1', text: 'hi' }] }] };
const place = { type: 'place', lnglat: [135.76, 35.01], en: 'Kyoto', date: '09.20' };

test('文章：没写 kind 也行；写了 article 也行', () => {
  assert.equal(validateEntry('post', post).ok, true);
  assert.equal(validateEntry(undefined, { ...post, kind: 'article' }).ok, true);
});

test('老游记：有 stops 就是游记（不写 kind），写了 travel 也行；读取时转成现在的结构', () => {
  assert.equal(validateEntry('travel', legacy).ok, true);
  assert.equal(validateEntry('travel', { ...legacy, kind: 'travel' }).ok, true);
  const bad = validateEntry('travel', { ...legacy, stops: [{ id: 's1', name: '甲', lnglat: [999, 0] }] });
  assert.equal(bad.ok, false); // 站点的经纬度越界：错误指向转换后站名上的地点标记
  assert.ok(bad.errors.some((e) => e.path.startsWith('blocks.0.text.0.marks.0.lnglat')));
});

test('读法、地图、地点：每篇文章都能开；读法至少允许一种', () => {
  const r = validateEntry('post', { ...post, map: true, reading: { default: 'h', allowed: ['v', 'h'], direction: 'rtl' }, facts: [{ label: '路线', value: '环岛' }] });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(validateEntry('post', { ...post, reading: { allowed: [] } }).ok, false);
  const withPlace = { ...post, blocks: [{ id: 'b1', type: 'p', text: [{ t: '京都', marks: [place] }] }] };
  assert.equal(validateEntry('post', withPlace).ok, true);
  const bad = validateEntry('post', { ...post, blocks: [{ id: 'b1', type: 'p', text: [{ t: '京都', marks: [{ ...place, lnglat: [200, 35] }] }] }] });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.path.startsWith('blocks.0.text.0.marks.0')));
});

test('长卷的块：图组、自由排布、地图、竖排和位置都能出现在任何文章里', () => {
  const img = { src: 'a.jpg', alt: '' };
  const blocks = [
    { id: 'b1', type: 'p', text: 'hi', writing: 'v', y: 0.3, scale: 1.2 },
    { id: 'b2', type: 'pair', images: [img, img] },
    { id: 'b3', type: 'strip', images: [img, img] },
    { id: 'b4', type: 'grid', images: [img, img, img] },
    { id: 'b5', type: 'free', ar: 1.5, items: [{ kind: 'image', ...img, x: 0, y: 0, w: 0.4 }, { kind: 'text', text: '字', x: 0.8, y: 0.1 }] },
    { id: 'b6', type: 'map', scope: 'near' },
  ];
  const r = validateEntry('post', { ...post, blocks });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(validateEntry('post', { ...post, blocks: [{ id: 'b2', type: 'pair', images: [img] }] }).ok, false);
});

test('出错时路径指向具体字段（判别联合不吞掉信息）', () => {
  const r2 = validateEntry('post', { ...post, blocks: [{ id: 'b1', type: 'p' }] });
  assert.ok(r2.errors.some((e) => e.path.startsWith('blocks.0')));
});

test('块 id 不能重复；旁注必须有定义', () => {
  const dup = validateEntry('post', { ...post, blocks: [post.blocks[0], post.blocks[0]] });
  assert.ok(dup.errors.some((e) => /重复/.test(e.message)));
  const note = validateEntry('post', { ...post, blocks: [{ id: 'b1', type: 'p', text: [{ t: 'x', marks: [{ type: 'note', ref: 'n1' }] }] }] });
  assert.ok(note.errors.some((e) => /notes 里没有定义/.test(e.message)));
});

test('页面：只要标题，其余有默认值；template 只能是 default / friends', () => {
  assert.equal(validateEntry('page', { title: '关于' }).ok, true);
  assert.equal(validateEntry('page', { title: '友人帐', template: 'friends', comments: true, blocks: [{ id: 'b1', type: 'p', text: 'x' }] }).ok, true);
  assert.equal(validateEntry('page', { title: '?', template: 'weird' }).ok, false);
  assert.equal(validateEntry('page', { subtitle: 'no title' }).ok, false);
});

test('地图的三处显示可以分别关掉', () => {
  const r = validateEntry('post', { ...post, map: true, mapView: { itinerary: false } });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(validateEntry('post', { ...post, map: true, mapView: { hero: 'no' } }).ok, false);
});

test('单篇文章的评论开关只接受 on / readonly / off', () => {
  for (const v of ['on', 'readonly', 'off']) assert.equal(validateEntry('post', { ...post, comments: v }).ok, true);
  assert.equal(validateEntry('post', { ...post, comments: 'closed' }).ok, false);
});
