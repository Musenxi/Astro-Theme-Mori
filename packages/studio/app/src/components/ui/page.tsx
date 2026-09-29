import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** 页面顶栏：标题在左，操作在右；下面一条细线 */
export function PageHeader({ title, sub, actions, className }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn('sticky top-0 z-10 flex min-h-[3.25rem] items-center gap-4 border-b border-rule bg-paper/85 px-8 py-2 backdrop-blur-md', className)}>
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <h1 className="serif truncate text-[18px] tracking-[.14em]">{title}</h1>
        {sub && <span className="label mono truncate">{sub}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </header>
  );
}

/** 页面主体：限宽、居中、进入时轻轻上浮 */
export function Body({ children, wide, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return <div className={cn('mx-auto animate-rise px-8 pb-24 pt-8', wide ? 'max-w-[68rem]' : 'max-w-[46rem]', className)}>{children}</div>;
}

export function Section({ title, hint, children, className }: { title: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mt-10 border-t border-ink pt-3 first:mt-0 first:border-t-0 first:pt-0', className)}>
      <h2 className="mb-2 flex items-baseline gap-3 text-[12px] tracking-[.22em] text-ink-3">{title}{hint && <span className="mono normal-case tracking-normal">{hint}</span>}</h2>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-6 py-16 text-center text-[13px] text-ink-3">{children}</div>;
}
