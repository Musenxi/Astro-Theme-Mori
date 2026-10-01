import type { ReactNode } from 'react';
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';

/** 带标题的对话框内容：标题在上，可选一行说明，`wide` 用于图库和块细节这类宽内容 */
export function ModalContent({ title, description, children, className, wide }: { title: string; description?: string; children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <DialogContent className={cn(wide && 'w-[min(56rem,calc(100vw-2rem))]', className)}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
      </DialogHeader>
      {children}
    </DialogContent>
  );
}
