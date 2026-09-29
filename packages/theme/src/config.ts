/** mori.config.ts 的形状（spec §9）。只放可序列化的值——它会通过虚拟模块 `virtual:mori/config` 送到页面里 */

export interface MoriCategory {
  /** 栏目 id，文章的 `category` 字段引用它 */
  id: string;
  zh: string;
  en: string;
  /** 刻度页里空月份的提示，如“没写游记” */
  empty?: string;
}

export interface MoriNavItem {
  label: string;
  href: string;
}

export interface MoriUserConfig {
  /** 站点根地址，用于 canonical / RSS；部署时填 */
  site?: string;
  /** 刊名，页头左上角的纯文字。默认 MORI */
  title?: string;
  description?: string;
  /** 主题色（唯一的强调色），默认克莱因蓝 #002fa7；亮暗两个版本由 OKLCH 自动推出 */
  accent?: string;
  /** 暗色下的主题色；不写就从 accent 自动推（保持色相和饱和度，亮度托底） */
  accentDark?: string;
  categories: MoriCategory[];
  nav?: MoriNavItem[];
  home?: {
    /** 首页排法：h 横排 / v 竖排 */
    direction?: 'h' | 'v';
    /** 目次左边的“编者按” */
    editorNote?: string;
  };
  archive?: {
    /** 归档 / 栏目刻度页的排法 */
    direction?: 'h' | 'v';
  };
}

export interface MoriConfig extends Required<Pick<MoriUserConfig, 'title' | 'accent' | 'categories' | 'nav'>> {
  site?: string;
  accentDark?: string;
  description: string;
  home: { direction: 'h' | 'v'; editorNote: string };
  archive: { direction: 'h' | 'v' };
}

export const defineMoriConfig = (c: MoriUserConfig) => c;

export function resolveConfig(c: MoriUserConfig): MoriConfig {
  return {
    site: c.site,
    title: c.title ?? 'MORI',
    description: c.description ?? '',
    accent: c.accent ?? '#002fa7',
    accentDark: c.accentDark,
    categories: c.categories,
    nav: c.nav ?? [
      { label: '文章', href: '/posts/' },
      { label: '游记', href: '/travels/' },
      { label: '归档', href: '/archive/' },
    ],
    home: { direction: c.home?.direction ?? 'h', editorNote: c.home?.editorNote ?? '' },
    archive: { direction: c.archive?.direction ?? c.home?.direction ?? 'h' },
  };
}
