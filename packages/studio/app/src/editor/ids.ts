/** 下一个块 id：同前缀里最大的序号 + 1，如 b07 → b08（id 创建后不再变，引用评论靠它定位） */
export function nextId(used: Iterable<string>, prefix: string, width = 2): string {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const id of used) { const m = id.match(re); if (m) max = Math.max(max, +m[1]); }
  return prefix + String(max + 1).padStart(width, '0');
}

/** 收集一篇里所有块 / 段落的 id */
export function allIds(blocks: unknown): string[] {
  const ids: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') { const o = v as Record<string, unknown>; if (typeof o.id === 'string') ids.push(o.id); Object.values(o).forEach(walk); }
  };
  walk(blocks);
  return ids;
}
