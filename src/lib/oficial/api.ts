// Fachada del oficial. Las pantallas importan SIEMPRE de aquí. Acceso y datos se eligen por separado:
//   · Acceso (login, invitación, cerrar sesión): `auth.ts` (API real, docs/04 §0d) salvo en tests o con
//     `VITE_CUENTA_API=demo`, igual que la cuenta del ciudadano; si no, la auth de `demo.ts`.
//   · Datos del historial: `real.ts` (docs/12) con `VITE_OFICIAL_API=real`; si no, los de ejemplo de `demo.ts`.
// La sesión local es una sola (en `demo.ts`), así que una sesión real también abre los datos de ejemplo.
import type { MultaOficial } from './demo.ts'
import * as auth from './auth.ts'
import * as demo from './demo.ts'
import * as real from './real.ts'

export {
  CLAVE_OFICIAL_MIN, CORREO_DEMO, INVITACION_DEMO, MOTIVO_MIN, accionesPermitidas, alVencerSesionOficial, getSesionOficial,
  reiniciarOficial, sesionOficialVencio, telefonoValido,
} from './demo.ts'
export type { Accion, Auditoria, Filtros, Invitacion, MultaDetalle, MultaOficial, PaginaMultas, SesionOficial } from './demo.ts'

export const USA_AUTH_REAL = import.meta.env?.MODE !== 'test' && import.meta.env?.VITE_CUENTA_API !== 'demo'
const acceso: typeof auth = USA_AUTH_REAL ? auth : demo

export const iniciarSesionOficial = acceso.iniciarSesionOficial
export const cerrarSesionOficial = acceso.cerrarSesionOficial
export const verificarInvitacion = acceso.verificarInvitacion
export const aceptarInvitacion = acceso.aceptarInvitacion

export const USA_API_REAL = import.meta.env?.MODE !== 'test' && import.meta.env?.VITE_OFICIAL_API === 'real'
const datos: typeof real = USA_API_REAL ? real : demo

export const listarMultas = datos.listarMultas
export const getMulta = datos.getMulta
export const cambiarEstado = datos.cambiarEstado

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
