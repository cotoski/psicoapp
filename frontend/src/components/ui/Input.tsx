import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

export const fieldClass =
  'flex w-full rounded-md border border-input bg-card px-3 py-1 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50'

function FieldShell({
  label,
  error,
  htmlFor,
  children,
}: {
  label: string
  error?: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="mb-5">
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
      {error && <div className="mt-1 text-xs text-destructive">{error}</div>}
    </div>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

export function Input({ label, error, id, className, ...rest }: InputProps) {
  return (
    <FieldShell label={label} error={error} htmlFor={id ?? rest.name}>
      <input
        id={id ?? rest.name}
        className={cn(fieldClass, 'h-9', error && 'border-destructive ring-destructive/30', className)}
        {...rest}
      />
    </FieldShell>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string
}

export function Textarea({ label, error, id, className, ...rest }: TextareaProps) {
  return (
    <FieldShell label={label} error={error} htmlFor={id ?? rest.name}>
      <textarea
        id={id ?? rest.name}
        className={cn(
          fieldClass,
          'min-h-24 resize-y py-2',
          error && 'border-destructive ring-destructive/30',
          className,
        )}
        {...rest}
      />
    </FieldShell>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string
  options: { value: string; label: string }[]
}

export function Select({ label, error, id, options, className, ...rest }: SelectProps) {
  return (
    <FieldShell label={label} error={error} htmlFor={id ?? rest.name}>
      <div className="relative">
        <select
          id={id ?? rest.name}
          className={cn(
            fieldClass,
            'h-9 appearance-none pr-8',
            error && 'border-destructive ring-destructive/30',
            className,
          )}
          {...rest}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </FieldShell>
  )
}
