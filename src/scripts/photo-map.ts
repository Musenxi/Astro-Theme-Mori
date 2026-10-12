/**
 * 看大图信息栏里的位置图：和地图页同一套底图（见 map-kit.ts），拍摄地点在正中。
 * 静态的：不能拖动缩放，点击落到外面的链接上（在 OpenStreetMap 打开）。
 */
import type { Map as MlMap } from 'maplibre-gl';
import { loadMaplibre, baseStyle } from './map-kit.ts';

/** 在 box 里画出以 [经度, 纬度] 为中心的地图；返回拆掉它的函数 */
export async function drawMap(box: HTMLElement, at: [number, number]): Promise<() => void> {
  const ml = await loadMaplibre();
  if (!box.isConnected) return () => {};
  const map: MlMap = new ml.Map({
    container: box, style: baseStyle(), center: at, zoom: 14.6,
    interactive: false, attributionControl: false, fadeDuration: 0,
  });
  return () => map.remove();
}
