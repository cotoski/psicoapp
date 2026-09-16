const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const timeFmt = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })

export function fmtMoney(value: number | string): string {
  return brl.format(Number(value))
}

export function fmtDate(iso: string | Date): string {
  return dateFmt.format(new Date(iso))
}

export function fmtDateTime(iso: string | Date): string {
  return dateTimeFmt.format(new Date(iso))
}

export function fmtTime(iso: string | Date): string {
  return timeFmt.format(new Date(iso))
}

// Máscara 000.000.000-00 aplicada durante a digitação.
export function maskCpf(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}
