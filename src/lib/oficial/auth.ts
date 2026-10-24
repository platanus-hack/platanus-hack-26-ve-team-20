// Acceso REAL del oficial (docs/04 §0d): login por correo e invitación. Mismas firmas que la auth de `demo.ts`.
// La sesión de verdad es la cookie HttpOnly `vc_officer`; aquí solo se guarda la copia local del `OfficerSessionDTO`
// (en el mismo lugar que la demo, así los datos de ejemplo del historial sirven también con sesión real).
// El token de invitación solo viaja en el cuerpo del POST: nunca se guarda ni se loguea.
import { OfficerInvitationTokenSchema, type ApiResponse, type OfficerSessionDTO } from '@contracts'
import { DemoError, type DemoErrorCode } from '../demo/demo.ts'
import { abrirSesionOficial, cerrarSesionOficial as cerrarLocal, type Aceptacion, type Invitacion, type SesionOficial } from './demo.ts'

const POR_REASON: Record<string, DemoErrorCode> = { CREDENCIALES: 'CREDENCIALES', INVITACION_INVALIDA: 'NO_ENCONTRADA' }
const POR_CODE: Record<string, DemoErrorCode> = {
  NOT_FOUND: 'NO_ENCONTRADA', RATE_LIMITED: 'LIMITE', VALIDATION_ERROR: 'VALIDACION', CONFLICT: 'VALIDACION',
}

async function llamar<T>(ruta: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(ruta, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new DemoError('RED', 'Sin conexión')
  }
  let json: ApiResponse<T> | null = null
  try { json = (await res.json()) as ApiResponse<T> } catch { /* respuesta sin JSON */ }
  if (json?.ok) return json.data
  const e = json?.ok === false ? json.error : undefined
  const code = res.status >= 500 ? 'RED' : (e?.reason && POR_REASON[e.reason]) || (e && POR_CODE[e.code]) || (res.status === 429 ? 'LIMITE' : 'RED')
  throw new DemoError(code, e?.message ?? 'No pudimos completar la operación')
}

// Un token mal formado nunca sería válido: se trata igual que el 404, sin ir al servidor.
const tokenBienFormado = (token: string) => OfficerInvitationTokenSchema.safeParse({ token }).success

export async function iniciarSesionOficial(correo: string, clave: string): Promise<SesionOficial> {
  const { officer } = await llamar<{ officer: OfficerSessionDTO }>('/api/officer/login', { email: correo.trim().toLowerCase(), password: clave })
  return abrirSesionOficial(officer)
}

export async function verificarInvitacion(token: string): Promise<Invitacion> {
  if (!tokenBienFormado(token)) throw new DemoError('NO_ENCONTRADA')
  return llamar<Invitacion>('/api/officer/invitation/check', { token })
}

export async function aceptarInvitacion({ token, name, phone, password }: Aceptacion): Promise<SesionOficial> {
  if (!tokenBienFormado(token)) throw new DemoError('NO_ENCONTRADA')
  const { officer } = await llamar<{ officer: OfficerSessionDTO }>('/api/officer/invitation/accept', {
    token, phone, password, ...(name?.trim() && { name: name.trim() }),
  })
  return abrirSesionOficial(officer)
}

export function cerrarSesionOficial() {
  cerrarLocal()
  // La cookie es HttpOnly: solo el servidor la borra (DELETE de P3, misma cookie). Si falla, vence sola a las 12 h.
  void fetch('/api/officers/session', { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined)
}
