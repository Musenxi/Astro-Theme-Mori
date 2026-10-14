/**
 * 认网址是哪个网站（纯函数，Node 和浏览器都能用）。
 * cardOf：单独一行的链接能不能做成卡片、是哪一种（GitHub 仓库 / Issue / PR / 提交 / 文件、Gist、YouTube、哔哩哔哩、X）；
 * brandOf：行内链接前面放哪个网站的小图标。
 */

const parse = (url) => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u : null; } catch { return null; } };
const host = (u) => u.hostname.replace(/^(www|m)\./, '');

/** 能做成卡片的链接 → { site, kind, … }；认不出返回 null */
export function cardOf(url) {
  const u = parse(url);
  if (!u) return null;
  const h = host(u), p = u.pathname.split('/').filter(Boolean);
  if (h === 'github.com' && p.length >= 2) {
    const [owner, repo, kind, ...rest] = p;
    if (!kind) return { site: 'github', kind: 'repo', owner, repo };
    if ((kind === 'issues' || kind === 'pull') && /^\d+$/.test(rest[0] ?? '')) return { site: 'github', kind: kind === 'pull' ? 'pull' : 'issue', owner, repo, number: +rest[0] };
    if (kind === 'commit' && /^[0-9a-f]{7,40}$/i.test(rest[0] ?? '')) return { site: 'github', kind: 'commit', owner, repo, sha: rest[0] };
    if (kind === 'blob' && rest.length >= 2) {
      const lines = u.hash.match(/^#L(\d+)(?:-L(\d+))?$/);
      return { site: 'github', kind: 'file', owner, repo, ref: rest[0], path: rest.slice(1).join('/'), ...(lines ? { from: +lines[1], to: +(lines[2] ?? lines[1]) } : {}) };
    }
    return null;
  }
  if (h === 'gist.github.com' && p.length >= 2 && /^[0-9a-f]+$/i.test(p[1])) return { site: 'gist', kind: 'gist', owner: p[0], id: p[1] };
  if (h === 'youtube.com' || h === 'music.youtube.com') {
    const v = p[0] === 'watch' ? u.searchParams.get('v') : (p[0] === 'shorts' || p[0] === 'live') ? p[1] : null;
    return v && /^[\w-]{11}$/.test(v) ? { site: 'youtube', kind: 'video', id: v } : null;
  }
  if (h === 'youtu.be' && /^[\w-]{11}$/.test(p[0] ?? '')) return { site: 'youtube', kind: 'video', id: p[0] };
  if (h === 'bilibili.com' && p[0] === 'video' && /^BV\w{10}$/.test(p[1] ?? '')) return { site: 'bilibili', kind: 'video', id: p[1], page: +(u.searchParams.get('p') ?? 1) || 1 };
  if ((h === 'x.com' || h === 'twitter.com') && p[1] === 'status' && /^\d+$/.test(p[2] ?? '')) return { site: 'x', kind: 'post', user: p[0], id: p[2] };
  return null;
}

/** 域名 → 图标名（site-icons.ts 里的键）；子域名也算（docs.github.com → github） */
const BRANDS = {
  'github.com': 'github', 'github.io': 'github', 'gitlab.com': 'gitlab',
  'x.com': 'x', 'twitter.com': 'x', 'youtube.com': 'youtube', 'youtu.be': 'youtube',
  'bilibili.com': 'bilibili', 'b23.tv': 'bilibili', 't.me': 'telegram', 'telegram.org': 'telegram',
  'zhihu.com': 'zhihu', 'weibo.com': 'weibo', 'douban.com': 'douban', 'xiaohongshu.com': 'xiaohongshu',
  'npmjs.com': 'npm', 'wikipedia.org': 'wikipedia', 'stackoverflow.com': 'stackoverflow', 'reddit.com': 'reddit',
  'medium.com': 'medium', 'instagram.com': 'instagram', 'discord.com': 'discord', 'discord.gg': 'discord',
  'spotify.com': 'spotify', 'music.apple.com': 'applemusic', 'music.163.com': 'netease', 'v2ex.com': 'v2ex',
  'codesandbox.io': 'codesandbox', 'bsky.app': 'bluesky', 'threads.net': 'threads',
};

export function brandOf(url) {
  const u = parse(url);
  if (!u) return null;
  for (let h = host(u); h.includes('.'); h = h.slice(h.indexOf('.') + 1)) if (BRANDS[h]) return BRANDS[h];
  return null;
}

/** 提及 [名字]{GH@用户名} 的平台 → 主页地址 */
export const MENTION = {
  GH: (u) => `https://github.com/${u}`,
  TW: (u) => `https://x.com/${u}`,
  X: (u) => `https://x.com/${u}`,
  TG: (u) => `https://t.me/${u}`,
  BL: (u) => `https://space.bilibili.com/${u}`,
  ZH: (u) => `https://www.zhihu.com/people/${u}`,
};
