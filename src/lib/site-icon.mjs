/**
 * 站点图标（favicon，Studio 左上角也用它）：四种预设，或者 public/ 里的一张图（mori.config.ts 的 icon 写 /icon.png 这样的地址）。
 * 预设的 SVG 在 src/icons/，和 Studio 桌面版的应用图标同一套图案。
 */
export const ICONS = [['navy', '深墨蓝'], ['blue', '克莱因蓝'], ['ink', '墨黑'], ['paper', '米纸']];
export const DEFAULT_ICON = 'navy';
export const isPresetIcon = (v) => ICONS.some(([id]) => id === v);
/** 预设图标的文件（Node 里用，比如 Studio；站点里由 favicon.svg 路由直接打包进去） */
export const presetIconUrl = (id) => new URL(`../icons/${isPresetIcon(id) ? id : DEFAULT_ICON}.svg`, import.meta.url);
