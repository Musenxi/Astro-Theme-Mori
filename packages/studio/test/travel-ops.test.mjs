import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ops from '../app/src/lib/travel-ops.js';

const doc = () => ({
  stops: [{ id: 'a', name: 'A', lnglat: [0, 0] }, { id: 'b', name: 'B', lnglat: [1, 1] }],
  blocks: [
    { id: 't01', type: 'text', stop: 'a', paras: [{ id: 't01p1', text: 'x' }] },
    { id: 's01', type: 'single', stop: 'a', src: '1.jpg', alt: '', y: 0.2, layout: 'full' },
    { id: 's02', type: 'single', stop: 'a', src: '2.jpg', alt: '', caption: '二' },
    { id: 'm01', type: 'map', stop: 'b', scope: 'route' },
  ],
});
const order = (d) => d.blocks.map((b) => `${b.id}@${b.stop}`).join(' ');

test('挪动：跨过站点分界就换站；左右挪一格', () => {
  assert.equal(order(ops.moveBlock(doc(), 't01', 4)), 's01@a s02@a t01@b m01@b');
  assert.equal(order(ops.nudgeBlock(doc(), 's02', 1)), 't01@a s01@a s02@b m01@b');
  assert.equal(order(ops.nudgeBlock(doc(), 'm01', -1)), 't01@a s01@a s02@a m01@a');
  assert.equal(order(ops.nudgeBlock(doc(), 't01', -1)), order(doc()));
});

test('合并相邻两张单图成双图，保留第一块的 id 和位置；再拆开还原成两张单图', () => {
  const m = ops.mergeWithNext(doc(), 's01');
  const p = m.blocks.find((b) => b.id === 's01');
  assert.equal(p.type, 'pair');
  assert.equal(p.y, 0.2);
  assert.deepEqual(p.images.map((i) => i.src), ['1.jpg', '2.jpg']);
  assert.ok(!m.blocks.some((b) => b.id === 's02'));
  const s = ops.split(m, 's01');
  assert.deepEqual(s.blocks.filter((b) => b.type === 'single').map((b) => b.src), ['1.jpg', '2.jpg']);
  assert.equal(new Set(s.blocks.map((b) => b.id)).size, s.blocks.length);
});

test('换版式：双图 → 图组 → 自由排布 → 网格，图不丢', () => {
  let d = ops.mergeWithNext(doc(), 's01');
  for (const t of ['strip', 'free', 'grid']) {
    d = ops.setLayout(d, 's01', t);
    assert.equal(d.blocks.find((b) => b.id === 's01').type, t);
    assert.deepEqual(ops.imagesOf(d.blocks.find((b) => b.id === 's01')).map((i) => i.src), ['1.jpg', '2.jpg']);
  }
  assert.equal(ops.setLayout(doc(), 's01', 'grid').blocks[1].type, 'single'); // 一张图换不了
});

test('站点：加、删（块并到前一站）、整组挪动', () => {
  const { doc: d, id } = ops.addStop(doc());
  assert.equal(d.stops.at(-1).id, id);
  const r = ops.removeStop(doc(), 'b');
  assert.equal(order(r), 't01@a s01@a s02@a m01@a');
  assert.equal(order(ops.moveStop(doc(), 'b', -1)), 'm01@b t01@a s01@a s02@a');
});

test('插入：放在选中块后面，或者某站最后', () => {
  const a = ops.insertAfter(doc(), 't01', 'a', { type: 'map', scope: 'stop' });
  assert.equal(a.doc.blocks[1].id, a.id);
  const b = ops.insertAfter(doc(), null, 'a', { type: 'single', src: 'n.jpg', alt: '', layout: 'full' });
  assert.equal(order(b.doc).split(' ')[3], `${b.id}@a`);
});
