import { test } from 'node:test';
import assert from 'node:assert/strict';
import zhCN from '../src/i18n/zh-CN.ts';
import zhTW from '../src/i18n/zh-TW.ts';
import en from '../src/i18n/en.ts';
import ja from '../src/i18n/ja.ts';
import { makeT, makeFmt, clientDict, verticalOk, LANGS } from '../src/i18n/index.ts';

const dicts = { 'zh-TW': zhTW, en, ja } as Record<string, Record<string, string>>;
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('每种语言都覆盖了全部词条，没有多余的', () => {
  for (const [name, d] of Object.entries(dicts)) assert.deepEqual(Object.keys(d).sort(), Object.keys(zhCN).sort(), name);
});

test('每个词条的占位符和母版一致（翻译没有漏掉 {n} 之类）', () => {
  for (const [name, d] of Object.entries(dicts)) for (const k of Object.keys(zhCN)) assert.equal(holes(d[k]), holes((zhCN as any)[k]), `${name} · ${k}`);
});

test('数字、期号、季节：中日文用汉字数字，英文用阿拉伯数字', () => {
  const zh = makeFmt('zh-CN'), e = makeFmt('en'), j = makeFmt('ja');
  assert.equal(zh.issue(48), '第四十八期');
  assert.equal(e.issue(48), 'Issue 48');
  assert.equal(j.issue(48), '第四十八号');
  const d = new Date(2025, 8, 14);
  assert.equal(zh.yearSeason(d), '二〇二五年 · 秋');
  assert.equal(e.yearSeason(d), 'Autumn 2025');
  assert.equal(zh.stop(3), '第三站');
  assert.equal(e.stop(3), 'Stop 3');
});

test('单复数：英文分 one / other，中文不分', () => {
  assert.equal(makeT('en').tn('count', 1), '1 piece');
  assert.equal(makeT('en').tn('count', 3), '3 pieces');
  assert.equal(makeT('zh-CN').tn('count', 3, { n: '三' }), '三篇');
});

test('竖排只对中日文有意义；给浏览器的词条只含 js. 开头的', () => {
  assert.deepEqual(LANGS.filter((l) => !verticalOk(l)), ['en']);
  for (const l of LANGS) assert.ok(Object.keys(clientDict(l)).every((k) => k.startsWith('js.')) && Object.keys(clientDict(l)).length > 20);
});
