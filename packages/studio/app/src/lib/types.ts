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
  draft: boolean;
  pinned?: boolean;
  broken?: boolean;
}

export interface PageSummary { id: string; title: string; template: 'default' | 'friends'; draft: boolean; comments: boolean; words: number; broken?: boolean }

export interface NavItem { label: string; href: string }

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
    home?: { style?: 'quote' | 'cover'; direction?: 'h' | 'v'; editorNote?: string };
    archive?: { direction?: 'h' | 'v' };
    feed?: { content?: 'excerpt' | 'full' };
    nav: NavItem[] | null;
  };
  entries: EntrySummary[];
  pages: PageSummary[];
  assets: string[];
  preview: { port: number; url: string | null };
  publish: PublishConfig | null;
  comments: { provider: string | null; endpoint: string; hasToken: boolean; pending: number };
}

export interface Friend { id?: string; name: string; url: string; desc?: string; avatar?: string; order?: number }

export interface Stats {
  pages: number; categories: number; words: number;
  comments: { total: number; unread: number } | null;
  views: number | null; likes: number | null;
}

/** 内容 JSON（文章、游记、页面）：编辑器里当作松散的对象处理，校验交给服务端 */
export type Doc = Record<string, any> & { title?: string; blocks?: any[] };
