/** Studio 服务返回的数据形状（见 packages/studio/src/server.mjs） */
export type Kind = 'post' | 'travel' | 'page';

export interface Category { id: string; zh: string; en?: string; empty?: string }

export interface EntrySummary {
  kind: 'post' | 'travel';
  id: string;
  title: string;
  date: string;
  category?: string;
  tags: string[];
  words: number;
  /** 从没发布过（或已转为草稿） */
  draft: boolean;
  /** 已发布，但正在写的内容和已发布的不一样 */
  changed: boolean;
  pinned?: boolean;
  broken?: boolean;
}

export interface PageSummary { id: string; title: string; template: 'default' | 'friends'; draft: boolean; changed: boolean; comments: boolean; words: number; broken?: boolean }

export interface NavItem { label: string; href: string; icon?: string }
/** 页头右侧的一个操作：昼夜切换，或者一个链接（有 icon 就是图标钮） */
export type Action = { type: 'theme'; style?: 'text' | 'icon' } | { type: 'link'; label: string; href: string; icon?: string };

export interface PublishConfig {
  target: 'git' | 'cloudflare-pages' | 'rsync' | 'local';
  remote?: string; branch?: string; message?: string; project?: string; dest?: string;
}

export interface Project {
  root: string;
  configPath: string;
  dev: boolean;
  config: {
    title: string; description: string; accent: string; accentDark?: string; lang: string;
    categories: Category[];
    home?: { style?: 'quote' | 'cover' | 'list'; count?: number; direction?: 'h' | 'v'; tocDirection?: 'h' | 'v'; editorNote?: string };
    archive?: { direction?: 'h' | 'v' };
    feed?: { content?: 'excerpt' | 'full' };
    comments?: { avatar?: string };
    nav: NavItem[] | null;
    actions: Action[] | null;
    actionsLayout: 'merged' | 'split';
  };
  entries: EntrySummary[];
  pages: PageSummary[];
  assets: string[];
  preview: { port: number; url: string | null };
  publish: PublishConfig | null;
  comments: { provider: string | null; /** 头像地址模板，{hash} 换成评论的头像哈希；空 = 不显示 */ avatar: string; endpoint: string; hasToken: boolean; pending: number };
}

export interface Friend { id?: string; name: string; url: string; desc?: string; avatar?: string; order?: number }

export interface Stats {
  pages: number; categories: number; words: number;
  comments: { total: number; unread: number } | null;
  views: number | null; likes: number | null;
}

/** 内容 JSON（文章、游记、页面）：编辑器里当作松散的对象处理，校验交给服务端 */
export type Doc = Record<string, any> & { title?: string; blocks?: any[] };
