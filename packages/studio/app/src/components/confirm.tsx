import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from '@/components/ui/alert-dialog';

/* 确认：替代浏览器的 confirm()，用法 `if (await confirm({...}))` */
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
      <AlertDialog open={!!opts} onOpenChange={(o) => !o && close(false)}>
        <AlertDialogContent>
          <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
          <AlertDialogDescription asChild><div>{opts?.description}</div></AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>{opts?.cancelLabel ?? '取消'}</AlertDialogCancel>
            <AlertDialogAction variant={opts?.danger ? 'destructive' : 'default'} onClick={() => close(true)}>{opts?.confirmLabel ?? '确定'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Ctx.Provider>
  );
}
