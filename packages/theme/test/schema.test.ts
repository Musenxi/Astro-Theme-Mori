import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEntry } from '../src/content/validate.ts';

const meta = { title: 'T', date: '2025-01-01', category: 'a', excerpt: 'x' };
const post = { ...meta, blocks: [{ id: 'b1', type: 'p', text: 'hi' }] };
const travel = { ...meta, stops: [{ id: 's1', name: '甲', lnglat: [0, 0] }], blocks: [{ id: 't1', type: 'text', stop: 's1', paras: [{ id: 'p1', text: 'hi' }] }] };

test('文章：没写 kind 也行；写了 article 也行', () => {
  assert.equal(validateEntry('post', post).ok, true);
  assert.equal(validateEntry(undefined, { ...post, kind: 'article' }).ok, true);
});

test('游记：有 stops 就是游记（不写 kind），写了 travel 也行', () => {
  assert.equal(validateEntry('travel', travel).ok, true);
  assert.equal(validateEntry('travel', { ...travel, kind: 'travel' }).ok, true);
});

test('出错时路径指向具体字段（判别联合不吞掉信息）', () => {
  const r = validateEntry('travel', { ...travel, stops: [{ id: 's1', name: '甲', lnglat: [999, 0] }] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path.startsWith('stops.0')));
  const r2 = validateEntry('post', { ...post, blocks: [{ id: 'b1', type: 'p' }] });
  assert.ok(r2.errors.some((e) => e.path.startsWith('blocks.0')));
});

test('游记的块必须引用存在的站点；块 id 不能重复', () => {
  const bad = validateEntry('travel', { ...travel, blocks: [{ ...travel.blocks[0], stop: 'nope' }] });
  assert.ok(bad.errors.some((e) => /不存在的站点/.test(e.message)));
  const dup = validateEntry('post', { ...post, blocks: [post.blocks[0], post.blocks[0]] });
  assert.ok(dup.errors.some((e) => /重复/.test(e.message)));
});

test('页面：只要标题，其余有默认值；template 只能是 default / friends', () => {
  assert.equal(validateEntry('page', { title: '关于' }).ok, true);
  assert.equal(validateEntry('page', { title: '友人帐', template: 'friends', comments: true, blocks: [{ id: 'b1', type: 'p', text: 'x' }] }).ok, true);
  assert.equal(validateEntry('page', { title: '?', template: 'weird' }).ok, false);
  assert.equal(validateEntry('page', { subtitle: 'no title' }).ok, false);
});

test('游记的文字块里可以有小标题、引用、列表、代码；老写法（不带 type 的段落）照旧有效', () => {
  const paras = [
    { id: 'p1', text: 'hi' },
    { id: 'p2', type: 'h', text: '小标题' },
    { id: 'p3', type: 'quote', text: '引文', cite: '某人' },
    { id: 'p4', type: 'list', items: ['一', '二'] },
    { id: 'p5', type: 'code', lang: 'ts', code: 'a()' },
  ];
  const r = validateEntry('travel', { ...travel, blocks: [{ ...travel.blocks[0], paras }] });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const bad = validateEntry('travel', { ...travel, blocks: [{ ...travel.blocks[0], paras: [{ id: 'p1', type: 'list', text: 'x' }] }] });
  assert.equal(bad.ok, false);
});
