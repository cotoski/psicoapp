import { cva } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

const alertVariants = cva('rounded-md px-3 py-2.5 text-sm', {
  variants: {
    tone: {
      danger: 'bg-destructive/10 text-destructive',
      success: 'bg-success text-success-foreground',
      warning: 'bg-warning text-warning-foreground',
      info: 'bg-accent text-accent-foreground',
    },
  },
  defaultVariants: { tone: 'danger' },
})

export function Alert({
  tone = 'danger',
  className,
  children,
}: {
  tone?: 'danger' | 'success' | 'warning' | 'info'
  className?: string
  children: ReactNode
}) {
  return <div className={cn(alertVariants({ tone }), className)}>{children}</div>
}
