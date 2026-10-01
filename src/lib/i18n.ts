/** 页面和组件里取词：语言来自 mori.config.ts 的 lang */
import config from 'virtual:mori/config';
import { makeT, makeFmt, clientDict, verticalOk } from '../i18n/index.ts';

export const lang = config.lang;
export const { t, tn } = makeT(lang);
export const fmt = makeFmt(lang);
/** 竖排文字 / 手卷方向只对中日文有意义 */
export const vertical = verticalOk(lang);
/** 内嵌进页面、给浏览器里的脚本用的词条 */
export const clientJson = JSON.stringify(clientDict(lang));
