import type { Doc, Friend, Kind, NavItem, Project, PublishConfig, Stats, Action } from './types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  // 保存文章时校验不过也是 200；其余非 2xx 都当错误
  if (!r.ok && !(j && j.errors)) throw new ApiError(j?.error ?? `请求失败（${r.status}）`, r.status);
  return j as T;
}

export interface SaveResult {
  ok: boolean;
  saved?: boolean;
  errors: Array<{ path: string; message: string }>;
  annotationWarnings?: Array<{ id: number; block: string; quote?: string }>;
}
export interface AssetInfo { name: string; size: number; mtime: number; width?: number; height?: number; usedBy: Array<{ kind: 'post' | 'travel' | 'page' | 'friends'; id: string; title: string }> }
export interface GitInfo { isRepo: boolean; top?: string; nested?: boolean; branch?: string; remotes?: Array<{ name: string; url: string }>; changed?: number; last?: string }
export interface CommentRow { id: number; entry: string; name: string; avatar?: string | null; url?: string | null; body: string; createdAt: number; status: 'pending' | 'approved' | 'hidden'; block?: string | null; quote?: string | null; parentId?: number | null }

/** 长任务（构建 / 发布）：输出一路推给 onChunk，结束时返回退出码 */
async function stream(url: string, onChunk: (all: string) => void): Promise<number> {
  const res = await fetch(url, { method: 'POST' });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let all = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    all += dec.decode(value);
    onChunk(all);
  }
  return +(all.match(/\[exit (\d+)\]/)?.[1] ?? 1);
}

export const api = {
  project: () => req<Project>('GET', '/api/project'),
  stats: () => req<Stats>('GET', '/api/stats'),

  entry: (kind: Kind, id: string) => req<Doc>('GET', `/api/entry/${kind}/${id}`),
  saveEntry: (kind: Kind, id: string, doc: Doc) => req<SaveResult>('PUT', `/api/entry/${kind}/${id}`, doc),
  createEntry: (kind: Kind, body: { id: string; title: string; category?: string }) => req<{ ok: true; id: string }>('POST', `/api/entry/${kind}`, body),
  removeEntry: (kind: Kind, id: string) => req<{ ok: true }>('DELETE', `/api/entry/${kind}/${id}`),

  setConfig: (key: string, value: string | null) => req('PUT', '/api/config', { key, value }),
  setCategories: (categories: unknown[], renames: Record<string, string>) => req<{ ok: true; moved: number }>('PUT', '/api/categories', { categories, renames }),
  renameTag: (from: string, to: string | null) => req<{ ok: true; changed: number }>('POST', '/api/tags/rename', { from, to }),
  setNav: (body: { nav?: NavItem[] | null; actions?: Action[] | null }) => req<{ ok: true }>('PUT', '/api/nav', body),

  friends: () => req<{ friends: Friend[] }>('GET', '/api/friends'),
  saveFriends: (friends: Friend[]) => req<{ ok: true; friends: Friend[] }>('PUT', '/api/friends', { friends }),
  probeSite: (url: string) => req<{ name: string; desc: string; avatar?: string }>('POST', '/api/friends/probe', { url }),

  upload: async (file: File) => {
    const r = await fetch(`/api/asset/${encodeURIComponent(file.name)}`, { method: 'PUT', body: file });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new ApiError(j.error ?? '上传失败', r.status);
    return j as { ok: true; name: string };
  },

  importGpx: async (file: File) => {
    const r = await fetch('/api/gpx', { method: 'POST', body: file });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new ApiError(j.error ?? '读取 GPX 失败', r.status);
    return j as { track: Array<[number, number]>; points: number; simplified: number };
  },
  exif: () => req<{ photos: number; withGps: number; stops: Array<{ lnglat: [number, number]; date?: string; count: number }> }>('GET', '/api/exif'),

  assets: () => req<{ assets: AssetInfo[] }>('GET', '/api/assets'),
  removeAsset: (name: string) => req<{ ok: true }>('DELETE', `/api/asset/${encodeURIComponent(name)}`),

  comments: (status?: string) => req<{ comments: CommentRow[] }>('GET', `/api/comments${status ? `?status=${status}` : ''}`),
  commentStats: () => req<{ pending: number; approved: number; hidden: number }>('GET', '/api/comments/stats'),
  setCommentStatus: (id: number, status: string) => req('PATCH', `/api/comments/${id}`, { status }),
  removeComment: (id: number) => req('DELETE', `/api/comments/${id}`),
  setCommentToken: (token: string) => req('PUT', '/api/comments/token', { token }),
  markCommentsSeen: () => req('POST', '/api/comments/seen'),

  previewStart: () => req<{ port: number; url: string | null; up: boolean }>('POST', '/api/preview/start', {}),
  previewStop: () => req('POST', '/api/preview/stop', {}),

  git: () => req<GitInfo>('GET', '/api/git'),
  gitInit: (url: string, branch: string) => req<GitInfo>('POST', '/api/git/init', { url, branch }),
  setPublish: (publish: PublishConfig | null) => req<{ ok: true; publish: PublishConfig | null }>('PUT', '/api/publish-config', { publish }),
  build: (onChunk: (t: string) => void) => stream('/api/build', onChunk),
  publish: (onChunk: (t: string) => void) => stream('/api/publish', onChunk),
};

export const assetUrl = (name: string, w = 240) => `/asset/${encodeURIComponent(name)}?w=${w}`;
