import type { ReactNode } from 'react'
import { Brain } from 'lucide-react'

// Moldura das telas públicas de autenticação (login, recuperar, redefinir).
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-accent/70 via-background to-secondary/70 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md">
            <Brain className="size-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">PsicoApp</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestão do seu consultório</p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-md">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  )
}
