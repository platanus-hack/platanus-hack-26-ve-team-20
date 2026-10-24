// Cliente de /api/choques/* (red de choques en vivo). Tipos y esquemas en lib/contracts/crash.ts.
import type {
  ApiResponse, CrashHeartbeatDTO, CrashHeartbeatRequest, CrashNetworkDTO, CrashReportDTO, CrashReportRequest,
} from '@contracts'

export class ErrorRed extends Error {}

async function llamar<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(ruta, { credentials: 'same-origin', ...init, headers: { Accept: 'application/json', ...init.headers } })
  } catch {
    throw new ErrorRed('Sin conexión')
  }
  let body: ApiResponse<T> | null = null
  try { body = (await res.json()) as ApiResponse<T> } catch { /* respuesta sin JSON */ }
  if (body?.ok) return body.data
  throw new ErrorRed(body?.ok === false ? body.error.message : `Error ${res.status}`)
}

const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export const latir = (r: CrashHeartbeatRequest) => llamar<CrashHeartbeatDTO>('/api/choques/latido', json(r))
export const verRed = () => llamar<CrashNetworkDTO>('/api/choques/red')
export const reportar = (r: CrashReportRequest) => llamar<CrashReportDTO>('/api/choques/incidentes', json(r))
export const marcarPerdida = (alertaId: string) => llamar<{ status: string }>(`/api/choques/alertas/${encodeURIComponent(alertaId)}/perdida`, json({ status: 'MISSED' }))

export function subirClip(alertaId: string, clip: { blob: Blob; tipo: string; t0S: number; duracionS: number }) {
  const q = new URLSearchParams({ type: clip.tipo, t0: clip.t0S.toFixed(2), duration: clip.duracionS.toFixed(2) })
  return llamar<{ clipUrl: string }>(`/api/choques/alertas/${encodeURIComponent(alertaId)}/clip?${q}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: clip.blob,
  })
}

/**
 * Diferencia entre el reloj del servidor y el de este dispositivo (ms), estimada con el punto medio del
 * viaje: el instante del choque viene en hora del servidor y la grabadora usa la local.
 */
export async function conReloj<T extends { serverNow: string }>(p: () => Promise<T>): Promise<{ data: T; offsetMs: number }> {
  const antes = Date.now()
  const data = await p()
  const despues = Date.now()
  return { data, offsetMs: Date.parse(data.serverNow) - (antes + despues) / 2 }
}
