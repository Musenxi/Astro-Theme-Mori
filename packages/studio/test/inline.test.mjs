import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spansToText, textToSpans, compact } from '../ui/inline.js';

const roundTrip = (spans) => textToSpans(spansToText(spans));

test('手工用例：无损往返', () => {
  const cases = [
    [{ t: 'a*b' }, { t: 'c', marks: [{ type: 'em' }] }],
    [{ t: '含 [ ] { } | \\ ` 的普通文字' }],
    [{ t: '外', marks: [{ type: 'strong' }, { type: 'note', ref: 'n1' }] }, { t: '，后' }],
    [{ t: '', marks: [{ type: 'fn', ref: 'f1' }] }],
    [{ t: '链接', marks: [{ type: 'link', href: 'https://x.com/a(b)' }] }],
    [{ t: 'code * `', marks: [{ type: 'code' }] }],
    [{ t: '2025', marks: [{ type: 'tcy' }] }],
  ];
  for (const c of cases) assert.deepEqual(roundTrip(c), c);
});

test('解析', () => {
  assert.deepEqual(textToSpans('a **b** c'), [{ t: 'a ' }, { t: 'b', marks: [{ type: 'strong' }] }, { t: ' c' }]);
  assert.deepEqual(textToSpans('{十天|note:n1}'), [{ t: '十天', marks: [{ type: 'note', ref: 'n1' }] }]);
  assert.deepEqual(textToSpans('未闭合 ** 不解析'), [{ t: '未闭合 ** 不解析' }]);
  assert.equal(compact(textToSpans('纯文字')), '纯文字');
});

test('示例站里所有真实的行内文字都能无损往返', () => {
  const dir = fileURLToPath(new URL('../../../examples/demo/src/content/', import.meta.url));
  if (!existsSync(dir)) return;
  let n = 0;
  const walk = (v) => {
    if (Array.isArray(v)) {
      if (v.length && v.every((x) => x && typeof x.t === 'string')) { assert.deepEqual(roundTrip(v), v); n++; }
      else v.forEach(walk);
    } else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  for (const kind of ['posts', 'travels']) for (const f of readdirSync(dir + kind)) walk(JSON.parse(readFileSync(dir + kind + '/' + f, 'utf8')));
  assert.ok(n > 0);
});
