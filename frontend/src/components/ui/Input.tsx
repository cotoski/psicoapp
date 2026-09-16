import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

export function Input({ label, error, id, ...rest }: InputProps) {
  return (
    <div className="form-group">
      <label htmlFor={id ?? rest.name}>{label}</label>
      <input id={id ?? rest.name} {...rest} />
      {error && <div className="form-error">{error}</div>}
    </div>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string
}

export function Textarea({ label, error, id, ...rest }: TextareaProps) {
  return (
    <div className="form-group">
      <label htmlFor={id ?? rest.name}>{label}</label>
      <textarea id={id ?? rest.name} {...rest} />
      {error && <div className="form-error">{error}</div>}
    </div>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string
  options: { value: string; label: string }[]
}

export function Select({ label, error, id, options, ...rest }: SelectProps) {
  return (
    <div className="form-group">
      <label htmlFor={id ?? rest.name}>{label}</label>
      <select id={id ?? rest.name} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <div className="form-error">{error}</div>}
    </div>
  )
}
