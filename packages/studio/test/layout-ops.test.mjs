import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ops from '../app/src/lib/layout-ops.js';
import * as places from '../app/src/lib/places.js';

const doc = () => ({
  blocks: [
    { id: 'h1', type: 'h', level: 2, text: 'A 章' },
    { id: 'b01', type: 'p', text: 'x' },
    { id: 'b02', type: 'p', text: 'y' },
    { id: 's01', type: 'image', src: '1.jpg', alt: '', y: 0.2, layout: 'wide' },
    { id: 's02', type: 'image', src: '2.jpg', alt: '', caption: '二' },
    { id: 'h2', type: 'h', level: 2, text: 'B 章' },
    { id: 'm01', type: 'map', scope: 'route' },
  ],
});
const order = (d) => d.blocks.map((b) => b.id).join(' ');

test('项：相邻文字一列，二级标题另起，图片各自一项', () => {
  assert.deepEqual(ops.itemsOf(doc()).map((x) => `${x.key}:${x.type}`), ['h1:text', 's01:image', 's02:image', 'h2:text', 'm01:map']);
  assert.deepEqual(ops.itemsOf(doc())[0].blocks.map((b) => b.id), ['h1', 'b01', 'b02']);
});

test('挪动：文字一列整体挪；左右挪一格', () => {
  assert.equal(order(ops.moveItem(doc(), 'h1', 2)), 's01 s02 h1 b01 b02 h2 m01');
  assert.equal(order(ops.nudgeItem(doc(), 's02', 1)), 'h1 b01 b02 s01 h2 s02 m01');
  assert.equal(order(ops.nudgeItem(doc(), 'm01', -1)), 'h1 b01 b02 s01 s02 m01 h2');
  assert.equal(order(ops.nudgeItem(doc(), 'h1', -1)), order(doc()));
});

test('位置、缩放、竖排：写在一列文字的每个块上；竖排只写在能竖排的块上，复位就去掉', () => {
  let d = ops.setPlace(doc(), 'h1', { y: 0.3, scale: 1.1, writing: 'v' });
  assert.deepEqual(d.blocks.slice(0, 3).map((b) => [b.y, b.scale, b.writing]), [[0.3, 1.1, 'v'], [0.3, 1.1, 'v'], [0.3, 1.1, 'v']]);
  assert.equal(d.blocks[3].y, 0.2); // 别的块不受影响
  d = ops.setPlace(d, 'h1', { y: undefined, scale: undefined, writing: 'h' });
  assert.deepEqual(d.blocks.slice(0, 3).map((b) => Object.keys(b).sort().join()), ['id,level,text,type', 'id,text,type', 'id,text,type']);
  d = ops.setPlace(doc(), 's01', { y: 0.9 });
  assert.equal(d.blocks[3].y, 0.9);
});

test('合并相邻两张单图成双图，保留第一块的 id 和位置；再拆开还原成两张单图', () => {
  const m = ops.mergeWithNext(doc(), 's01');
  const p = m.blocks.find((b) => b.id === 's01');
  assert.equal(p.type, 'pair');
  assert.equal(p.y, 0.2);
  assert.deepEqual(p.images.map((i) => i.src), ['1.jpg', '2.jpg']);
  assert.ok(!m.blocks.some((b) => b.id === 's02'));
  const s = ops.split(m, 's01');
  assert.deepEqual(s.blocks.filter((b) => b.type === 'image').map((b) => b.src), ['1.jpg', '2.jpg']);
  assert.equal(new Set(s.blocks.map((b) => b.id)).size, s.blocks.length);
  assert.equal(ops.canMergeNext(doc(), 's02'), false); // 后面是文字
});

test('换版式：双图 → 图组 → 自由排布 → 网格，图不丢；一张图换不了', () => {
  let d = ops.mergeWithNext(doc(), 's01');
  for (const t of ['strip', 'free', 'grid']) {
    d = ops.setLayout(d, 's01', t);
    assert.equal(d.blocks.find((b) => b.id === 's01').type, t);
    assert.deepEqual(ops.imagesOf(d.blocks.find((b) => b.id === 's01')).map((i) => i.src), ['1.jpg', '2.jpg']);
  }
  assert.equal(ops.setLayout(doc(), 's01', 'grid').blocks[3].type, 'image');
});

