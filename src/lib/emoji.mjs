/**
 * 表情包：扫描站点 public/emoji/。一级子文件夹是一个包，里面的图片每张是一个表情，文件名（去掉扩展名）是表情名；
 * 包里可以放 pack.json 登记图片链接：{ "title": "显示名", "items": { "狗头": "https://…/doge.png" } }。
 * 正文和评论里写 :[包名_表情名]。同名时 pack.json 里写的链接优先。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const IMAGE = /^\.(png|gif|webp|svg|avif|jpe?g)$/i;

/**
 * @param {string} publicDir
 * @param {(message: string) => void} [warn]
 * → { packs: [{ id, title, items: [{ name, key, url }] }], map: { 包名_表情名: 图片地址 } } */
export function scanEmoji(publicDir, warn = () => {}) {
  const root = join(publicDir, 'emoji');
  /** @type {Array<{ id: string; title: string; items: Array<{ name: string; key: string; url: string }> }>} */
  const packs = [];
  /** @type {Record<string, string>} */
  const map = {};
  if (!existsSync(root)) return { packs, map };
  for (const dir of readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name, 'zh'))) {
    const id = dir.name;
    if (/[\s:\[\]]/.test(id)) { warn(`表情包文件夹名不能有空格、冒号和方括号，已跳过：${id}`); continue; }
    const found = new Map();
    for (const f of readdirSync(join(root, id)).sort((a, b) => a.localeCompare(b, 'zh', { numeric: true }))) {
      if (!IMAGE.test(extname(f))) continue;
      const name = f.slice(0, -extname(f).length);
      if (/[\s:\[\]]/.test(name)) { warn(`表情名不能有空格、冒号和方括号，已跳过：${id}/${f}`); continue; }
      found.set(name, `/emoji/${encodeURIComponent(id)}/${encodeURIComponent(f)}`);
    }
    let title = id;
    const meta = join(root, id, 'pack.json');
    if (existsSync(meta)) {
      try {
        const j = JSON.parse(readFileSync(meta, 'utf8'));
        if (typeof j.title === 'string' && j.title) title = j.title;
        for (const [name, url] of Object.entries(j.items ?? {})) {
          if (/[\s:\[\]]/.test(name) || typeof url !== 'string') { warn(`pack.json 里的表情已跳过：${id}/${name}`); continue; }
          found.set(name, url);
        }
      } catch (e) { warn(`pack.json 读不了：${id}（${e.message}）`); }
    }
    if (!found.size) continue;
    const items = [...found].map(([name, url]) => ({ name, key: `${id}_${name}`, url }));
    for (const it of items) map[it.key] = it.url;
    packs.push({ id, title, items });
  }
  return { packs, map };
}
