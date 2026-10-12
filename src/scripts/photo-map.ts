/**
 * 看大图信息栏里的位置图：MapLibre 画 OpenFreeMap 的矢量底图（OpenStreetMap 数据，WGS84，和照片的 GPS 对得上，不用 key），
 * 颜色全部取主题的令牌（纸色陆地、淡墨水面和建筑、细线道路），不画地名。只在要显示时才载入 MapLibre（单独一个包）。
 * 静态的：不能拖动缩放，点击落到外面的链接上（在 OpenStreetMap 打开）。
 */
import type { Map as MlMap, StyleSpecification } from 'maplibre-gl';

let lib: Promise<typeof import('maplibre-gl')> | undefined;
const load = () => (lib ??= Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]).then(([m]) => m));

/** 主题令牌的实际颜色（令牌可能是 oklch、color-mix，画到 canvas 上再读回 rgb 最稳） */
function rgbOf(css: string, host: Element) {
  const probe = document.createElement('i');
  probe.style.color = css;
  host.append(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}
const mix = (a: number[], b: number[], k: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;

function style(host: Element): StyleSpecification {
  const bg = rgbOf('var(--background)', host), fg = rgbOf('var(--foreground)', host);
  const c = (k: number) => mix(bg, fg, k);
  const width = (a: number, b: number): any => ['interpolate', ['exponential', 1.5], ['zoom'], 11, a, 17, b];
  const road = (id: string, classes: string[], color: string, w: [number, number]) => ({
    id, type: 'line' as const, source: 'omt', 'source-layer': 'transportation',
    filter: ['all', ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false], ['match', ['get', 'class'], classes, true, false]] as any,
    layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
    paint: { 'line-color': color, 'line-width': width(...w) },
  });
  return {
    version: 8,
    sources: { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': c(0) } },
      { id: 'green', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': c(0.035) } },
      { id: 'wood', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['match', ['get', 'class'], ['wood', 'grass', 'farmland'], true, false] as any, paint: { 'fill-color': c(0.035) } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': c(0.12) } },
      { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', paint: { 'line-color': c(0.12), 'line-width': width(0.5, 3) } },
      { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', paint: { 'fill-color': c(0.075) } },
      road('path', ['path', 'track'], c(0.12), [0.3, 1]),
      road('minor', ['minor', 'service'], c(0.2), [0.4, 4]),
      road('mid', ['secondary', 'tertiary'], c(0.28), [0.6, 6]),
      road('major', ['motorway', 'trunk', 'primary'], c(0.36), [0.8, 8]),
      road('rail', ['rail', 'transit'], c(0.24), [0.3, 1.2]),
    ],
  };
}

/** 在 box 里画出以 [经度, 纬度] 为中心的地图；返回拆掉它的函数 */
export async function drawMap(box: HTMLElement, at: [number, number]): Promise<() => void> {
  const ml = await load();
  if (!box.isConnected) return () => {};
  const map: MlMap = new ml.Map({
    container: box, style: style(box), center: at, zoom: 14.6,
    interactive: false, attributionControl: false, fadeDuration: 0,
  });
  return () => map.remove();
}
