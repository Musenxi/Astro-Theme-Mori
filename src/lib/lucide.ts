/** Lucide 图标：页头入口用它画图标；Studio 的图标选择器也从这里取（按需加载，不进主包） */
import { icons } from 'lucide';

export type IconNode = Array<[string, Record<string, string | number>]>;

/** `BookOpen` → `book-open`；数字前也断开（`Grid2x2` → `grid-2x2`） */
const kebab = (name: string) => name.replace(/([a-z])(?=[A-Z0-9])|([A-Z])(?=[A-Z][a-z])/g, '$1$2-').toLowerCase();
/** 查找时不分大小写、不管连字符：`book-open`、`BookOpen`、`bookopen` 都能找到 */
const flat = (name: string) => name.replace(/-/g, '').toLowerCase();

const table = icons as unknown as Record<string, IconNode>;
const byFlat = new Map(Object.keys(table).map((k) => [flat(k), k]));

export const iconNode = (name: string): IconNode | undefined => table[byFlat.get(flat(name)) ?? ''];

/** 全部图标名（kebab-case），按字母排 */
export const iconNames = (): string[] => Object.keys(table).map(kebab).sort();

const attr = (v: string | number) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** 图标的 <svg> 字符串；名字不存在返回 null。颜色跟随文字（currentColor） */
export function iconSvg(name: string, className = ''): string | null {
  const node = iconNode(name);
  if (!node) return null;
  const body = node.map(([tag, a]) => `<${tag} ${Object.entries(a).map(([k, v]) => `${k}="${attr(v)}"`).join(' ')}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${className ? ` class="${attr(className)}"` : ''}>${body}</svg>`;
}
