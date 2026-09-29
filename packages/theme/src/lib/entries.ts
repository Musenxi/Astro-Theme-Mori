import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import config from 'virtual:mori/config';
import type { MoriCategory } from '../config.ts';

export type PostEntry = CollectionEntry<'posts'>;
export type TravelEntry = CollectionEntry<'travels'>;

/** 文章和游记放进同一个列表：首页、目次、归档都是不分类型地看它们 */
export interface Entry {
  kind: 'post' | 'travel';
  id: string;
  /** 站内地址 */
  href: string;
  /** 期号式编号：最早一篇是 1，越新越大（目次里显示成 001、002……） */
  n: number;
  category: MoriCategory;
  data: PostEntry['data'] | TravelEntry['data'];
  raw: PostEntry | TravelEntry;
}

const categories = new Map(config.categories.map((c) => [c.id, c]));

/** 最新的排最前 */
export async function getEntries(): Promise<Entry[]> {
  const [posts, travels] = await Promise.all([getCollection('posts'), getCollection('travels')]);
  const list = [
    ...posts.map((raw) => ({ kind: 'post' as const, raw })),
    ...travels.map((raw) => ({ kind: 'travel' as const, raw })),
  ]
    .filter(({ raw }) => import.meta.env.DEV || !raw.data.draft)
    .sort((a, b) => a.raw.data.date.getTime() - b.raw.data.date.getTime() || a.raw.id.localeCompare(b.raw.id));

  return list
    .map(({ kind, raw }, i): Entry => {
      const category = categories.get(raw.data.category);
      if (!category) {
        throw new Error(
          `《${raw.data.title}》的栏目 “${raw.data.category}” 没有在 mori.config.ts 的 categories 里定义（已有：${[...categories.keys()].join('、')}）`,
        );
      }
      return { kind, id: raw.id, href: `/${kind === 'post' ? 'posts' : 'travels'}/${raw.id}/`, n: i + 1, category, data: raw.data, raw };
    })
    .reverse();
}

/** 首页“本期收录”：有 pin 的文章按 pin.order；一篇都没有就退回最新的一篇。最多四篇 */
export function pinnedOf(entries: Entry[]): Entry[] {
  const pins = entries.filter((e) => e.data.pin).sort((a, b) => a.data.pin!.order - b.data.pin!.order || b.n - a.n);
  return (pins.length ? pins : entries.slice(0, 1)).slice(0, 4);
}
