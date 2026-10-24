// Fechas del selector de rango. Todo se maneja como `YYYY-MM-DD` (día de calendario, sin zona horaria) y los
// cálculos usan UTC para que el huso del navegador no corra un día.
export const dia = (d: Date) => d.toISOString().slice(0, 10)
const utc = (s: string) => new Date(`${s}T12:00:00Z`)
export const esDia = (v: string | null | undefined): v is string => v != null && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(utc(v).getTime())

const MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
export const SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** `2026-01-01` → `1 Ene 2026`. */
export const fechaCorta = (s: string) => `${utc(s).getUTCDate()} ${MES[utc(s).getUTCMonth()]!.slice(0, 3)} ${utc(s).getUTCFullYear()}`
/** `2026-10` → `Octubre 2026`. */
export const nombreMes = (ym: string) => `${MES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`
export const mesDe = (s: string) => s.slice(0, 7)
export const sumarMeses = (ym: string, n: number) => dia(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1, 12))).slice(0, 7)
export const sumarDias = (s: string, n: number) => dia(new Date(utc(s).getTime() + n * 86_400_000))
/** Los dos extremos en orden cronológico. */
export const ordenar = (a: string, b: string): [string, string] => (a <= b ? [a, b] : [b, a])

export interface Celda { dia: string; delMes: boolean }
/** Cuadrícula de 6 semanas (42 días) del mes `ym`, con la semana empezando en lunes. */
export function cuadricula(ym: string): Celda[] {
  const primero = utc(`${ym}-01`)
  const lunes = (primero.getUTCDay() + 6) % 7 // 0 = lunes
  const inicio = sumarDias(`${ym}-01`, -lunes)
  return Array.from({ length: 42 }, (_, i) => {
    const d = sumarDias(inicio, i)
    return { dia: d, delMes: mesDe(d) === ym }
  })
}

export interface Atajo { id: string; nombre: string; desde: string; hasta: string }
/** Rangos habituales respecto a `hoy`; «Todo» arranca en `minimo`. */
export function atajos(hoy: string, minimo: string): Atajo[] {
  return [
    { id: 'mes', nombre: 'Este mes', desde: `${mesDe(hoy)}-01`, hasta: hoy },
    { id: '30', nombre: 'Últimos 30 días', desde: sumarDias(hoy, -29), hasta: hoy },
    { id: 'anio', nombre: 'Este año', desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy },
    { id: 'todo', nombre: 'Todo', desde: minimo, hasta: hoy },
  ]
}
