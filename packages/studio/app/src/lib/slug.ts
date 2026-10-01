/** 新建文章的默认地址名：标题里有英文就用英文单词，否则用日期时间（中文标题没法直接当文件名）。可以在新建时改 */
export function suggestId(title: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const words = (title.match(/[A-Za-z0-9]+/g) ?? []).join('-').toLowerCase().slice(0, 40).replace(/-+$/, '');
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  const base = words.length >= 3 ? words : stamp;
  let id = base, k = 2;
  while (used.has(id)) id = `${base}-${k++}`;
  return id;
}

export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
