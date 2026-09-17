import { Video } from 'lucide-react'
import { cn } from '../lib/utils'

// Extrai uma URL navegável do campo "sala/link" do paciente.
// Aceita "https://…" ou domínio sem protocolo ("meet.google.com/abc");
// textos livres ("Sala 2") não viram link.
export function meetingUrl(sala: string | null | undefined): string | null {
  const v = sala?.trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/i.test(v)) return `https://${v}`
  return null
}

export function MeetingLink({ sala, className }: { sala: string | null; className?: string }) {
  const url = meetingUrl(sala)
  if (!url) return <>{sala ?? '—'}</>
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline',
        className,
      )}
    >
      <Video className="size-3.5 shrink-0" />
      Entrar na sala
    </a>
  )
}
