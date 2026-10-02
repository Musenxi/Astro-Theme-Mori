import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columns, fromLegacyTravel, isLegacyTravel, parsePlaceHref, placeHref, placesOf, usesFlow } from '../src/lib/flow.mjs';

const place = (lnglat: [number, number], extra = {}) => ({ type: 'place', lnglat, ...extra });

test('地点地址：geo URI 往返，经纬度顺序是 纬度,经度；英文名里的特殊字符转义', () => {
  const m = place([-21.9426, 64.1466], { en: 'Reykjavík (capital)', date: '06.20' });
  const href = placeHref(m);
  assert.equal(href, 'geo:64.1466,-21.9426?en=Reykjavík%20%28capital%29&date=06.20');
  assert.deepEqual(parsePlaceHref(href), m);
  assert.deepEqual(parsePlaceHref('geo:35.0116,135.7681'), place([135.7681, 35.0116]));
  assert.equal(parsePlaceHref('https://example.com'), null);
  assert.equal(parsePlaceHref('geo:91,0'), null);
});

test('正文里的地点按出现顺序；被粗体拆开的同一个地点算一个', () => {
  const blocks = [
    { id: 'b1', type: 'p', text: [{ t: '到了' }, { t: '京', marks: [place([135.7, 35.0]), { type: 'strong' }] }, { t: '都', marks: [place([135.7, 35.0])] }, { t: '。' }] },
    { id: 'b2', type: 'image', src: 'a.jpg' },
    { id: 'b3', type: 'list', items: [[{ t: '大阪', marks: [place([135.5, 34.7], { date: '09.21' })] }], '没有地点'] },
  ];
  assert.deepEqual(placesOf(blocks), [
    { n: 0, block: 'b1', label: '京都', lnglat: [135.7, 35.0] },
    { n: 1, block: 'b3', label: '大阪', lnglat: [135.5, 34.7], date: '09.21' },
  ]);
});

test('长卷版式：开了地图、设了读法或用了长卷的块才走长卷', () => {
  const blocks = [{ id: 'b1', type: 'p', text: 'x' }];
  assert.equal(usesFlow({ blocks }), false);
  assert.equal(usesFlow({ blocks, map: true }), true);
  assert.equal(usesFlow({ blocks, reading: { default: 'v', allowed: ['v', 'h'], direction: 'ltr' } }), true);
  assert.equal(usesFlow({ blocks: [...blocks, { id: 'b2', type: 'map' }] }), true);
});

test('排成列：相邻文字一列，二级标题另起，图片单独，竖排和横排不混', () => {
  const blocks = [
    { id: 'a', type: 'p', text: '1', y: 0.2 }, { id: 'b', type: 'p', text: '2' }, { id: 'c', type: 'h', level: 3, text: '小' },
    { id: 'd', type: 'image', src: 'x' },
    { id: 'e', type: 'h', level: 2, text: '章' }, { id: 'f', type: 'p', text: '3', writing: 'v' }, { id: 'g', type: 'code', code: 'x' }, { id: 'h', type: 'p', text: '4' },
  ];
  const cols = columns(blocks);
  const show = (c: any) => (c.kind === 'text' ? `${c.blocks.map((b: any) => b.id).join('')}:${c.writing}` : c.block.id);
  assert.deepEqual(cols.map(show), ['abc:h', 'd', 'efg:v', 'h:h']);
  assert.equal(cols[0].kind === 'text' && cols[0].y, 0.2);
});

