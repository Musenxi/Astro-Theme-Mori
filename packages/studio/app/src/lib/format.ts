export const wan = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, '')}万` : n.toLocaleString('zh-CN'));
export const shortDate = (d: string) => d.slice(0, 10);

/** 正文字数：中日文按字、西文按词，代码块不计（和服务端 wordCount 是同一套规则） */
export function countWords(doc: { blocks?: unknown; notes?: unknown }): number {
  const texts: string[] = [];
  const collect = (v: unknown) => {
    if (Array.isArray(v)) {
      if (v.length && v.every((x) => x && typeof x === 'object' && 't' in (x as object))) texts.push(v.map((s) => (s as { t: string }).t).join(''));
      else v.forEach((x) => (typeof x === 'string' ? texts.push(x) : collect(x)));
    } else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (o.type === 'code') return;
      for (const [k, x] of Object.entries(o)) { if (k === 'text' && typeof x === 'string') texts.push(x); else collect(x); }
    }
  };
  collect(doc.blocks); collect(doc.notes);
  const all = texts.join('\n');
  return (all.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g)?.length ?? 0) + (all.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0);
}
