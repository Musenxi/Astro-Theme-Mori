/**
 * 代码块的高亮：构建时用 Shiki 切成带颜色的片段，颜色是 CSS 变量（--code-*，在 base.css 里，分昼夜两套），跟着主题走。
 * 语言按作者写的 lang 认（ts、typescript 都行）；Shiki 不认识的（txt 之类）原样输出。
 */
import { bundledLanguages, bundledLanguagesInfo, createCssVariablesTheme, createHighlighter, type BundledLanguage, type Highlighter } from 'shiki';

const theme = createCssVariablesTheme({ name: 'mori', variablePrefix: '--code-', fontStyle: true });
let hl: Promise<Highlighter> | null = null;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const known = (lang?: string): lang is BundledLanguage => !!lang && lang.toLowerCase() in bundledLanguages;

/** 标头上的语言名：认识的用正式名（TypeScript），不认识的照作者写的 */
export function langName(lang?: string) {
  if (!lang) return '';
  const l = lang.toLowerCase();
  return bundledLanguagesInfo.find((i) => i.id === l || i.aliases?.includes(l))?.name ?? lang;
}

/** 返回放进 <code> 里的 HTML */
export async function highlight(code: string, lang?: string) {
  if (!known(lang)) return esc(code);
  const l = lang.toLowerCase() as BundledLanguage;
  const h = await (hl ??= createHighlighter({ themes: [theme], langs: [] }));
  if (!h.getLoadedLanguages().includes(l)) await h.loadLanguage(l);
  const { tokens } = h.codeToTokens(code, { lang: l, theme: 'mori' });
  return tokens.map((line) => line.map((t) => {
    const style = [t.color && `color:${t.color}`, t.fontStyle && t.fontStyle & 1 && 'font-style:italic', t.fontStyle && t.fontStyle & 2 && 'font-weight:bold'].filter(Boolean).join(';');
    return style ? `<span style="${style}">${esc(t.content)}</span>` : esc(t.content);
  }).join('')).join('\n');
}
