import { defineMoriConfig } from './src/config.ts';

// 站点配置：只写要改的项，其余用主题的默认值（每一项的说明见 src/config.ts）。
// Studio 的“设定”页也会改这个文件。
export default defineMoriConfig({
  title: 'MORI',
  description: '一本安静的个人刊物：文章、游记、照片。',
  categories: [
    { id: 'essays', zh: '随笔', en: 'Essays', empty: '没写随笔' },
    { id: 'reading', zh: '读书', en: 'Reading', empty: '没写读书笔记' },
    { id: 'journeys', zh: '游记', en: 'Journeys', empty: '没写游记' },
  ],
});
