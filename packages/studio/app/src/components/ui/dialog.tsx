import { Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}
function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}
function DialogPortal(props: ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}
function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay data-slot="dialog-overlay" className={cn('fixed inset-0 z-40 bg-overlay backdrop-blur-3xs data-[state=open]:animate-fade-in', className)} {...props} />;
}

/** flush：不留内边距（里面的内容自己排，比如命令面板） */
function DialogContent({ className, children, showCloseButton = true, flush = false, ...props }: ComponentProps<typeof DialogPrimitive.Content> & { showCloseButton?: boolean; flush?: boolean }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn('fixed left-1/2 top-[12vh] z-50 max-h-[76vh] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 overflow-auto rounded-2xl bg-popover p-6 text-popover-foreground shadow-pop outline-none data-[state=open]:animate-pop', flush && 'p-0', className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" aria-label="关闭" className="absolute right-4 top-4.5 grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[.06] hover:text-foreground">
            <X size={16} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('mb-4 pr-12', className)} {...props} />;
}

function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="dialog-footer" className={cn('mt-6 flex justify-end gap-2', className)} {...props} />;
}

function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn('text-17 font-semibold tracking-tight', className)} {...props} />;
}

function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn('mt-1 text-12-5 leading-relaxed text-muted-foreground', className)} {...props} />;
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger };
