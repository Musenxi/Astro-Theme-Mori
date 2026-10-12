/**
 * 地图页：CARTO 的街道底图（map-kit.ts；夜间 Dark Matter，昼间 Positron）。
 * 照片按位置落成圆点（MapLibre 聚合）：单张是一枚圆形小照片，一摞是写着张数的主题色圆点。
 * 悬停先出一张小预览；点一摞放大过去，放到最大还分不开（同一个地方拍的）就列出来；点单张选中它，弹出卡片：
 * 大图（点开是灯箱，img[data-lb]）、图注、出自哪篇、日期 / 相机 / 坐标。右下是范围信息，左下是缩放、我的位置、看全部。
 * 带 ?at=经度,纬度（灯箱的位置图点过来）时直接定位到那里、打开那个位置的照片。
 * 游记的地点、路线（atlas 的 places / routes）各是一层，有数据就画。昼夜切换时换底图样式，图层重新加上。换页时拆掉地图。
 */
import type { Map as MlMap, GeoJSONSource, Marker, Popup, LngLatBoundsLike } from 'maplibre-gl';
import type { Atlas, AtlasPhoto } from '../lib/atlas.ts';
import { loadMaplibre, baseStyle, onThemeChange } from './map-kit.ts';
import { glassButtons } from './lg.ts';
import { t } from './i18n.ts';

const MAX = 17; // 再往里聚合也分不开（同一个地方拍的）
let teardown: (() => void) | undefined;

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => Object.assign(document.createElement(tag), { className: cls, textContent: text });
/** 页面里预先画好的图标（lucide，服务端渲染在 #atlas-icons 里） */
const icon = (name: string) => {
  const src = document.querySelector<HTMLTemplateElement>('#atlas-icons')?.content.querySelector(`[data-i="${name}"]`);
  return src ? (src.cloneNode(true) as HTMLElement) : h('span');
};
const deg = (at: [number, number]) => `${Math.abs(at[1]).toFixed(4)}°${at[1] >= 0 ? 'N' : 'S'}, ${Math.abs(at[0]).toFixed(4)}°${at[0] >= 0 ? 'E' : 'W'}`;
const day = (p: AtlasPhoto) => p.exif.time?.split(' ')[0];
const daysOf = (photos: AtlasPhoto[]) => {
  const d = [...new Set(photos.map(day).filter(Boolean))].sort() as string[];
  return d.length ? (d.length > 1 ? `${d[0]} – ${d.at(-1)}` : d[0]) : undefined;
};

/** 给灯箱用的图：带上 srcset、拍摄信息、实况视频 */
function photoImg(p: AtlasPhoto, sizes: string, thumb = false) {
  const img = h('img');
  img.src = thumb ? p.thumb : p.src;
  img.srcset = p.srcset;
  img.sizes = sizes;
  img.alt = p.alt;
  img.width = p.w;
  img.height = p.h;
  img.decoding = 'async';
  img.dataset.lb = '';
  img.dataset.exif = JSON.stringify(p.exif);
  if (p.live) { img.dataset.live = p.live.video; if (p.live.time) img.dataset.photoTime = String(p.live.time); }
  return img;
}

/** 一行：小图标 + 文字 */
const row = (name: string, text: string) => { const r = h('p', 'atlas-row'); r.append(icon(name), h('span', '', text)); return r; };

/** 悬停预览：一摞是“N 张” + 一排小图；都带日期、坐标 */
function preview(photos: AtlasPhoto[], at: [number, number]) {
  const box = h('div', 'atlas-peek');
  if (photos.length > 1) box.append(h('p', 'atlas-peek-n', t('js.map.n', { n: photos.length })));
  const strip = h('div', 'atlas-peek-strip');
  photos.slice(0, 4).forEach((p) => { const im = h('img'); im.src = p.thumb; im.alt = ''; strip.append(im); });
  box.append(strip);
  const d = daysOf(photos);
  if (d) box.append(row('calendar', d));
  box.append(row('map-pin', deg(at)));
  return box;
}

