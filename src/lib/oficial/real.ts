// Capa REAL del historial del oficial: mismas firmas que `demo.ts`, contra `/api/officer/fines` (docs/12).
// La cookie de sesión `vc_officer` la envía el navegador; un 401 descarta la sesión local y avisa a las pantallas.
import { normalizeCedula, normalizePlate, type ApiResponse } from '@contracts'
import { DemoError, type DemoErrorCode } from '../demo/demo.ts'
import { getSesionOficial, vencerSesionOficial, type Accion, type Filtros, type MultaDetalle, type PaginaMultas } from './demo.ts'

const POR_CODE: Record<string, DemoErrorCode> = {
  UNAUTHORIZED: 'SESION', NOT_FOUND: 'NO_ENCONTRADA', INVALID_TRANSITION: 'TRANSICION', VALIDATION_ERROR: 'VALIDACION',
}

async function llamar<T>(ruta: string, body?: unknown): Promise<T> {
  if (!getSesionOficial()) { vencerSesionOficial(); throw new DemoError('SESION', 'La sesión venció') }
  let res: Response
  try {
    res = await fetch(ruta, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })
  } catch {
    throw new DemoError('RED', 'Sin conexión')
  }
  let json: ApiResponse<T> | null = null
  try { json = (await res.json()) as ApiResponse<T> } catch { /* respuesta sin JSON */ }
  if (json?.ok) return json.data
  const code = (json?.ok === false && POR_CODE[json.error.code]) || 'RED'
  if (code === 'SESION') vencerSesionOficial()
  throw new DemoError(code, json?.ok === false ? json.error.message : 'No pudimos completar la operación')
}

export function listarMultas(f: Filtros = {}) {
  const q = new URLSearchParams()
  if (f.cedula) q.set('cedula', normalizeCedula(f.cedula))
  if (f.placa) q.set('plate', normalizePlate(f.placa))
  if (f.cursor) q.set('cursor', f.cursor)
  if (f.limit) q.set('limit', String(f.limit))
  return llamar<PaginaMultas>(`/api/officer/fines?${q}`)
}

export const getMulta = (id: string) => llamar<MultaDetalle>(`/api/officer/fines/${encodeURIComponent(id)}`)

export const cambiarEstado = (id: string, accion: Accion, motivo: string) =>
  llamar<MultaDetalle>(`/api/officer/fines/${encodeURIComponent(id)}/status`, { action: accion, reason: motivo.trim() })
