import type { ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
  small?: boolean
}

export function Button({ variant = 'primary', small, className = '', ...rest }: Props) {
  const classes = [
    'btn',
    variant === 'secondary' ? 'btn-secondary' : '',
    small ? 'btn-small' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return <button className={classes} {...rest} />
}
