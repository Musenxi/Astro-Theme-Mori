/**
 * 网站卡片的数据：构建时按网址去各网站取标题、简介等（GitHub API、YouTube oEmbed、哔哩哔哩、X 的公开接口）。
 * 取到的存进 node_modules/.cache/mori/embeds.json，一天内再构建直接用；取不到（离线、限流、接口变了）就用上次存的，
 * 再没有就只给网址，卡片退成一张简单的链接卡，不让构建失败。GitHub 限流时可以设环境变量 GITHUB_TOKEN。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cardOf } from './sites.mjs';

export interface CardCode { filename: string; lang?: string; code: string; from?: number }
export interface Card {
  url: string;
  site: 'github' | 'gist' | 'youtube' | 'bilibili' | 'x';
  kind: string;
  /** 取不到数据时为 false */
  ok: boolean;
  title?: string;
  desc?: string;
  /** 一行附属信息：语言、星数、状态、作者、日期…… */
  meta?: string[];
  /** 视频：封面和播放器地址 */
  thumb?: string;
  player?: string;
  /** X：作者 */
  author?: { name: string; handle: string; avatar?: string };
  /** X：配图（最多四张；视频、动图给的是封面） */
  media?: Array<{ src: string; w: number; h: number; video?: boolean; alt?: string }>;
  date?: string;
  /** GitHub 文件、Gist：代码 */
  files?: CardCode[];
}

const FILE = join(process.cwd(), 'node_modules/.cache/mori/embeds.json');
const FRESH = 24 * 3600 * 1000;
/** 卡片数据的格式版本：加了字段（比如 X 的配图）就加一，旧格式的缓存当作过期，重新去取 */
const V = 2;
let cache: Record<string, { at: number; v?: number; card: Card }> | null = null;
const load = () => {
  if (cache) return cache;
  try { cache = JSON.parse(readFileSync(FILE, 'utf8')); } catch { cache = {}; }
  return cache!;
};
const save = () => { try { mkdirSync(dirname(FILE), { recursive: true }); writeFileSync(FILE, JSON.stringify(cache)); } catch { /* 只是缓存 */ } };

async function get(url: string, headers: Record<string, string> = {}, as: 'json' | 'text' = 'json') {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mori (blog build)', ...headers }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return as === 'json' ? r.json() : r.text();
}
const gh = (path: string) => get(`https://api.github.com${path}`, { Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) });

const num = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n));
const day = (s: string) => s.slice(0, 10).replace(/-/g, '/');
const extLang = (path: string) => (/\.[^./]+$/.test(path) ? path.split('.').pop()!.toLowerCase() : undefined);

/** cardOf 的结果：site、kind 之外的字段按网站不同 */
type Site = { site: string; kind: string; [k: string]: any };

