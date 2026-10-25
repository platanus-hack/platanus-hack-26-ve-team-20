import type { Multa } from '@/lib/demo/api.ts'
import { esPagable } from './demo/demo.ts'
import { diaCaracas } from './format.ts'

const MES = new Intl.DateTimeFormat('es-VE', { month: 'short', timeZone: 'America/Caracas' })
export const mesCorto = (d: Date) => { const m = MES.format(d).replace('.', ''); return m[0]!.toUpperCase() + m.slice(1, 3) }

/** Curva "Pagado en el año": lo pagado acumulado al cierre de cada mes (5 anteriores, el actual y el próximo). */
export function pagadoPorMes(multas: Multa[], hoy: Date) {
  const pagos = multas.filter((m) => m.status === 'PAID' && m.paidAt && new Date(m.paidAt).getFullYear() === hoy.getFullYear())
  return Array.from({ length: 7 }, (_, i) => {
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 5 + i, 1)
    const fin = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1)
    const cents = pagos.filter((m) => new Date(m.paidAt!) < fin).reduce((t, m) => t + m.amountCents, 0)
    return { nombre: mesCorto(inicio), cents, futuro: i === 6 }
  })
}

/** Infracciones de cada mes del año (en Caracas): total, por pagar y pagadas. */
export function infraccionesPorMes(multas: Multa[], anio: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const delMes = multas.filter((m) => diaCaracas(m.occurredAt).startsWith(`${anio}-${String(i + 1).padStart(2, '0')}`))
    return {
      mes: mesCorto(new Date(anio, i, 15)),
      total: delMes.length,
      porPagar: delMes.filter(esPagable).length,
      pagadas: delMes.filter((m) => m.status === 'PAID').length,
    }
  })
}
