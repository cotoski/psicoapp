import { cva } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

type Tone = 'success' | 'warning' | 'danger' | 'accent'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        accent: 'bg-accent text-accent-foreground',
        success: 'bg-success text-success-foreground',
        warning: 'bg-warning text-warning-foreground',
        danger: 'bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: { tone: 'accent' },
  },
)

export function Badge({
  tone = 'accent',
  className,
  children,
}: {
  tone?: Tone
  className?: string
  children: ReactNode
}) {
  return <span className={cn(badgeVariants({ tone }), className)}>{children}</span>
}
