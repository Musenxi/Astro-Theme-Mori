/** mori.config.ts 的形状（spec §9）。只放可序列化的值——它会通过虚拟模块 `virtual:mori/config` 送到页面里 */

import { makeT, verticalOk, type Lang } from './i18n/index.ts';
export type { Lang } from './i18n/index.ts';

export interface MoriCategory {
  /** 分类 id，文章的 `category` 字段引用它 */
  id: string;
  zh: string;
  en: string;
  /** 刻度页里空月份的提示，如“没写游记” */
  empty?: string;
}

/** 页头右侧的一个操作：昼夜切换（文字“昼/夜”或太阳月亮图标），或者一个链接（设了 icon 就是图标钮，比如搜索） */
export type MoriAction =
  | { type: 'theme'; style?: 'text' | 'icon' }
  | { type: 'link'; label: string; href: string; icon?: string };

export interface MoriNavItem {
  /** 文字；设了 icon 时只作为悬停提示和读屏名 */
  label: string;
  href: string;
  /** Lucide 图标名（如 'house'、'book-open'）；设了就用图标代替文字 */
  icon?: string;
}

/**
 * 发布目标（Studio 的“发布”按钮用；不会进入站点页面）。
 *  - cloudflare-pages：用 wrangler 直接上传 dist/，不需要 git（先在本机 `wrangler login` 过）
 *  - rsync：用 rsync 上传到 VPS（`user@host:/var/www/site/`），需要本机能 ssh 过去
 */
export type MoriPublish =
  | { target: 'cloudflare-pages'; project: string; branch?: string }
  | { target: 'rsync'; dest: string };

/**
 * 评论（spec §5）：二选一，互相隔离。
 *  - mori：自建评论服务（packages/comments），文末评论 + 划词引用评论
 *  - 其余是第三方，只有文末评论，没有引用评论
 */
export type MoriCommentsStatus = 'on' | 'readonly' | 'off';
export type MoriComments =
  | { provider: 'mori'; /** 开关：on（默认）开启；readonly 禁用但显示历史评论；off 禁用且评论区不显示。单篇文章可以在自己的 comments 里覆盖 */ status?: MoriCommentsStatus; /** 评论服务的地址，如 https://comments.example.com */ endpoint: string; /** Cloudflare Turnstile 的站点密钥（公开的那个） */ turnstileSiteKey?: string; /** 是否开启划词引用评论，默认开 */ annotations?: boolean; /** 头像服务：'cravatar'（默认，国内能用）、'gravatar'、'none'（不显示），或含 {hash} 的自定义地址 */ avatar?: string }
  | { provider: 'giscus'; repo: string; repoId: string; category: string; categoryId: string; mapping?: string }
  | { provider: 'waline'; serverURL: string }
  | { provider: 'twikoo'; envId: string }
  | { provider: 'artalk'; server: string; site?: string };

export interface MoriUserConfig {
  /** 站点根地址，用于 canonical / RSS；部署时填 */
  site?: string;
  /** 刊名，页头左上角的纯文字。默认 MORI */
  title?: string;
  /** 界面语言：zh-CN（默认）/ zh-TW / en / ja。英文站自动关闭竖排和手卷方向 */
  lang?: Lang;
  description?: string;
  /** 主题色（唯一的强调色），默认克莱因蓝 #002fa7；亮暗两个版本由 OKLCH 自动推出 */
  accent?: string;
  /** 暗色下的主题色；不写就从 accent 自动推（保持色相和饱和度，亮度托底） */
  accentDark?: string;
  categories: MoriCategory[];
  nav?: MoriNavItem[];
  /** 页头右侧并排的操作，默认只有昼夜切换。写 [] 是一个都不要 */
  actions?: MoriAction[];
  /** 页头右侧的操作：merged 合并成一个胶囊（默认）/ split 每个单独一个胶囊 */
  actionsLayout?: 'merged' | 'split';
  home?: {
    /** 首页版式：quote 引文开篇（默认）/ cover 封面版（墨色封面 + 满版刊名，往下滚时刊名缩进页头）/ list 文章列表 */
    style?: 'quote' | 'cover' | 'list';
    /** 首页一次展示几篇（1–8，默认 4）：置顶的排在前面（按 pin.order），不够的用最新的补；没有置顶也没有封面图时引文版会退回文章列表 */
    count?: number;
    /** 首页排法：h 横排 / v 竖排（手机上一律横排） */
    direction?: 'h' | 'v';
    /** 首页目次的排法：h 横排 / v 竖排（手机上一律横排）；不写就跟首页排法一样 */
    tocDirection?: 'h' | 'v';
    /** 目次左边的“编者按” */
    editorNote?: string;
  };
  archive?: {
    /** 归档 / 分类刻度页的排法（手机上一律横排） */
    direction?: 'h' | 'v';
  };
  /** RSS 订阅（/feed） */
  feed?: {
    /** 订阅里放什么：excerpt 只放摘要（默认）；full 放全文（文章的正文、游记的文字和图片） */
    content?: 'excerpt' | 'full';
  };
  publish?: MoriPublish;
  comments?: MoriComments;
}

export interface MoriConfig extends Required<Pick<MoriUserConfig, 'title' | 'accent' | 'categories' | 'nav'>> {
  site?: string;
  lang: Lang;
  accentDark?: string;
  comments?: MoriComments;
  description: string;
  home: { style: 'quote' | 'cover' | 'list'; count: number; direction: 'h' | 'v'; tocDirection: 'h' | 'v'; editorNote: string };
  archive: { direction: 'h' | 'v' };
  /** nav 是用户在配置里设定的（false 时页头在内置入口后面自动接上所有页面） */
  navCustom: boolean;
  actions: MoriAction[];
  actionsLayout: 'merged' | 'split';
  feed: { content: 'excerpt' | 'full' };
}

export const defineMoriConfig = (c: MoriUserConfig) => c;

export function resolveConfig(c: MoriUserConfig): MoriConfig {
  const lang = c.lang ?? 'zh-CN';
  const { t } = makeT(lang);
  // 竖排只对中日文有意义：英文站里首页 / 归档一律横排
  const dir = (d?: 'h' | 'v') => (verticalOk(lang) ? d ?? 'h' : 'h');
  return {
    site: c.site,
    lang,
    title: c.title ?? 'MORI',
    description: c.description ?? '',
    accent: c.accent ?? '#002fa7',
    accentDark: c.accentDark,
    comments: c.comments,
    categories: c.categories,
    nav: c.nav ?? [
      { label: t('nav.posts'), href: '/posts/' },
      { label: t('nav.archive'), href: '/archive/' },
    ],
    home: { style: c.home?.style ?? 'quote', count: Math.min(8, Math.max(1, Math.round(c.home?.count ?? 4) || 4)), direction: dir(c.home?.direction), tocDirection: dir(c.home?.tocDirection ?? c.home?.direction), editorNote: c.home?.editorNote ?? '' },
    archive: { direction: dir(c.archive?.direction ?? c.home?.direction) },
    navCustom: !!c.nav,
    actions: c.actions ?? [{ type: 'theme' }],
    actionsLayout: c.actionsLayout === 'split' ? 'split' : 'merged',
    feed: { content: c.feed?.content === 'full' ? 'full' : 'excerpt' },
  };
}
