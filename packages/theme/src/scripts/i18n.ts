/** 浏览器里的脚本取词：词条由页面内嵌（#mori-i18n），语言随站点设置 */
let cache: Record<string, string> | null = null;
const dict = () => {
  if (cache) return cache;
  try { cache = JSON.parse(document.getElementById('mori-i18n')?.textContent ?? '{}'); } catch { cache = {}; }
  return cache!;
};
export const t = (key: string, vars?: Record<string, string | number>) => {
  const s = dict()[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
};
