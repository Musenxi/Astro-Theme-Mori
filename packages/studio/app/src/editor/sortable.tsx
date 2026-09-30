import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** 竖向可拖动排序的列表（鼠标拖手柄，或键盘：聚焦手柄，空格拿起，方向键移动） */
export function SortableList<T>({ items, getId, onReorder, children }: { items: T[]; getId: (t: T) => string; onReorder: (next: T[]) => void; children: ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = items.map(getId);
  const end = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(items, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>{children}</SortableContext>
    </DndContext>
  );
}

/** 列表里的一项：带拖动手柄的外壳。children 是个函数，拿到手柄去放在合适的位置 */
export function SortableItem({ id, className, children }: { id: string; className?: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button ref={setActivatorNodeRef} type="button" aria-label="拖动排序" {...attributes} {...listeners} className="grid h-8 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-ink-3/70 transition-colors hover:text-ink active:cursor-grabbing">
      <GripVertical size={15} />
    </button>
  );
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && 'relative z-20 bg-lift opacity-95 shadow-pop', className)}>
      {children(handle)}
    </div>
  );
}
