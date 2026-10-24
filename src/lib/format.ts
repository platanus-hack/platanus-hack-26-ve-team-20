// Formatos de pantalla (docs/p4-prompt-claude-design-c.md): "Bs. 1.250,00", 24/10/2026, 24 h, hora de Caracas.
const TZ = 'America/Caracas'

const numero = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fecha = new Intl.DateTimeFormat('es-VE', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
const hora = new Intl.DateTimeFormat('es-VE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const horaSeg = new Intl.DateTimeFormat('es-VE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
const mes = new Intl.DateTimeFormat('es-VE', { timeZone: TZ, month: 'long' })
const mesCorto = new Intl.DateTimeFormat('es-VE', { timeZone: TZ, month: 'short' })
const anio = new Intl.DateTimeFormat('es-VE', { timeZone: TZ, year: 'numeric' })
const diaIso = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** 125000 → "Bs. 1.250,00" (céntimos enteros, nunca float en el dominio). */
export const formatBs = (cents: number) => `Bs. ${numero.format(cents / 100)}`
export const formatFecha = (iso: string) => fecha.format(new Date(iso))
export const formatHora = (iso: string) => hora.format(new Date(iso))
export const formatHoraSeg = (iso: string) => horaSeg.format(new Date(iso))
/** "Octubre 2026" para los encabezados de mes. */
export const formatMes = (iso: string) => `${cap(mes.format(new Date(iso)))} ${anio.format(new Date(iso))}`
/** "Oct" para el eje del gráfico. */
export const formatMesCorto = (iso: string) => cap(mesCorto.format(new Date(iso)).replace('.', '').slice(0, 3))

/** "2026-10-24": el día de calendario en Caracas. */
export const diaCaracas = (d: string | Date) => diaIso.format(new Date(d))

/** Días de calendario (en Caracas) entre dos instantes; positivo si `b` es posterior. */
export function diasEntre(a: string | Date, b: string | Date): number {
  const dia = (d: string | Date) => Date.parse(`${diaCaracas(d)}T00:00:00Z`)
  return Math.round((dia(b) - dia(a)) / 86_400_000)
}

/** "04120000001" → "0412-0000001". */
export const formatTelefono = (t: string) => `${t.slice(0, 4)}-${t.slice(4)}`
/** "04120000001" → "0412-***0001". */
export const maskTelefono = (t: string) => `${t.slice(0, 4)}-***${t.slice(-4)}`
/** "V99000001" → "V-99000001". */
export const formatCedula = (c: string) => `${c.slice(0, 1)}-${c.slice(1)}`

export const TELEFONO_RE = /^04(12|14|16|24|26)\d{7}$/