test('插入：放在选中项后面（一列文字是最后一个块之后），没选中放最后；删一列就是删它所有的块', () => {
  const a = ops.insertAfter(doc(), 'h1', { type: 'map', scope: 'near' });
  assert.equal(a.doc.blocks[3].id, a.id);
  const b = ops.insertAfter(doc(), null, { type: 'image', src: 'n.jpg', alt: '', layout: 'wide' });
  assert.equal(b.doc.blocks.at(-1).id, b.id);
  assert.equal(order(ops.removeItem(doc(), 'h1')), 's01 s02 h2 m01');
});

/* ───────────── 地点 ───────────── */

const place = (lng, lat, extra = {}) => ({ type: 'place', lnglat: [lng, lat], ...extra });
const withPins = () => ({
  blocks: [
    { id: 'b1', type: 'p', text: [{ t: '到了' }, { t: '京都', marks: [place(135.7, 35, { en: 'Kyoto' })] }, { t: '，再去' }, { t: '大阪', marks: [place(135.5, 34.7), { type: 'strong' }] }] },
    { id: 'b2', type: 'list', items: [[{ t: '奈良', marks: [place(135.8, 34.6, { date: '09.22' })] }]] },
  ],
});

test('改第 n 个地点：坐标、英文名、日期；文字和别的标记不动；空的英文名去掉', () => {
  const d = places.editPlace(withPins(), 1, { lnglat: [135.6, 34.8], en: 'Osaka' });
  assert.deepEqual(d.blocks[0].text[3], { t: '大阪', marks: [place(135.6, 34.8, { en: 'Osaka' }), { type: 'strong' }] });
  assert.deepEqual(d.blocks[0].text[1], withPins().blocks[0].text[1]);
  const e = places.editPlace(withPins(), 0, { en: '' });
  assert.equal('en' in e.blocks[0].text[1].marks[0], false);
  assert.equal(places.editPlace(withPins(), 2, { date: '09.23' }).blocks[1].items[0][0].marks[0].date, '09.23');
});

test('去掉地点标记，文字留着；文末加一个地点', () => {
  const d = places.removePlace(withPins(), 0);
  assert.deepEqual(d.blocks[0].text[1], { t: '京都' });
  const a = places.appendPlace(withPins(), { name: '宇治', lnglat: [135.8, 34.9], date: '09.23' });
  assert.deepEqual(a.blocks.at(-1).text, [{ t: '宇治', marks: [place(135.8, 34.9, { date: '09.23' })] }]);
  assert.match(a.blocks.at(-1).id, /^b\d\d$/);
});

test('坐标输入：“纬度, 经度”（地图软件里复制的写法）', () => {
  assert.deepEqual(places.parseLatLng('35.0116, 135.7681'), [135.7681, 35.0116]);
  assert.deepEqual(places.parseLatLng('-33.9 151.2'), [151.2, -33.9]);
  assert.equal(places.parseLatLng('135.7, 35.0116'), null); // 纬度超出 ±90：多半是写反了
  assert.equal(places.parseLatLng('abc'), null);
  assert.equal(places.formatLatLng([135.7681, 35.0116]), '35.0116, 135.7681');
});

test('坐标输入：Plus Code（全码、带城市名的短码）和 Google 地图网址', () => {
  const near = (a, b) => assert.ok(Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4, `${a} ≠ ${b}`);
  near(places.parseCoordinate('8FVC9G8F+6W'), [8.5248125, 47.3655625]);
  near(places.parseCoordinate('8fvc9g8f+6w'), [8.5248125, 47.3655625]);
  near(places.parseCoordinate('9G8F+6W Zürich', [8.5, 47.4]), [8.5248125, 47.3655625]);
  assert.equal(places.parseCoordinate('9G8F+6W Zürich'), null); // 短码没有参考点补不全
  near(places.parseCoordinate('https://www.google.com/maps/place/x/@35.0116,135.7681,17z'), [135.7681, 35.0116]);
  near(places.parseCoordinate('https://www.google.com/maps/place/x/data=!3d35.0116!4d135.7681'), [135.7681, 35.0116]);
  assert.equal(places.parseCoordinate('hello+world'), null);
});
