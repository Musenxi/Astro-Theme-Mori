import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseComment, commentText } from '../src/lib/comment-md.mjs';

const t = (text: string) => ({ type: 'text', text });

test('段落：单个换行是换行，空行分段', () => {
  assert.deepEqual(parseComment('第一行\n第二行\n\n第二段'), [
    { type: 'p', children: [t('第一行'), { type: 'br' }, t('第二行')] },
    { type: 'p', children: [t('第二段')] },
  ]);
});

test('行内：粗体、斜体、删除线、代码、嵌套', () => {
  assert.deepEqual(parseComment('**粗** *斜* _也斜_ ~~删~~ `a*b*c`')[0].children, [
    { type: 'b', children: [t('粗')] }, t(' '), { type: 'i', children: [t('斜')] }, t(' '), { type: 'i', children: [t('也斜')] }, t(' '),
    { type: 'del', children: [t('删')] }, t(' '), { type: 'code', text: 'a*b*c' },
  ]);
  assert.deepEqual(parseComment('**粗里*斜***')[0].children, [{ type: 'b', children: [t('粗里'), { type: 'i', children: [t('斜')] }] }]);
});

test('不该变成格式的：算式、snake_case、没收尾的、转义', () => {
  assert.deepEqual(parseComment('2 * 3 * 4')[0].children, [t('2 * 3 * 4')]);
  assert.deepEqual(parseComment('snake_case_name')[0].children, [t('snake_case_name')]);
  assert.deepEqual(parseComment('**没收尾')[0].children, [t('**没收尾')]);
  assert.deepEqual(parseComment('\\*不斜\\*')[0].children, [t('*不斜*')]);
});

test('链接只认 http / https；直接写出的网址也是链接，去掉末尾标点', () => {
  assert.deepEqual(parseComment('[站](https://a.com/x)')[0].children, [{ type: 'a', href: 'https://a.com/x', children: [t('站')] }]);
  assert.deepEqual(parseComment('[坏](javascript:alert(1))')[0].children, [t('[坏](javascript:alert(1))')]);
  assert.deepEqual(parseComment('看 https://a.com/p?q=1。')[0].children, [t('看 '), { type: 'a', href: 'https://a.com/p?q=1', children: [t('https://a.com/p?q=1')] }, t('。')]);
});

test('HTML 只是文字', () => {
  assert.deepEqual(parseComment('<img src=x onerror=alert(1)>'), [{ type: 'p', children: [t('<img src=x onerror=alert(1)>')] }]);
});

test('块：引用、列表、代码块', () => {
  assert.deepEqual(parseComment('> 引一句\n> **第二行**\n\n- 甲\n- 乙\n\n3. 丙\n4. 丁\n\n```\n<b>x</b>\n  y\n```'), [
    { type: 'quote', children: [{ type: 'p', children: [t('引一句'), { type: 'br' }, { type: 'b', children: [t('第二行')] }] }] },
    { type: 'ul', items: [[t('甲')], [t('乙')]] },
    { type: 'ol', start: 3, items: [[t('丙')], [t('丁')]] },
    { type: 'pre', text: '<b>x</b>\n  y' },
  ]);
});

test('纯文字：去掉标记', () => {
  assert.equal(commentText('**粗**和[链接](https://a.com)\n> 引用\n- 一\n- 二'), '粗和链接 引用 一 二');
});
