import { AlertDialog, Dialog as D } from 'radix-ui';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './button';

/* ───────── 普通对话框 ───────── */
export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ title, description, children, className, wide }: { title: string; description?: string; children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-scrim backdrop-blur-[3px] data-[state=open]:animate-fade-in" />
      <D.Content
        className={cn(
          'fixed left-1/2 top-[12vh] z-50 max-h-[76vh] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 overflow-auto rounded-2xl bg-lift p-6 shadow-pop outline-none data-[state=open]:animate-pop',
          wide && 'w-[min(56rem,calc(100vw-2rem))]',
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-6">
          <div>
            <D.Title className="text-[17px] font-semibold tracking-tight">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close aria-label="关闭" className="-mr-2 -mt-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-ink/[.06] hover:text-ink"><X size={16} /></D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

/* ───────── 确认：替代浏览器的 confirm()，用法 `if (await confirm({...}))` ───────── */
interface ConfirmOptions { title: string; description?: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean }
type Confirm = (o: ConfirmOptions) => Promise<boolean>;
const Ctx = createContext<Confirm>(async () => false);
export const useConfirm = () => useContext(Ctx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>(() => {});
  const confirm = useCallback<Confirm>((o) => new Promise((resolve) => { resolver.current = resolve; setOpts(o); }), []);
  const close = (v: boolean) => { resolver.current(v); setOpts(null); };
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <AlertDialog.Root open={!!opts} onOpenChange={(o) => !o && close(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-scrim backdrop-blur-[3px] data-[state=open]:animate-fade-in" />
          <AlertDialog.Content className="fixed left-1/2 top-[22vh] z-[70] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl bg-lift p-6 shadow-pop outline-none data-[state=open]:animate-pop">
            <AlertDialog.Title className="text-[17px] font-semibold tracking-tight">{opts?.title}</AlertDialog.Title>
            <AlertDialog.Description asChild>
              <div className="mt-2 text-[13px] leading-relaxed text-ink-2">{opts?.description}</div>
            </AlertDialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <AlertDialog.Cancel asChild><Button onClick={() => close(false)}>{opts?.cancelLabel ?? '取消'}</Button></AlertDialog.Cancel>
              <AlertDialog.Action asChild><Button variant={opts?.danger ? 'destructive' : 'primary'} onClick={() => close(true)}>{opts?.confirmLabel ?? '确定'}</Button></AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Ctx.Provider>
  );
}
