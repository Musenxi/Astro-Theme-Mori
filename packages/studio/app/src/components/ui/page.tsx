import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** 页面顶栏：标题在左，操作在右。没有分隔线，底下的内容从它后面滑过去，靠毛玻璃分开 */
export function PageHeader({ title, sub, actions, className }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn('sticky top-0 z-10 flex min-h-[4rem] items-center gap-4 bg-surface/80 px-10 py-3 backdrop-blur-xl', className)}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <h1 className="truncate text-[21px] font-semibold tracking-tight">{title}</h1>
        {sub && <span className="mono shrink-0 rounded-full bg-ink/[.06] px-2.5 py-0.5 text-ink-3">{sub}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </header>
  );
}

/** 页面主体：限宽、居中、进入时轻轻上浮 */
export function Body({ children, wide, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return <div className={cn('mx-auto animate-rise px-10 pb-24 pt-4', wide ? 'max-w-[68rem]' : 'max-w-[48rem]', className)}>{children}</div>;
}

/** 一个分区：小标题在上，内容在下；分区之间只靠留白隔开 */
export function Section({ title, hint, children, className }: { title: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mt-10 first:mt-0', className)}>
      <h2 className="mb-3 flex items-baseline gap-3 text-[14px] font-semibold">{title}{hint && <span className="text-[12px] font-normal text-ink-3">{hint}</span>}</h2>
      {children}
    </section>
  );
}

/** 浅色底的圆角面里的输入框改用白底，才和面区分得开 */
export const onCard = '[--field-hover:var(--lift)] [--field-shadow:var(--sh-soft)] [--field:var(--lift)]';

/** 浅色底的圆角面：放一组相关的内容 */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-xl bg-sunk/70 p-5', onCard, className)}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-6 py-16 text-center text-[13px] text-ink-3">{children}</div>;
}
