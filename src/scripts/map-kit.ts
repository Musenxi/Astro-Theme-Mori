/**
 * 街道底图的共用部分（看大图的位置图、地图页）：按需载入 MapLibre（单独一个包），
 * 底图用 CARTO 的矢量样式（OpenStreetMap 数据，WGS84，和照片的 GPS 对得上，不用 key）：夜间 Dark Matter，
 * 昼间同一家的 Positron。
 */
let lib: Promise<[typeof import('maplibre-gl'), string]> | undefined;
/**
 * 载入 MapLibre 和它的样式表。样式表自己放一个 <style>，每次用之前补上：站内换页（ClientRouter）会把 head 里
 * 新页面没有的东西拿掉，按普通方式动态导入的样式表换一次页就没了（标记、卡片失去定位）
 */
export async function loadMaplibre() {
  const [m, css] = await (lib ??= Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css?inline').then((x) => x.default as string)]));
  if (!document.getElementById('maplibre-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'maplibre-css', textContent: css }));
  return m;
}

/** 现在是夜间吗（手动选的优先，没选跟系统；和 mori.css 的 dark 变体一致） */
export const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};

/** 昼夜切换时回调（页头的按钮改 data-theme，或者系统变了） */
export function onThemeChange(cb: () => void) {
  let last = isDark();
  const check = () => { const d = isDark(); if (d !== last) { last = d; cb(); } };
  const mo = new MutationObserver(check);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', check);
  return () => { mo.disconnect(); mq.removeEventListener('change', check); };
}

/** 当前昼夜对应的底图样式地址 */
export const baseStyle = () => `https://basemaps.cartocdn.com/gl/${isDark() ? 'dark-matter' : 'positron'}-gl-style/style.json`;
