import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockTexts, brokenAnnotations } from '../src/server.mjs';

const post = {
  blocks: [
    { id: 'b01', type: 'p', text: [{ t: '正文和标题都用' }, { t: '上图东观体', marks: [{ type: 'strong' }] }, { t: '，字形来自宋刻本。' }] },
    { id: 'b02', type: 'image', src: 'x' },
    { id: 'b03', type: 'p', text: '第一行\n第二行' },
  ],
};

test('块文字：只取能划词的块；换行符不算字符（和页面 DOM 一致）', () => {
  const t = blockTexts('post', post);
  assert.equal(t.get('b01'), '正文和标题都用上图东观体，字形来自宋刻本。');
  assert.equal(t.has('b02'), false);
  assert.equal(t.get('b03'), '第一行第二行');
});

test('老游记：转换后文字块里每个段落各算一个块，站名成了二级标题', () => {
  const t = blockTexts('travel', { stops: [{ id: 's1', name: '甲站', lnglat: [0, 0] }], blocks: [{ id: 't01', type: 'text', stop: 's1', paras: [{ id: 't01p1', text: '甲' }, { id: 't01p2', text: '乙' }] }, { id: 's01', type: 'single', stop: 's1' }] });
  assert.deepEqual([...t], [['h-s1', '甲站'], ['t01p1', '甲'], ['t01p2', '乙']]);
});

test('提醒：块被删了、原文被改了会报；位置偏了但原文还在不报', () => {
  const c = (id, block, quote, start = 0) => ({ id, block, quote, start, end: start + quote.length, prefix: '', suffix: '' });
  const comments = [
    c(1, 'b01', '上图东观体', 7),      // 没动
    c(2, 'b01', '字形来自宋刻本', 3),   // 位置偏了，原文还在
    c(3, 'b01', '已被删掉的话', 0),     // 原文没了
    c(4, 'b99', '整块没了', 0),         // 块没了
    { id: 5, block: null, quote: null }, // 文末评论：不管
  ];
  assert.deepEqual(brokenAnnotations('post', post, comments).map((x) => x.id), [3, 4]);
});
