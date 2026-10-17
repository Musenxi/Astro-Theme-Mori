import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import config from 'virtual:mori/config';
import type { MoriCategory } from '../config.ts';

export type PostEntry = CollectionEntry<'posts'>;

/** 所有文章放进同一个列表：首页、目次、归档都是不分类型地看它们 */
export interface Entry {
  id: string;
  /** 站内地址 */
  href: string;
  /** 期号式编号：最早一篇是 1，越新越大（目次里显示成 001、002……） */
  n: number;
  category: MoriCategory;
  data: PostEntry['data'];
  raw: PostEntry;
}

const categories = new Map(config.categories.map((c) => [c.id, c]));

/** 最新的排最前。隐藏的文章默认不在里面；生成文章页自己的地址时传 { hidden: true } */
export async function getEntries({ hidden = false } = {}): Promise<Entry[]> {
  const list = (await getCollection('posts'))
    .filter((raw) => import.meta.env.DEV || !raw.data.draft)
    .sort((a, b) => a.data.date.getTime() - b.data.date.getTime() || a.id.localeCompare(b.id));

  let n = 0;
  return list
    .map((raw): Entry => {
      const category = categories.get(raw.data.category);
      if (!category) {
        throw new Error(
          `《${raw.data.title}》的分类 “${raw.data.category}” 没有在 mori.config.ts 的 categories 里定义（已有：${[...categories.keys()].join('、')}）`,
        );
      }
      return { id: raw.id, href: `/posts/${raw.id}/`, n: raw.data.hidden ? 0 : ++n, category, data: raw.data, raw };
    })
    .filter((e) => hidden || !e.data.hidden)
    .reverse();
}

/** 有 pin 的文章，按 pin.order（同序号新的在前） */
export function pinsOf(entries: Entry[]): Entry[] {
  return entries.filter((e) => e.data.pin).sort((a, b) => a.data.pin!.order - b.data.pin!.order || b.n - a.n);
}

/** 首页放的文章（三种版式共用）：置顶的在前（按 pin.order），不够 count 篇的用最新的补；置顶多于 count 篇就只取前 count 篇 */
export function homeEntries(entries: Entry[], count: number): Entry[] {
  const pins = pinsOf(entries);
  return [...pins, ...entries.filter((e) => !e.data.pin)].slice(0, count);
}
