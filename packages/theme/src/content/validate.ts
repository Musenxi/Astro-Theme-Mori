/**
 * 不依赖 Astro 虚拟模块（astro:content）的校验入口：Studio 保存前用同一份 schema 检查。
 * 图片字段这里只当字符串路径（真正的图片解析在构建时由 Astro 做）。
 */
import { z } from 'astro/zod';
import { postSchema, travelSchema } from './schema.ts';

export interface ValidationIssue {
  path: string;
  message: string;
}

const image = (() => z.string()) as any;

export function validateEntry(kind: 'post' | 'travel', data: unknown): { ok: boolean; errors: ValidationIssue[] } {
  const schema = (kind === 'post' ? postSchema : travelSchema)({ image });
  const r = schema.safeParse(data);
  if (r.success) return { ok: true, errors: [] };
  return { ok: false, errors: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
}
