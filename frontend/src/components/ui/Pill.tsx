import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export function Pill({
  active,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        className,
      )}
      {...rest}
    />
  )
}
