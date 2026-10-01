/**
 * 界面语言（spec §9）：zh-CN / zh-TW / en / ja。简体中文是母版，其他语言必须覆盖同样的键（类型约束）。
 * 数字和日期的写法（汉字数字、期号、季节）按语言各自格式化。竖排和手卷方向只对中日文有意义，英文站自动关闭。
 */
import zhCN from './zh-CN.ts';
import zhTW from './zh-TW.ts';
import en from './en.ts';
import ja from './ja.ts';
import { cnNumber, cnYear, season as seasonOf } from '../lib/zh.ts';

export type Lang = 'zh-CN' | 'zh-TW' | 'en' | 'ja';
export type Key = keyof typeof zhCN;
export const LANGS: Lang[] = ['zh-CN', 'zh-TW', 'en', 'ja'];

const dicts: Record<Lang, Record<Key, string>> = { 'zh-CN': zhCN, 'zh-TW': zhTW, en, ja };

/** 竖排文字、手卷式横滚只对中日文内容有意义 */
export const verticalOk = (lang: Lang) => lang !== 'en';

const fill = (s: string, vars?: Record<string, string | number>) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

export function makeT(lang: Lang) {
  const d = dicts[lang] ?? zhCN;
  const t = (key: Key, vars?: Record<string, string | number>) => fill(d[key] ?? zhCN[key], vars);
  /** 单复数：{key}.one / {key}.other */
  const tn = (base: 'count', n: number, vars?: Record<string, string | number>) => t(`${base}.${n === 1 ? 'one' : 'other'}` as Key, { n, ...vars });
  return { t, tn };
}

/** 各语言的数字、年份、季节写法 */
export function makeFmt(lang: Lang) {
  const cjk = lang !== 'en';
  const { t } = makeT(lang);
  const num = (n: number) => (cjk ? cnNumber(n) : String(n));
  const year = (y: number) => (cjk ? cnYear(y) : String(y));
  const season = (month: number) => t(`season.${{ 春: 'spring', 夏: 'summer', 秋: 'autumn', 冬: 'winter' }[seasonOf(month)]}` as Key);
  return {
    num, year, season,
    yearSeason: (d: Date) => t('yearSeason', { year: year(d.getFullYear()), season: season(d.getMonth() + 1) }),
    stop: (i: number) => t('travel.stop', { n: num(i) }),
  };
}

/** 浏览器里的脚本用的词条（`js.` 开头），内嵌进页面 */
export function clientDict(lang: Lang) {
  const d = dicts[lang] ?? zhCN;
  return Object.fromEntries(Object.entries(d).filter(([k]) => k.startsWith('js.')));
}
