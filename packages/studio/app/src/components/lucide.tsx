import { createElement, useEffect, useState } from 'react';

type Lib = typeof import('astro-mori/lucide');
let lib: Lib | undefined;
let loading: Promise<Lib> | undefined;

/** Lucide 的全部图标（两千多个）单独成块，用到时才加载，不进主包 */
function load() {
  return (loading ??= import('astro-mori/lucide').then((m) => (lib = m)));
}

export function useIcons() {
  const [l, setL] = useState(lib);
  useEffect(() => { if (!lib) load().then(setL); }, []);
  return l;
}

/** 按名字（kebab-case）画一个 Lucide 图标；名字不存在就空着 */
export function Glyph({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  const node = useIcons()?.iconNode(name);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {node?.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}
