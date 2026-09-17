import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border bg-card text-card-foreground shadow-sm', className)}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-1 p-6 pb-3', className)}>{children}</div>
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('text-base font-semibold leading-none', className)}>{children}</h2>
}

export function CardDescription({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <p className={cn('text-sm text-muted-foreground', className)}>{children}</p>
}

export function CardContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-6 pt-0', className)}>{children}</div>
}

export function MetricCard({
  label,
  value,
  icon,
}: {
  label: string
  value: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm text-muted-foreground">{label}</div>
          <div
            className="mt-1 truncate text-xl font-semibold tabular-nums tracking-tight sm:text-2xl"
            title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}
          >
            {value}
          </div>
        </div>
        {icon && (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground [&_svg]:size-4">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
