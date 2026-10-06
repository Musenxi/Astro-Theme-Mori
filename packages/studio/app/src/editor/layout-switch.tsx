/**
 * “排版”视图：看这篇文章的读法设置决定摆哪一种——
 *   只允许横向 → 横滚排版；只允许竖向 / 混合（或没设读法）→ 竖向排版；
 *   两边都允许 → 按默认读法打开，工具条上能切换。
 */
import { useState } from 'react';
import type { Doc } from '@/lib/types';
import { Segmented } from '@/components/segmented';
import { useLayoutHistory } from './layout-history';
import { HorizontalLayout } from './layout-view';
import { VerticalLayout } from './layout-vertical';

type Axis = 'v' | 'h';

export function LayoutView({ doc, setDoc }: { doc: Doc; setDoc: (fn: (d: Doc) => Doc) => void }) {
  const hist = useLayoutHistory(doc, setDoc);
  const allowed: string[] = doc.reading?.allowed ?? ['v'];
  const canV = allowed.includes('v') || allowed.includes('mix'), canH = allowed.includes('h');
  const [pick, setPick] = useState<Axis | null>(null);
  const axis: Axis = canV && canH ? pick ?? (doc.reading?.default === 'h' ? 'h' : 'v') : canH ? 'h' : 'v';
  const switcher = canV && canH ? <Segmented size="sm" className="mr-1.5" value={axis} onValueChange={setPick} options={[{ value: 'v', label: '竖向' }, { value: 'h', label: '横向' }]} /> : null;
  return axis === 'h' ? <HorizontalLayout doc={doc} hist={hist} switcher={switcher} /> : <VerticalLayout doc={doc} hist={hist} switcher={switcher} />;
}
