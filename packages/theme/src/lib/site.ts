import config from 'virtual:mori/config';

/** 站点根地址：mori.config 的 site，其次是 Astro 的 site，都没有就用本地地址（只影响 RSS / sitemap 里的绝对链接） */
export const siteUrl = (astroSite?: URL) => (config.site ?? astroSite?.href ?? 'http://localhost:4321').replace(/\/$/, '');

export const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