async function fetchCard(c: Site): Promise<Omit<Card, 'url' | 'site' | 'kind' | 'ok'>> {
  switch (c.site) {
    case 'github': {
      const repo = `/repos/${c.owner}/${c.repo}`;
      if (c.kind === 'repo') {
        const d = await gh(repo);
        return { title: d.full_name, desc: d.description ?? '', meta: [d.language, `★ ${num(d.stargazers_count)}`].filter(Boolean) };
      }
      if (c.kind === 'issue' || c.kind === 'pull') {
        const d = await gh(`${repo}/${c.kind === 'pull' ? 'pulls' : 'issues'}/${c.number}`);
        const state = d.merged_at ? 'merged' : d.state;
        return { title: d.title, desc: `${c.owner}/${c.repo}`, meta: [`#${c.number}`, state, d.user?.login].filter(Boolean) };
      }
      if (c.kind === 'commit') {
        const d = await gh(`${repo}/commits/${c.sha}`);
        const [title, ...body] = String(d.commit.message).split('\n');
        return { title, desc: body.join(' ').trim() || `${c.owner}/${c.repo}`, meta: [c.sha!.slice(0, 7), `+${d.stats?.additions ?? 0} −${d.stats?.deletions ?? 0}`, d.commit.author?.name, d.commit.author?.date && day(d.commit.author.date)].filter(Boolean) };
      }
      // 文件：原文；网址带 #L3-L9 时只取这几行
      const raw: string = await get(`https://raw.githubusercontent.com/${c.owner}/${c.repo}/${c.ref}/${c.path}`, {}, 'text');
      const lines = raw.replace(/\n$/, '').split('\n');
      const code = c.from ? lines.slice(c.from - 1, c.to).join('\n') : lines.join('\n');
      return { title: `${c.owner}/${c.repo}`, files: [{ filename: c.path!, lang: extLang(c.path!), code, from: c.from }] };
    }
    case 'gist': {
      const d = await get(`https://api.github.com/gists/${c.id}`, process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {});
      const files = Object.values(d.files as Record<string, { filename: string; language?: string; content: string }>).slice(0, 3)
        .map((f) => ({ filename: f.filename, lang: f.language?.toLowerCase() ?? extLang(f.filename), code: f.content.replace(/\n$/, '') }));
      return { title: d.description || files[0]?.filename, files };
    }
    case 'youtube': {
      const d = await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${c.id}`)}`);
      return { title: d.title, meta: [d.author_name], thumb: `https://i.ytimg.com/vi/${c.id}/hqdefault.jpg`, player: `https://www.youtube-nocookie.com/embed/${c.id}?autoplay=1` };
    }
    case 'bilibili': {
      const d = (await get(`https://api.bilibili.com/x/web-interface/view?bvid=${c.id}`, { Referer: 'https://www.bilibili.com/' })).data;
      if (!d) throw new Error('bilibili');
      return { title: d.title, meta: [d.owner?.name], thumb: String(d.pic).replace(/^http:/, 'https:'), player: `https://player.bilibili.com/player.html?bvid=${c.id}&page=${c.page}&autoplay=1&high_quality=1` };
    }
    case 'x': {
      // X 网页嵌入用的公开接口：token 由 id 算出来
      const token = ((Number(c.id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
      const d = await get(`https://cdn.syndication.twimg.com/tweet-result?id=${c.id}&token=${token}&lang=zh`);
      if (!d?.text) throw new Error('x');
      const text = String(d.text).slice(...(d.display_text_range ?? [0, d.text.length]) as [number, number]);
      const media = ((d.mediaDetails ?? []) as Array<{ type: string; media_url_https: string; original_info?: { width: number; height: number }; ext_alt_text?: string }>)
        .filter((m) => m.media_url_https).slice(0, 4)
        .map((m) => ({ src: m.media_url_https, w: m.original_info?.width ?? 1, h: m.original_info?.height ?? 1, ...(m.type !== 'photo' ? { video: true } : {}), ...(m.ext_alt_text ? { alt: m.ext_alt_text } : {}) }));
      return { desc: text, author: { name: d.user?.name, handle: d.user?.screen_name, avatar: d.user?.profile_image_url_https }, date: d.created_at && day(new Date(d.created_at).toISOString()), ...(media.length ? { media } : {}) };
    }
  }
  throw new Error(`不认识的网站 ${c.site}`);
}

/** 网址 → 卡片数据；不是能做卡片的网址返回 null */
export async function getCard(url: string): Promise<Card | null> {
  const c = cardOf(url) as Site | null;
  if (!c) return null;
  const base = { url, site: c.site, kind: c.kind } as Card;
  const store = load(), hit = store[url];
  if (hit && hit.v === V && Date.now() - hit.at < FRESH) return hit.card;
  try {
    const card = { ...base, ok: true, ...(await fetchCard(c)) };
    store[url] = { at: Date.now(), v: V, card };
    save();
    return card;
  } catch {
    return hit?.card ?? { ...base, ok: false };
  }
}
