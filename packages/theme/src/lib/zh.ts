/** 中文数字与日期的排法：目次和竖排里用汉字数字（spec §4） */
const D = '〇一二三四五六七八九';

/** 三、十、十一、二十、四十八、一百零五、一百一十 …… 用于篇数、期号（到 9999） */
export function cnNumber(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n >= 10000) return String(n);
  if (n < 10) return n === 0 ? '零' : D[n];
  if (n < 100) return (n < 20 ? '' : D[Math.floor(n / 10)]) + '十' + (n % 10 ? D[n % 10] : '');
  const [u, name] = n < 1000 ? [100, '百'] : [1000, '千'];
  const rest = n % u;
  const tail = rest === 0 ? '' : rest < u / 10 ? '零' + cnNumber(rest) : rest >= 10 && rest < 20 ? '一' + cnNumber(rest) : cnNumber(rest);
  return D[Math.floor(n / u)] + name + tail;
}

/** 二〇二五 */
export const cnYear = (y: number) => String(y).split('').map((c) => D[+c]).join('');

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const pad3 = (n: number) => String(n).padStart(3, '0');

/** 春 3–5、夏 6–8、秋 9–11、冬 12–2 */
export const season = (month: number) => (month >= 3 && month <= 5 ? '春' : month >= 6 && month <= 8 ? '夏' : month >= 9 && month <= 11 ? '秋' : '冬');

/** 九月十四（竖排里的月日） */
export const cnMonthDay = (d: Date) => `${cnNumber(d.getMonth() + 1)}月${cnNumber(d.getDate())}`;

/** 2025.09.14 */
export const dotDate = (d: Date) => `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
