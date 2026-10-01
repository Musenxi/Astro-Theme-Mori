/**
 * 友人帐里“填网址自动带出站名、简介、头像”：抓对方首页的 <title>、description、图标。
 * 只在本机 Studio 里用；仍然拒绝本机和内网地址，免得被人拿来探内网。
 */
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

export function isPrivateAddress(ip) {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v.startsWith('::ffff:10.') || v.startsWith('::ffff:192.168.');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();

/** 从首页 HTML 里取出站名、简介、图标（图标是绝对地址） */
export function parseSiteHtml(html, base) {
  const head = html.slice(0, 200_000);
  const attr = (tag, name) => tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))?.slice(2).find((x) => x !== undefined);
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (key) => { const t = metas.find((m) => new RegExp(`(name|property)\\s*=\\s*["']${key}["']`, 'i').test(m)); return t ? attr(t, 'content') : undefined; };
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const icon = (rels) => { for (const r of rels) { const t = links.find((l) => new RegExp(`rel\\s*=\\s*["'][^"']*\\b${r}\\b[^"']*["']`, 'i').test(l)); const href = t && attr(t, 'href'); if (href) return href; } };
  const abs = (h) => { try { return new URL(h, base).href; } catch { return undefined; } };
  const iconHref = icon(['apple-touch-icon', 'icon', 'shortcut icon']) ?? '/favicon.ico';
  return {
    name: decode(meta('og:site_name') ?? title ?? ''),
    desc: decode(meta('description') ?? meta('og:description') ?? ''),
    avatar: abs(iconHref),
  };
}

async function assertPublic(u) {
  if (!/^https?:$/.test(u.protocol)) throw new Error('网址要以 http:// 或 https:// 开头');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => { throw new Error('找不到这个网站（域名解析失败）'); })).map((a) => a.address);
  if (addrs.some(isPrivateAddress)) throw new Error('不能读取本机或内网地址');
}

/** 读对方首页（最多跳转 4 次，每一跳都检查地址；最多读 512KB） */
export async function probeSite(input) {
  let u = new URL(input);
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(u);
    const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 (MORI Studio)', Accept: 'text/html' } }).catch((e) => { throw new Error(e.name === 'TimeoutError' ? '等了 8 秒，对方没有响应' : '连不上这个网站'); });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location'), u); continue; }
    if (!r.ok) throw new Error(`对方返回了 ${r.status}`);
    const reader = r.body.getReader();
    let got = 0; const chunks = [];
    while (got < 512 * 1024) { const { value, done } = await reader.read(); if (done) break; chunks.push(value); got += value.length; }
    reader.cancel().catch(() => {});
    return parseSiteHtml(Buffer.concat(chunks).toString('utf8'), u.href);
  }
  throw new Error('跳转太多次');
}
