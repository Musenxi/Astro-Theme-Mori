/** 浏览器脚本里用的箭头（和 components/Chevron.astro 是同一个图形）：返回 SVG 元素 / 一段 SVG 字符串 */
const POINTS = '2,1 5.4,5 2,9';

export function chevronEl(dir: 'left' | 'right' = 'right'): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', dir === 'left' ? 'chev l' : 'chev');
  svg.setAttribute('viewBox', '0 0 8 10');
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS(ns, 'polyline');
  line.setAttribute('points', POINTS);
  svg.append(line);
  return svg;
}

export const chevronHtml = (dir: 'left' | 'right' = 'right') =>
  `<svg class="${dir === 'left' ? 'chev l' : 'chev'}" viewBox="0 0 8 10" aria-hidden="true"><polyline points="${POINTS}"></polyline></svg>`;
