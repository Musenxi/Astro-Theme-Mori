import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { parseGpx, simplify, readExif, clusterStops } from '../src/geo.mjs';

test('GPX：轨迹点优先，其次路线点，再次航点；忽略坏点', () => {
  const trk = `<gpx><trk><trkseg><trkpt lat="64.15" lon="-21.94"><ele>1</ele></trkpt><trkpt lon='-19.01' lat='63.42'/><trkpt lat="999" lon="0"/></trkseg></trk><wpt lat="1" lon="1"/></gpx>`;
  assert.deepEqual(parseGpx(trk), [[-21.94, 64.15], [-19.01, 63.42]]);
  assert.deepEqual(parseGpx('<gpx><wpt lat="1" lon="2"/></gpx>'), [[2, 1]]);
  assert.deepEqual(parseGpx('not gpx'), []);
});

test('简化：直线中间的点被去掉，拐点保留；点数不超过上限', () => {
  const line = Array.from({ length: 50 }, (_, i) => [i * 0.001, 0]);
  assert.deepEqual(simplify(line), [[0, 0], [0.049, 0]]);
  const corner = [[0, 0], [1, 0], [1, 1]];
  assert.equal(simplify(corner).length, 3);
  const noisy = Array.from({ length: 5000 }, (_, i) => [i * 0.001, Math.sin(i / 20) * 0.5]);
  assert.ok(simplify(noisy, 0.00001, 300).length <= 300);
});

test('照片聚类：按位置和时间分站，站点位置取平均；没有 GPS 的不参与', () => {
  const t = (d, h) => Date.UTC(2025, 5, d, h);
  const photos = [
    { name: 'a1.jpg', lnglat: [-21.94, 64.15], time: t(20, 9) },
    { name: 'a2.jpg', lnglat: [-21.95, 64.14], time: t(20, 15) },
    { name: 'b1.jpg', lnglat: [-19.01, 63.42], time: t(22, 10) },   // 远了，也隔了两天
    { name: 'c1.jpg', lnglat: null, time: t(22, 11) },
    { name: 'b2.jpg', lnglat: [-19.02, 63.42], time: t(22, 12) },
  ];
  const s = clusterStops(photos);
  assert.equal(s.length, 2);
  assert.deepEqual(s.map((x) => x.count), [2, 2]);
  assert.deepEqual(s[0].photos, ['a1.jpg', 'a2.jpg']);
  assert.ok(Math.abs(s[0].lnglat[0] - -21.945) < 1e-3);
  assert.match(s[0].date, /^06\.2\d$/);
});

test('同一个地方隔了好几天再来：算新的一站', () => {
  const p = (name, day) => ({ name, lnglat: [10, 50], time: Date.UTC(2025, 5, day) });
  assert.equal(clusterStops([p('a', 1), p('b', 1), p('c', 5)]).length, 2);
});

test('EXIF：读出真实 JPEG 里的 GPS 和拍摄时间；没有 EXIF 返回 null', async () => {
  const jpg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } })
    .withExif({ IFD0: { DateTime: '2025:06:22 10:00:00' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '63/1 25/1 12/1', GPSLongitudeRef: 'W', GPSLongitude: '19/1 0/1 36/1' } })
    .jpeg().toBuffer();
  const meta = await sharp(jpg).metadata();
  const r = readExif(meta.exif);
  assert.deepEqual(r.lnglat, [-19.01, 63.42]);
  const plain = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } }).jpeg().toBuffer();
  assert.deepEqual(readExif((await sharp(plain).metadata()).exif), { lnglat: null, time: null });
});
