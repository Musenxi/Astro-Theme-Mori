/**
 * 第三方评论（spec §5.2）：giscus / waline / twikoo / artalk。只有文末评论，没有划词引用评论。
 * 都是进入视口才加载脚本；每次换页都用新的页面标识重新加载；昼夜切换时同步给评论框。
 * 脚本和样式来自各家的 CDN（jsdelivr / unpkg / giscus.app）。
 */
import { t } from './i18n.ts';
type Cfg = Record<string, any> & { provider: string };

const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};

const loaded = new Map<string, Promise<void>>();
function loadScript(src: string) {
  if (!loaded.has(src)) loaded.set(src, new Promise<void>((ok, fail) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = () => ok(); s.onerror = () => { loaded.delete(src); fail(new Error(t('js.cmt.scriptFail', { src }))); };
    document.head.appendChild(s);
  }));
  return loaded.get(src)!;
}
function loadCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href;
  document.head.appendChild(l);
}

/** 昼夜切换时通知评论框（<html data-theme> 变了） */
function onThemeChange(fn: () => void) {
  const mo = new MutationObserver(fn);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fn);
  return () => mo.disconnect();
}

export async function mountEmbed(cfg: Cfg, host: HTMLElement, page: { entry: string; title: string }) {
  host.replaceChildren();
  const box = document.createElement('div');
  box.className = 'cmt-embed';
  host.append(box);
  const path = `/${page.entry}/`;

  switch (cfg.provider) {
    case 'giscus': {
      const s = document.createElement('script');
      s.src = 'https://giscus.app/client.js';
      s.async = true; s.crossOrigin = 'anonymous';
      const set: Record<string, string> = {
        'data-repo': cfg.repo, 'data-repo-id': cfg.repoId, 'data-category': cfg.category, 'data-category-id': cfg.categoryId,
        'data-mapping': cfg.mapping ?? 'pathname', 'data-strict': '0', 'data-reactions-enabled': '0', 'data-emit-metadata': '0',
        'data-input-position': 'bottom', 'data-theme': isDark() ? 'dark' : 'light', 'data-lang': 'zh-CN', 'data-loading': 'lazy',
      };
      for (const [k, v] of Object.entries(set)) s.setAttribute(k, v);
      box.append(s);
      onThemeChange(() => {
        const f = box.querySelector<HTMLIFrameElement>('iframe.giscus-frame');
        f?.contentWindow?.postMessage({ giscus: { setConfig: { theme: isDark() ? 'dark' : 'light' } } }, 'https://giscus.app');
      });
      break;
    }
    case 'waline': {
      loadCss('https://unpkg.com/@waline/client@v3/dist/waline.css');
      await loadScript('https://unpkg.com/@waline/client@v3/dist/waline.umd.js');
      (window as any).Waline.init({ el: box, serverURL: cfg.serverURL, path, lang: 'zh-CN', dark: 'html[data-theme="dark"]', pageview: false, comment: false });
      break;
    }
    case 'twikoo': {
      await loadScript('https://cdn.jsdelivr.net/npm/twikoo@1/dist/twikoo.min.js');
      box.id = 'twikoo';
      await (window as any).twikoo.init({ envId: cfg.envId, el: '#twikoo', path });
      break;
    }
    case 'artalk': {
      loadCss('https://cdn.jsdelivr.net/npm/artalk@2/dist/Artalk.css');
      await loadScript('https://cdn.jsdelivr.net/npm/artalk@2/dist/Artalk.js');
      const artalk = (window as any).Artalk.init({ el: box, server: cfg.server, site: cfg.site ?? location.hostname, pageKey: path, pageTitle: page.title, darkMode: isDark() });
      onThemeChange(() => artalk.setDarkMode?.(isDark()));
      break;
    }
    default:
      throw new Error(t('js.cmt.unknown', { provider: cfg.provider }));
  }
}

export {};