const legacy = {
  kind: 'travel', title: 'T', date: '2025-06-20', category: 'j', excerpt: 'x', facts: [{ label: '路线', value: '环岛' }], notes: {},
  stops: [
    { id: 'rey', name: '雷克雅未克', en: 'Reykjavík', lnglat: [-21.9, 64.1], date: '06.20' },
    { id: 's2', name: '起点', lnglat: [0, 0] },
  ],
  reading: { default: 'h', allowed: ['v', 'h'], direction: 'rtl' },
  blocks: [
    { id: 't1', type: 'text', stop: 'rey', writing: 'v', y: 0.3, paras: [{ id: 't1p1', text: '一' }, { id: 't1p2', type: 'quote', text: '引', cite: '谁' }, { id: 't1p3', type: 'code', code: 'x' }] },
    { id: 's1', type: 'single', stop: 'rey', src: 'a.jpg', alt: '', layout: 'inset' },
    { id: 'm1', type: 'map', stop: 'rey', scope: 'stop' },
    { id: 'p1', type: 'pair', stop: 's2', images: [{ src: 'a', alt: '' }, { src: 'b', alt: '' }] },
  ],
};

test('老游记：站点变成二级标题（站名上标着地点），块按站点顺序，沿用段落 id', () => {
  assert.equal(isLegacyTravel(legacy), true);
  const d = fromLegacyTravel(legacy);
  assert.equal(d.kind, undefined);
  assert.equal(d.stops, undefined);
  assert.equal(d.map, true);
  assert.deepEqual(d.reading, legacy.reading);
  assert.deepEqual(d.facts, legacy.facts);
  assert.deepEqual(d.blocks.map((b: any) => b.id), ['h-rey', 't1p1', 't1p2', 't1p3', 's1', 'm1', 'h-s2', 'p1']);
  assert.deepEqual(d.blocks[0], { id: 'h-rey', type: 'h', level: 2, text: [{ t: '雷克雅未克', marks: [place([-21.9, 64.1], { en: 'Reykjavík', date: '06.20' })] }] });
  // 竖排和位置抄到每个块上；代码没有竖排设置
  assert.deepEqual(d.blocks[1], { id: 't1p1', type: 'p', text: '一', writing: 'v', y: 0.3 });
  assert.deepEqual(d.blocks[2], { id: 't1p2', type: 'quote', text: '引', cite: '谁', writing: 'v', y: 0.3 });
  assert.deepEqual(d.blocks[3], { id: 't1p3', type: 'code', code: 'x', y: 0.3 });
  assert.deepEqual(d.blocks[4], { id: 's1', type: 'image', src: 'a.jpg', alt: '', layout: 'inline' });
  assert.deepEqual(d.blocks[5], { id: 'm1', type: 'map', scope: 'near' });
  // 没填经纬度的站只有标题；双图原样（去掉 stop）
  assert.deepEqual(d.blocks[6].text, [{ t: '起点' }]);
  assert.equal('stop' in d.blocks[7], false);
  assert.deepEqual(fromLegacyTravel(legacy), d); // 每次转换结果一样
  assert.equal(usesFlow(d), true);
});

test('老游记：没写读法就是三种都允许；不属于任何站点的块留在最后', () => {
  const { reading: _r, ...noReading } = legacy;
  const d = fromLegacyTravel({ ...noReading, blocks: [...legacy.blocks, { id: 'x1', type: 'single', stop: 'gone', src: 'z.jpg', alt: '' }] });
  assert.deepEqual(d.reading.allowed, ['v', 'h', 'mix']);
  assert.equal(d.blocks.at(-1).id, 'x1');
});

test('不写地名的地点：整列都是它时只当锚点，混在文字里的那一段不单独成列；名字缺省用英文名', async () => {
  const { isPlaceOnly, placeName } = await import('../src/lib/flow.mjs');
  const only = { id: 'a', type: 'p', text: [{ t: '', marks: [place([1, 2], { en: 'Spot' })] }] };
  assert.equal(isPlaceOnly(only), true);
  assert.equal(isPlaceOnly({ id: 'b', type: 'p', text: [{ t: '字', marks: [place([1, 2])] }] }), false);
  const cols = columns([only, { id: 'i', type: 'image', src: 'x' }, { id: 'c', type: 'p', text: '文字' }, only && { ...only, id: 'd' }]);
  assert.deepEqual(cols.map((c: any) => (c.kind === 'text' ? `${c.blocks.map((b: any) => b.id).join('')}${c.anchor ? '*' : ''}` : c.block.id)), ['a*', 'i', 'cd']);
  assert.equal(placeName(placesOf([only])[0]), 'Spot');
});

