/**
 * 项目文件的读写：Studio 直接读写站点项目里的内容文件（src/content/posts、src/content/travels、src/assets）。
 * 不需要 git；“删除”是移进 .mori-trash/，不会真的删掉。
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { loadConfigFromFile } from 'vite';

export const KINDS = { post: 'posts', travel: 'travels' };
const ID = /^[a-z0-9][a-z0-9_-]*$/i;
export const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg']);

export const isId = (s) => typeof s === 'string' && ID.test(s);
const dirOf = (root, kind) => join(root, 'src/content', KINDS[kind]);
const fileOf = (root, kind, id) => join(dirOf(root, kind), `${id}.json`);

/** mori.config.ts：用 Vite 的配置加载器读（会处理 TypeScript） */
export async function loadConfig(root) {
  const path = ['mori.config.ts', 'mori.config.mjs', 'mori.config.js'].map((f) => join(root, f)).find(existsSync);
  if (!path) throw new Error(`在 ${root} 里没找到 mori.config.ts。请在站点项目的根目录运行 mori-studio，或用 --root 指定。`);
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, path, root);
  return { path, config: loaded?.config ?? {} };
}

export function listEntries(root) {
  const out = [];
  for (const kind of Object.keys(KINDS)) {
    const dir = dirOf(root, kind);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const id = basename(f, '.json');
      try {
        const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        out.push({ kind, id, title: d.title ?? id, date: String(d.date ?? '').slice(0, 10), category: d.category, draft: !!d.draft, pinned: !!d.pin });
      } catch (e) {
        out.push({ kind, id, title: `${id}（JSON 有语法错误）`, date: '', broken: true });
      }
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export const readEntry = (root, kind, id) => JSON.parse(readFileSync(fileOf(root, kind, id), 'utf8'));

export function writeEntry(root, kind, id, data) {
  mkdirSync(dirOf(root, kind), { recursive: true });
  writeFileSync(fileOf(root, kind, id), JSON.stringify(data, null, 2) + '\n');
}

export const entryExists = (root, kind, id) => existsSync(fileOf(root, kind, id));

/** 新建：给一个能通过校验的最小骨架 */
export function skeleton(kind, { title, category }) {
  const base = { title, date: new Date().toISOString().slice(0, 10), category, excerpt: '' };
  if (kind === 'post') return { ...base, blocks: [{ id: 'b01', type: 'p', text: '' }] };
  return {
    ...base,
    facts: [],
    stops: [{ id: 's1', name: '起点', lnglat: [0, 0] }],
    reading: { default: 'v', allowed: ['v', 'h', 'mix'], direction: 'ltr' },
    blocks: [{ id: 't01', type: 'text', stop: 's1', paras: [{ id: 't01p1', text: '' }] }],
  };
}

/** “删除”：移进 .mori-trash/，带时间戳，随时能拿回来 */
export function trashEntry(root, kind, id) {
  const trash = join(root, '.mori-trash');
  mkdirSync(trash, { recursive: true });
  renameSync(fileOf(root, kind, id), join(trash, `${Date.now()}-${kind}-${id}.json`));
}

export function listAssets(root) {
  const dir = join(root, 'src/assets');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => IMAGE_EXT.has(extname(f).toLowerCase())).sort();
}

export function saveAsset(root, name, buffer) {
  const dir = join(root, 'src/assets');
  mkdirSync(dir, { recursive: true });
  // 只留文件名，去掉路径；不覆盖已有文件（同名就加序号）
  let safe = basename(name).replace(/[^\w.\-一-龥]+/g, '_');
  const ext = extname(safe), stem = safe.slice(0, safe.length - ext.length);
  let k = 1;
  while (existsSync(join(dir, safe))) safe = `${stem}-${++k}${ext}`;
  writeFileSync(join(dir, safe), buffer);
  return safe;
}
