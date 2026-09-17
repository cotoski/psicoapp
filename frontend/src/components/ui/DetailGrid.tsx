import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function DetailGrid({
  items,
  className,
}: {
  items: { label: string; value: ReactNode }[]
  className?: string
}) {
  return (
    <dl className={cn('grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3', className)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{it.label}</dt>
          <dd className="mt-0.5 truncate text-sm font-medium" title={typeof it.value === 'string' ? it.value : undefined}>
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
