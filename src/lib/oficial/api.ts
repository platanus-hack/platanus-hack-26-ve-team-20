// Fachada del historial de multas del oficial. Las pantallas importan SIEMPRE de aquí:
//   · `demo.ts` → sin servidor, datos de ejemplo (por defecto mientras no exista `/api/officer/*`).
//   · `real.ts` → API de docs/12; se activa con `VITE_OFICIAL_API=real` cuando P1 la publique.
import type { MultaOficial } from './demo.ts'
import * as demo from './demo.ts'
import * as real from './real.ts'

export { MOTIVO_MIN, accionesPermitidas, reiniciarOficial } from './demo.ts'
export type { Accion, Auditoria, Filtros, MultaDetalle, MultaOficial, PaginaMultas, SesionOficial } from './demo.ts'

export const USA_API_REAL = import.meta.env?.MODE !== 'test' && import.meta.env?.VITE_OFICIAL_API === 'real'
const impl: typeof real = USA_API_REAL ? real : demo

export const alVencerSesionOficial = impl.alVencerSesionOficial
export const sesionOficialVencio = impl.sesionOficialVencio
export const getSesionOficial = impl.getSesionOficial
export const iniciarSesionOficial = impl.iniciarSesionOficial
export const cerrarSesionOficial = impl.cerrarSesionOficial
export const listarMultas = impl.listarMultas
export const getMulta = impl.getMulta
export const cambiarEstado = impl.cambiarEstado

/** Todas las páginas de un filtro (para exportar el resultado completo, no solo lo cargado). */
export async function listarTodas(f: { cedula?: string; placa?: string }): Promise<MultaOficial[]> {
  const todas: MultaOficial[] = []
  let cursor: string | null = null
  do {
    const p = await listarMultas({ ...f, cursor, limit: 100 })
    todas.push(...p.items)
    cursor = p.nextCursor
  } while (cursor)
  return todas
}
