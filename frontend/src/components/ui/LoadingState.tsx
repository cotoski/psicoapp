import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function Loading() {
  return <div className="py-8 text-sm text-muted-foreground">Carregando…</div>
}

export function Empty({
  icon,
  children,
  className,
}: {
  icon?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 py-10 text-center', className)}>
      {icon && <div className="text-muted-foreground/50 [&_svg]:size-8">{icon}</div>}
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

export function SkeletonRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl border bg-card" />
      ))}
    </div>
  )
}