/** 卡片：单张是大图 + 图注 + 出自哪篇 + 日期 / 相机 / 坐标；同一个地方的好几张是一排图 */
function card(photos: AtlasPhoto[], at: [number, number], onClose: () => void) {
  const box = h('div', 'atlas-card');
  const p = photos[0];
  const media = h('figure', 'atlas-card-media');
  if (photos.length === 1) media.append(photoImg(p, '300px'));
  else {
    const strip = h('div', 'atlas-card-strip');
    photos.forEach((q) => strip.append(photoImg(q, '112px', true)));
    media.append(strip);
  }
  const close = h('button', 'atlas-close');
  close.type = 'button';
  close.setAttribute('aria-label', t('js.lb.close'));
  close.append(icon('x'));
  close.addEventListener('click', (e) => { e.stopPropagation(); onClose(); });
  media.append(close);
  // 灯箱从 figcaption 里取图注
  if (photos.length === 1 && (p.caption || p.alt)) media.append(h('figcaption', 'atlas-card-title', p.caption || p.alt));
  box.append(media);

  const body = h('div', 'atlas-card-body');
  if (photos.length === 1) {
    const a = h('a', 'atlas-card-entry');
    a.href = p.entry.href;
    a.append(h('span', '', `《${p.entry.title}》`), icon('arrow-right'));
    body.append(a);
    if (day(p)) body.append(row('calendar', day(p)!));
    if (p.exif.camera) body.append(row('camera', p.exif.camera));
  } else {
    body.append(h('p', 'atlas-card-n', t('js.map.n', { n: photos.length })));
    const d = daysOf(photos);
    if (d) body.append(row('calendar', d));
  }
  body.append(row('map-pin', deg(at)));
  box.append(body);
  return box;
}

