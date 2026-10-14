/**
 * 代码块的高亮：构建时用 Shiki 切成带颜色的片段，颜色是 CSS 变量（--code-*，在 base.css 里，分昼夜两套），跟着主题走。
 * 语言按作者写的 lang 认（ts、typescript 都行）；Shiki 不认识的（txt 之类）当纯文本，行标记照样生效。
 * 行标记：highlight（"1,3-5"）高亮这几行；行尾注释 [!code highlight]、[!code ++]、[!code --] 标出高亮、增、删（注释本身不显示）。
 * 每行是一个 span.line，带 highlighted / diff add / diff remove，样式在 code.css。
 */
import { bundledLanguages, bundledLanguagesInfo, createCssVariablesTheme, createHighlighter, type BundledLanguage, type Highlighter } from 'shiki';
import { transformerMetaHighlight, transformerNotationDiff, transformerNotationHighlight } from '@shikijs/transformers';

const theme = createCssVariablesTheme({ name: 'mori', variablePrefix: '--code-', fontStyle: true });
let hl: Promise<Highlighter> | null = null;

const known = (lang?: string): lang is BundledLanguage => !!lang && lang.toLowerCase() in bundledLanguages;

/** 标头上的语言名：认识的用正式名（TypeScript），不认识的照作者写的 */
export function langName(lang?: string) {
  if (!lang) return '';
  const l = lang.toLowerCase();
  return bundledLanguagesInfo.find((i) => i.id === l || i.aliases?.includes(l))?.name ?? lang;
}

/** 返回放进 <code> 里的 HTML */
export async function highlight(code: string, lang?: string, lines?: string) {
  const l = known(lang) ? (lang.toLowerCase() as BundledLanguage) : 'text';
  const h = await (hl ??= createHighlighter({ themes: [theme], langs: [] }));
  if (l !== 'text' && !h.getLoadedLanguages().includes(l)) await h.loadLanguage(l);
  const html = h.codeToHtml(code, {
    lang: l, theme: 'mori',
    meta: { __raw: lines ? `{${lines}}` : '' },
    transformers: [transformerMetaHighlight(), transformerNotationHighlight({ matchAlgorithm: 'v3' }), transformerNotationDiff({ matchAlgorithm: 'v3' })],
  });
  return html.match(/<code>([\s\S]*)<\/code>/)?.[1] ?? '';
}
