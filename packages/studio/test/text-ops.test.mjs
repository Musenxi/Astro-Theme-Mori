import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as t from '../app/src/lib/text-ops.js';

const doc = () => ({
  blocks: [
    { id: 'h1', type: 'h', level: 2, text: '杭州' },
    { id: 'b01', type: 'p', text: [{ t: '一二' }, { t: '三四', marks: [{ type: 'strong' }] }], h: { writing: 'v', y: 0.3 } },
    { id: 'b02', type: 'list', items: ['甲', '乙'] },
    { id: 'i1', type: 'image', src: 'a.jpg' },
    { id: 'b03', type: 'p', text: '' },
  ],
});
const ids = (d) => d.blocks.map((b) => b.id).join(' ');

test('spans：切开、加粗切换、相邻同标注合并；原子归左边', () => {
  const s = [{ t: 'ab' }, { t: '', marks: [{ type: 'note', ref: 'n1' }] }, { t: 'cd' }];
  assert.deepEqual(t.splitSpans(s, 2), [[{ t: 'ab' }, s[1]], [{ t: 'cd' }]]);
  const b = t.toggleMark([{ t: 'abcd' }], 1, 3, 'strong');
  assert.deepEqual(b, [{ t: 'a' }, { t: 'bc', marks: [{ type: 'strong' }] }, { t: 'd' }]);
  assert.deepEqual(t.toggleMark(b, 1, 3, 'strong'), [{ t: 'abcd' }]);
  assert.equal(t.hasMark(b, 1, 3, 'strong'), true);
  assert.equal(t.hasMark(b, 0, 3, 'strong'), false);
});

test('单元：段落、标题、每个列表项；改字存回去（没标注的存成字符串）', () => {
  assert.deepEqual(t.unitsOf(doc().blocks).map((u) => u.unit), ['h1', 'b01', 'b02/0', 'b02/1', 'b03']);
  let d = t.setUnit(doc(), 'b01', [{ t: '全新' }]);
  assert.equal(d.blocks[1].text, '全新');
  d = t.setUnit(d, 'b02/1', [{ t: '丙', marks: [{ type: 'em' }] }]);
  assert.deepEqual(d.blocks[2].items, ['甲', [{ t: '丙', marks: [{ type: 'em' }] }]]);
});

test('回车：拆成两段，新段带着原来这列的横竖设置；标题后半段变正文；开头回车在前面插空段', () => {
  let r = t.splitUnit(doc(), 'b01', 3);
  assert.equal(ids(r.doc), 'h1 b01 b04 b02 i1 b03');
  assert.deepEqual(r.doc.blocks[1].text, [{ t: '一二' }, { t: '三', marks: [{ type: 'strong' }] }]);
  assert.deepEqual(r.doc.blocks[2], { id: 'b04', type: 'p', text: [{ t: '四', marks: [{ type: 'strong' }] }], h: { writing: 'v', y: 0.3 } });
  assert.deepEqual(r.caret, { unit: 'b04', off: 0 });
  r = t.splitUnit(doc(), 'h1', 1);
  assert.deepEqual([r.doc.blocks[0].text, r.doc.blocks[1].type, r.doc.blocks[1].text, r.doc.blocks[1].h], ['杭', 'p', '州', { writing: 'v', y: 0.3 }]);
  r = t.splitUnit(doc(), 'b01', 0);
  assert.equal(ids(r.doc), 'h1 b04 b01 b02 i1 b03');
  assert.deepEqual(r.caret, { unit: 'b01', off: 0 });
  // 列表：拆一项；空的一项回车结束列表
  r = t.splitUnit(doc(), 'b02/0', 1);
  assert.deepEqual(r.doc.blocks[2].items, ['甲', '', '乙']);
  r = t.splitUnit(r.doc, 'b02/1', 0);
  assert.deepEqual(r.doc.blocks.slice(2, 5).map((b) => [b.type, b.items ?? b.text]), [['list', ['甲']], ['p', ''], ['list', ['乙']]]);
});

test('退格：并进前一段（并进标题就是标题）；前面是图片时空段去掉、有字不动', () => {
  let r = t.mergeBack(doc(), 'b01');
  assert.equal(ids(r.doc), 'h1 b02 i1 b03');
  assert.deepEqual(r.doc.blocks[0].text, [{ t: '杭州一二' }, { t: '三四', marks: [{ type: 'strong' }] }]);
  assert.deepEqual(r.caret, { unit: 'h1', off: 2 });
  r = t.mergeBack(doc(), 'b02/1');
  assert.deepEqual([r.doc.blocks[2].items, r.caret], [['甲乙'], { unit: 'b02/0', off: 1 }]);
  r = t.mergeBack(doc(), 'b03');
  assert.equal(ids(r.doc), 'h1 b01 b02 i1');
  assert.equal(t.mergeBack(t.setUnit(doc(), 'b03', '字'), 'b03'), null);
  assert.equal(t.mergeBack(doc(), 'h1'), null);
  r = t.mergeForward(doc(), 'h1');
  assert.deepEqual([ids(r.doc), r.caret], ['h1 b02 i1 b03', { unit: 'h1', off: 2 }]);
});

test('跨段删除、粘贴多行、换段落样式', () => {
  let r = t.deleteRange(doc(), { unit: 'b02/1', off: 0 }, { unit: 'h1', off: 1 });
  assert.equal(ids(r.doc), 'h1 i1 b03');
  assert.deepEqual([r.doc.blocks[0].text, r.caret], ['杭乙', { unit: 'h1', off: 1 }]);
  r = t.insertText(doc(), { unit: 'b03', off: 0 }, '第一行\n第二行');
  assert.deepEqual(r.doc.blocks.slice(4).map((b) => b.text), ['第一行', '第二行']);
  assert.deepEqual(r.caret, { unit: r.doc.blocks[5].id, off: 3 });
  let d = t.setStyle(doc(), 'b01', 'h2');
  assert.deepEqual([d.blocks[1].type, d.blocks[1].level, d.blocks[1].h], ['h', 2, { writing: 'v', y: 0.3 }]);
  d = t.setStyle(d, 'b01', 'quote');
  assert.deepEqual([d.blocks[1].type, d.blocks[1].level], ['quote', undefined]);
});
