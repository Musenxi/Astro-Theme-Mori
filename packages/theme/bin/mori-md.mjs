#!/usr/bin/env node
/**
 * Markdown ⇄ MORI JSON（spec §3.3：Markdown 只用于导入导出，不是存储格式）
 *
 *   mori-md import 旧文章.md [--out src/content/posts] [--category essays]   → 写出同名 .json
 *   mori-md export src/content/posts/xxx.json [--out 备份目录]                → 写出同名 .md
 *
 * 只处理普通文章：段落、## / ### 标题、引用、图片（带引号的标题作图注）、列表、围栏代码、
 * 行内的 **粗** *斜* `码` [链接](地址)，以及 [^id] 脚注。游记的块（位置参数、自由排布……）没有 Markdown 对应物，不导入导出。
 * 导入时块 id 从 b01 顺序编；导入后请自己检查 category、excerpt，并把图片文件放到 JSON 里写的相对路径。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { markdownToPost, postToMarkdown } from '../src/lib/markdown.mjs';

/* ───────────── CLI ───────────── */
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [cmd, file, ...rest] = process.argv.slice(2);
  const opt = (name, def) => { const k = rest.indexOf(`--${name}`); return k >= 0 ? rest[k + 1] : def; };
  if (!['import', 'export'].includes(cmd) || !file) {
    console.error('用法：mori-md import <文件.md> [--out 目录] [--category id]\n      mori-md export <文件.json> [--out 目录]');
    process.exit(1);
  }
  const name = basename(file, extname(file));
  if (cmd === 'import') {
    const dir = opt('out', 'src/content/posts');
    mkdirSync(dir, { recursive: true });
    const post = markdownToPost(readFileSync(file, 'utf8'), { category: opt('category', 'essays') });
    const target = join(dir, `${name}.json`);
    writeFileSync(target, JSON.stringify(post, null, 2) + '\n');
    console.log(`已写出 ${target}（${post.blocks.length} 个块）。请检查 category / excerpt，并把图片放到 JSON 里写的路径。`);
  } else {
    const dir = opt('out', '.');
    mkdirSync(dir, { recursive: true });
    const target = join(dir, `${name}.md`);
    writeFileSync(target, postToMarkdown(JSON.parse(readFileSync(file, 'utf8'))));
    console.log(`已写出 ${target}`);
  }
}
