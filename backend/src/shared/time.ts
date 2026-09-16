// Fuso do negócio: Brasil (sem DST desde 2019 → -03:00 fixo).
// Datas/horários sem offset informados pelo usuário significam horário
// local de São Paulo — nunca o fuso do servidor (UTC em produção).
// TODO(produto): timezone por tenant quando houver usuários fora de BRT.
export const BRAZIL_OFFSET = '-03:00'
export const BRAZIL_TZ = 'America/Sao_Paulo'

const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/

// 'YYYY-MM-DDTHH:mm' naive → Date em São Paulo; com offset explícito → como veio.
export function parseLocalDateTime(iso: string): Date {
  return new Date(HAS_OFFSET.test(iso) ? iso : `${iso}${BRAZIL_OFFSET}`)
}

// 'YYYY-MM-DD' + 'HH:MM' → instante em São Paulo.
export function localDateTimeToDate(date: string, time: string): Date {
  const [h = '0', m = '0'] = time.split(':')
  return new Date(`${date}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00${BRAZIL_OFFSET}`)
}

// Data civil de hoje em São Paulo (YYYY-MM-DD).
export function todayInBrazil(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BRAZIL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