test('地图分区：相邻的地点一个区域，隔得远另起一区；作者可以强制另起或接上', async () => {
  const { regionsOf } = await import('../src/lib/flow.mjs');
  const P = (lng: number, lat: number, extra = {}) => ({ lnglat: [lng, lat], ...extra });
  const ps = [P(135.76, 35.01), P(135.5, 34.69), P(139.7, 35.68), P(139.65, 35.64), P(139.8, 35.71, { region: 'new' }), P(139.9, 35.7, { region: 'same' })].map((p, n) => ({ n, ...p }));
  const r = regionsOf(ps as any);
  assert.deepEqual(r.regions.map((x: any) => x.places), [[0, 1], [2, 3], [4, 5]]);
  assert.deepEqual(r.regionOf, [0, 0, 1, 1, 2, 2]);
  // same 能把隔得很远的接在一起；一个区域铺得太大也会自动分
  assert.equal(regionsOf([P(0, 0), P(60, 0, { region: 'same' })].map((p, n) => ({ n, ...p })) as any).regions.length, 1);
  assert.equal(regionsOf([P(0, 0), P(1, 0), P(2, 0), P(3, 0), P(4, 0)].map((p, n) => ({ n, ...p })) as any).regions.length > 1, true);
});

test('地点地址带分区标记', async () => {
  const { placeHref: pinHref, parsePlaceHref: parsePinHref } = await import('../src/lib/flow.mjs');
  const m = place([139.7, 35.68], { region: 'new' });
  assert.equal(pinHref(m), 'geo:35.68,139.7?region=new');
  assert.deepEqual(parsePinHref('geo:35.68,139.7?region=new'), m);
  assert.equal('region' in (parsePinHref('geo:35.68,139.7?region=bogus') as object), false);
});

test('跨区的路线：有轨迹就取轨迹里这一段，没有就画一段弧（不是直线）', async () => {
  const { trackBetween, arcBetween } = await import('../src/lib/flow.mjs');
  const track = [[0, 0], [1, 0.2], [2, 0.1], [3, 1], [4, 1.2]];
  assert.deepEqual(trackBetween(track, [0.9, 0.2], [3.1, 1]), [[0.9, 0.2], [2, 0.1], [3.1, 1]]);
  assert.equal(trackBetween(track, [3, 1], [0, 0]), null); // 先后对不上
  assert.equal(trackBetween(undefined, [0, 0], [1, 1]), null);
  assert.equal(trackBetween(track, [0, 0], [40, 30]), null); // 有一处不在轨迹上
  const arc = arcBetween([0, 0], [10, 0]);
  assert.deepEqual([arc[0], arc.at(-1)], [[0, 0], [10, 0]]);
  assert.ok(Math.max(...arc.map((p: number[]) => Math.abs(p[1]))) > 1); // 中间鼓出去
});

test('整趟路线：同一区里直接连，跨区画弧，有轨迹用轨迹；每个地点都在线上', async () => {
  const { tripOf } = await import('../src/lib/flow.mjs');
  const ps = [[0, 0], [0.5, 0], [10, 0], [12, 1]].map((lnglat) => ({ lnglat }));
  const t = tripOf(ps as any, [0, 0, 1, 1], undefined);
  assert.equal(t.at.length, 4);
  ps.forEach((p, i) => assert.deepEqual(t.line[t.at[i]], p.lnglat));
  assert.equal(t.at[1] - t.at[0], 1); // 同一区：一段直线
  assert.ok(t.at[2] - t.at[1] > 10); // 跨区：一段弧
  const withTrack = tripOf(ps as any, [0, 0, 1, 1], [[0, 0], [0.5, 0], [5, 3], [10, 0], [12, 1]]);
  assert.deepEqual(withTrack.line.slice(withTrack.at[1], withTrack.at[2] + 1), [[0.5, 0], [5, 3], [10, 0]]);
});
