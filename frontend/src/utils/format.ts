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
