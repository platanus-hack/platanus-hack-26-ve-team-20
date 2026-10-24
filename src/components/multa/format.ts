// Formatos de pantalla para /multa (docs/05 §4): fechas en America/Caracas, montos es-VE desde céntimos.
// Los WhatsApp tienen los suyos en lib/notify/templates.ts (src/ no puede importar lib/notify).
import type { FineStatus, ViolationType } from '@contracts'

const plainSpaces = (text: string) => text.replace(/\s/g, ' ')

export function formatDateTime(iso: string): string {
  return plainSpaces(
    new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso)),
  )
}

export function formatDate(iso: string): string {
  return plainSpaces(
    new Intl.DateTimeFormat('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: 'long', year: 'numeric' }).format(
      new Date(iso),
    ),
  )
}

export function formatTime(iso: string): string {
  return plainSpaces(
    new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(new Date(iso)),
  )
}

// Intl usa el símbolo histórico "Bs.S" para VES; en pantalla va "Bs.".
const CURRENCY_SYMBOLS: Record<string, string> = { VES: 'Bs.', USD: 'USD' }

export function formatAmount(amountCents: number, currency: string): string {
  const number = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    amountCents / 100,
  )
  return plainSpaces(`${CURRENCY_SYMBOLS[currency] ?? currency} ${number}`)
}

export const VIOLATION_LABELS: Record<ViolationType, string> = {
  RED_LIGHT: 'Cruce con luz roja',
  TURN_ARROW: 'Giro con flecha en rojo',
  SPEEDING: 'Exceso de velocidad',
}

export type StatusTone = 'red' | 'amber' | 'green' | 'gray' | 'blue'

/** Texto y color del estado (docs/05 §2: rojo pendiente, verde pagada, gris anulada, azul apelada). */
export function statusLabel(status: FineStatus, overdue: boolean): { text: string; tone: StatusTone } {
  if (status === 'PAID') return { text: 'Pagada', tone: 'green' }
  if (status === 'VOID') return { text: 'Anulada', tone: 'gray' }
  if (status === 'APPEALED') return { text: 'Apelada', tone: 'blue' }
  return overdue || status === 'OVERDUE' ? { text: 'Pendiente · vencida', tone: 'red' } : { text: 'Pendiente', tone: 'red' }
}

/** Se puede pagar si está pendiente (vencida incluida, docs/03 §4). */
export function isPayable(status: FineStatus): boolean {
  return status === 'PENDING' || status === 'OVERDUE'
}