async function init() {
  const host = document.querySelector<HTMLElement>('#atlas');
  if (!host) return;
  const atlas: Atlas = JSON.parse(document.querySelector('#atlas-data')!.textContent!);
  const ml = await loadMaplibre();
  if (!host.isConnected) return;

  const pts = [...atlas.photos.map((p) => p.at), ...atlas.places.map((p) => p.at), ...atlas.routes.flatMap((r) => r.line)];
  const bounds = pts.length ? pts.reduce((b, p) => b.extend(p), new ml.LngLatBounds(pts[0], pts[0])) : null;
  const pad = () => (innerWidth < 760 ? 56 : 120);
  const map: MlMap = new ml.Map({
    container: host, style: baseStyle(),
    center: pts.length ? pts[0] : [110, 25], zoom: pts.length ? 11 : 1.6,
    attributionControl: false, dragRotate: false, pitchWithRotate: false, maxZoom: 19,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  const fit = (duration = 800) => bounds && map.fitBounds(bounds as unknown as LngLatBoundsLike, { padding: pad(), maxZoom: 14, duration });
  fit(0);

  // 数据层：照片（聚合）、游记路线。底图样式一换，这些都要重新加
  const photoFC = {
    type: 'FeatureCollection' as const,
    features: atlas.photos.map((p, i) => ({ type: 'Feature' as const, properties: { i }, geometry: { type: 'Point' as const, coordinates: p.at } })),
  };
  map.on('style.load', () => {
    map.addSource('photos', { type: 'geojson', data: photoFC, cluster: true, clusterRadius: 48, clusterMaxZoom: MAX, clusterProperties: { first: ['min', ['get', 'i']] } });
    // 看不见的一层：数据要挂在图层上，querySourceFeatures 才取得到
    map.addLayer({ id: 'photos-hit', type: 'circle', source: 'photos', paint: { 'circle-radius': 0, 'circle-opacity': 0 } });
    if (atlas.routes.length) {
      map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: atlas.routes.map((r) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r.line } })) } });
      const primary = getComputedStyle(host).getPropertyValue('--primary').trim() || '#888';
      map.addLayer({ id: 'routes', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': primary, 'line-width': 2, 'line-opacity': 0.8 } });
    }
  });

  let pop: Popup | undefined, peek: Popup | undefined, selected: string | undefined;
  const markers = new Map<string, Marker>();
  const select = (key?: string) => {
    selected = key;
    markers.forEach((m, k) => m.getElement().classList.toggle('on', k === key));
  };
  const hidePeek = () => { peek?.remove(); peek = undefined; };
  const closeCard = () => { pop?.remove(); pop = undefined; select(); };
  const showCard = (photos: AtlasPhoto[], at: [number, number], key: string) => {
    hidePeek();
    pop?.remove();
    select(key);
    pop = new ml.Popup({ className: 'atlas-pop', closeButton: false, closeOnClick: false, offset: 26, maxWidth: 'none', focusAfterOpen: false })
      .setLngLat(at).setDOMContent(card(photos, at, closeCard)).addTo(map);
  };
  const src = () => map.getSource('photos') as GeoJSONSource;
  const leavesOf = async (id: number) => (await src().getClusterLeaves(id, 60, 0)).map((f) => atlas.photos[(f.properties as { i: number }).i]);
  const openCluster = async (id: number, at: [number, number], key: string) => {
    const z = await src().getClusterExpansionZoom(id);
    if (z <= MAX && map.getZoom() < MAX) { closeCard(); hidePeek(); return void map.easeTo({ center: at, zoom: z + 0.3, duration: 650 }); }
    showCard(await leavesOf(id), at, key);
  };

  // 照片标记：每次画完按当前的聚合结果增删 HTML 标记（键：一摞用 cluster_id，单张用照片序号）
  const sync = () => {
    if (!map.getSource('photos') || !map.isSourceLoaded('photos')) return;
    const live = new Set<string>();
    for (const f of map.querySourceFeatures('photos')) {
      const pr = f.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; first?: number; i?: number };
      const key = pr.cluster ? `c${pr.cluster_id}` : `p${pr.i}`;
      if (live.has(key)) continue;
      live.add(key);
      if (markers.has(key)) continue;
      const p = atlas.photos[pr.cluster ? pr.first! : pr.i!];
      const at = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      const el = h('button', pr.cluster ? 'atlas-dot' : 'atlas-pin');
      el.type = 'button';
      if (pr.cluster) {
        el.append(h('span', '', String(pr.point_count)));
        el.setAttribute('aria-label', t('js.map.n', { n: pr.point_count! }));
      } else {
        const im = h('img');
        im.src = p.thumb;
        im.alt = '';
        im.decoding = 'async';
        el.append(im);
        el.setAttribute('aria-label', p.caption || p.alt || p.entry.title);
      }
      if (key === selected) el.classList.add('on');
      el.addEventListener('click', (e) => { e.stopPropagation(); if (pr.cluster) openCluster(pr.cluster_id!, at, key); else showCard([p], at, key); });
      // 悬停预览（鼠标才有；选中的那个已经有卡片了）
      el.addEventListener('pointerenter', async (e) => {
        if (e.pointerType !== 'mouse' || key === selected) return;
        const photos = pr.cluster ? await leavesOf(pr.cluster_id!) : [p];
        if (!el.matches(':hover')) return;
        hidePeek();
        peek = new ml.Popup({ className: 'atlas-pop atlas-pop-peek', closeButton: false, closeOnClick: false, offset: 24, maxWidth: 'none', focusAfterOpen: false })
          .setLngLat(at).setDOMContent(preview(photos, at)).addTo(map);
      });
      el.addEventListener('pointerleave', hidePeek);
      markers.set(key, new ml.Marker({ element: el, anchor: 'center' }).setLngLat(at).addTo(map));
    }
    for (const [k, m] of markers) if (!live.has(k)) { m.remove(); markers.delete(k); }
  };
  map.on('render', sync);
  map.on('click', closeCard);

  // 从灯箱的位置图点过来（/map/?at=经度,纬度）：直接定位到那里，打开这个位置的照片
  const q = new URLSearchParams(location.search).get('at')?.split(',').map(Number);
  if (q?.length === 2 && q.every(Number.isFinite)) {
    const at = q as [number, number];
    const same = atlas.photos.map((p, i) => [p, i] as const).filter(([p]) => Math.abs(p.at[0] - at[0]) < 1e-5 && Math.abs(p.at[1] - at[1]) < 1e-5);
    map.jumpTo({ center: at, zoom: 16 });
    if (same.length) map.once('idle', () => showCard(same.map(([p]) => p), same[0][0].at, same.length === 1 ? `p${same[0][1]}` : 'at'));
  }

  // 游记的地点：主题色的点，悬停看名字，点开去那篇
  const placeMarkers = atlas.places.map((pl) => {
    const el = h('a', 'atlas-place');
    el.href = pl.entry.href;
    el.title = `${pl.name} · 《${pl.entry.title}》`;
    return new ml.Marker({ element: el }).setLngLat(pl.at).addTo(map);
  });

  // 我的位置：浏览器给了就飞过去，放一个点
  let me: Marker | undefined;
  const locate = () => navigator.geolocation?.getCurrentPosition((pos) => {
    const at: [number, number] = [pos.coords.longitude, pos.coords.latitude];
    me ??= new ml.Marker({ element: h('span', 'atlas-me') }).setLngLat(at).addTo(map);
    me.setLngLat(at);
    map.flyTo({ center: at, zoom: Math.max(map.getZoom(), 13), duration: 1200 });
  }, () => {}, { timeout: 8000 });

  const ctl = (id: string, fn: () => void) => document.querySelector(id)?.addEventListener('click', fn);
  ctl('#atlas-in', () => map.zoomIn());
  ctl('#atlas-out', () => map.zoomOut());
  ctl('#atlas-me', locate);
  ctl('#atlas-fit', () => { closeCard(); fit(); });
  glassButtons([...document.querySelectorAll<HTMLElement>('#atlas-ctl .lg')], document.querySelector('#lg-defs-atlas'), 'lg-f-atlas');

  const offTheme = onThemeChange(() => map.setStyle(baseStyle()));
  teardown = () => { offTheme(); pop?.remove(); peek?.remove(); markers.forEach((m) => m.remove()); placeMarkers.forEach((m) => m.remove()); me?.remove(); map.remove(); };
}

document.addEventListener('astro:page-load', () => { init(); });
document.addEventListener('astro:before-swap', () => { teardown?.(); teardown = undefined; });
