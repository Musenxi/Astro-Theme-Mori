import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';

export type PageEntry = CollectionEntry<'pages'>;
export type FriendEntry = CollectionEntry<'friends'>;

/** 页面：正式站里不出现草稿；隐藏的默认不在里面（导航、站点地图），生成页面自己的地址时传 { hidden: true } */
export async function getPages({ hidden = false } = {}): Promise<PageEntry[]> {
  return (await getCollection('pages')).filter((p) => (import.meta.env.DEV || !p.data.draft) && (hidden || !p.data.hidden)).sort((a, b) => a.id.localeCompare(b.id));
}

/** 友人帐：按 order 排，order 相同的保持文件里的先后 */
export async function getFriends(): Promise<FriendEntry[]> {
  const list = await getCollection('friends');
  return list.map((f, i) => ({ f, i })).sort((a, b) => a.f.data.order - b.f.data.order || a.i - b.i).map((x) => x.f);
}
