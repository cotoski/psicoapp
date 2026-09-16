import type { ReactNode } from 'react'

type Tone = 'success' | 'warning' | 'danger' | 'accent'

export function Badge({ tone = 'accent', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}
