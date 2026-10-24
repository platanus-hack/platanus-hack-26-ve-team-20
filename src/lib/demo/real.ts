// Capa REAL de la cuenta del ciudadano: mismas firmas que `demo.ts`, pero habla con `/api/citizen/*` (docs/04 §0c).
// La sesión vive en una cookie HttpOnly que el navegador envía solo; aquí solo se guarda en sessionStorage una
// copia NO sensible (cédula, teléfono, correo y cuándo vence) para que `getSesion()` siga siendo síncrona y las
// pantallas sepan si hay sesión. El servidor es quien decide: ante un 401 la sesión local se descarta.
// El pago de cada multa es el de P3 (`POST /api/payments/c2p`, SIMULADO), una llamada por multa con su token.
import type { ApiResponse, C2PPaymentDTO, CitizenFineDTO, CitizenProfileDTO, CitizenVehicleDTO } from '@contracts'
import { normalizeCedula } from '@contracts'
import { diaCaracas } from '../format.ts'
import { CAMARAS_DEMO, type Camara, type Multa, type Vehiculo } from './datos.ts'
import { DemoError, esPagable, type DatosPago, type DemoErrorCode, type Sesion } from './demo.ts'

const SESION_MS = 30 * 60_000

// ---------------------------------------------------------------- almacenamiento (copia no sensible)
const memoria = new Map<string, string>()
function leer<T>(clave: string): T | null {
  let v: string | null | undefined
  try { v = sessionStorage.getItem(clave) } catch { v = memoria.get(clave) }
  if (v == null) v = memoria.get(clave)
  if (v == null) return null
  try { return JSON.parse(v) as T } catch { return null }
}
function guardar(clave: string, valor: unknown) {
  const v = JSON.stringify(valor)
  memoria.set(clave, v)
  try { sessionStorage.setItem(clave, v) } catch { /* solo memoria */ }
}
function borrar(clave: string) {
  memoria.delete(clave)
  try { sessionStorage.removeItem(clave) } catch { /* solo memoria */ }
}

// Claves distintas de las de la demo, para no mezclar datos si alguien cambia de modo.
const K = { sesion: 'stc.sesion', registro: 'stc.registro', pendientes: 'stc.pendientes' }

interface Registro { cedula: string; telefono: string; correo: string | null; enviadoEn: number }

/** Solo para tests: vuelve al estado inicial. */
export function reiniciarReal() {
  Object.values(K).forEach(borrar)
  tokens.clear()
  vencio = false
}

// ---------------------------------------------------------------- sesión local
const oyentes = new Set<() => void>()
/** Avisa cuando una llamada descubre que la sesión venció (la pantalla muestra el diálogo). */
export function alVencerSesion(cb: () => void) {
  oyentes.add(cb)
  return () => { oyentes.delete(cb) }
}

let vencio = false
/** `true` si la última sesión terminó por tiempo (la pantalla de login lo avisa). */
export const sesionVencio = () => vencio

/** Sesión vigente o `null`. Una vencida se borra. */
export function getSesion(): Sesion | null {
  const s = leer<Sesion>(K.sesion)
  if (!s) return null
  if (s.expira < Date.now()) { borrar(K.sesion); vencio = true; return null }
  return s
}

function abrirSesion(u: CitizenProfileDTO): Sesion {
  vencio = false
  const s: Sesion = { cedula: u.cedula, telefono: u.telefono, correo: u.correo, expira: Date.now() + SESION_MS }
  guardar(K.sesion, s)
  return s
}

function terminarSesion() {
  borrar(K.sesion)
  borrar(K.pendientes)
  vencio = true
  oyentes.forEach((cb) => cb())
}

// ---------------------------------------------------------------- llamadas a la API
const POR_REASON: Record<string, DemoErrorCode> = {
  CREDENCIALES: 'CREDENCIALES', YA_REGISTRADA: 'YA_REGISTRADA', CODIGO_INVALIDO: 'CODIGO_INVALIDO', CODIGO_VENCIDO: 'CODIGO_VENCIDO',
  CODIGO_AGOTADO: 'CODIGO_AGOTADO', SIN_REGISTRO: 'SIN_REGISTRO', SIN_TITULAR: 'SIN_TITULAR', ENVIO_FALLIDO: 'ENVIO_FALLIDO',
  ESPERAR: 'ESPERAR', NO_ENCONTRADA: 'NO_ENCONTRADA', NO_APELABLE: 'VALIDACION', CLAVE_ACTUAL: 'VALIDACION', CLAVE_IGUAL: 'VALIDACION',
}
const POR_CODE: Record<string, DemoErrorCode> = {
  UNAUTHORIZED: 'SESION', RATE_LIMITED: 'LIMITE', VALIDATION_ERROR: 'VALIDACION', NOT_FOUND: 'NO_ENCONTRADA', CONFLICT: 'VALIDACION',
  ALREADY_PAID: 'YA_PAGADA', UPSTREAM_ERROR: 'RED', INTERNAL_ERROR: 'RED',
}

/** Convierte el error de la API en `DemoError`: primero por `reason` (causa precisa) y si no por `code`. */
function aDemoError(error: { code: string; message: string; reason?: string } | undefined, status: number): DemoError {
  const code = (error?.reason && POR_REASON[error.reason]) || (error && POR_CODE[error.code]) || (status >= 500 ? 'RED' : 'VALIDACION')
  return new DemoError(code, error?.message ?? 'No pudimos completar la operación')
}

async function llamar<T>(ruta: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(ruta, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(init.body !== undefined && { 'Content-Type': 'application/json' }) },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    })
  } catch {
    throw new DemoError('RED', 'Sin conexión')
  }
  let body: ApiResponse<T> | null = null
  try { body = (await res.json()) as ApiResponse<T> } catch { /* respuesta sin JSON */ }
  if (body?.ok) return body.data
  throw aDemoError(body?.ok === false ? body.error : undefined, res.status)
}

/**
 * Llamada que exige sesión. Sin sesión local no se va al servidor; un 401 del servidor la descarta y avisa a las
 * pantallas. `renovar` extiende la copia local (el servidor ya renovó su cookie); los sondeos pasan `false`.
 */
async function protegido<T>(fn: () => Promise<T>, renovar = true): Promise<T> {
  const s = getSesion()
  if (!s) { terminarSesion(); throw new DemoError('SESION', 'La sesión venció') }
  try {
    const r = await fn()
    if (renovar) guardar(K.sesion, { ...s, expira: Date.now() + SESION_MS })
    return r
  } catch (e) {
    if (e instanceof DemoError && e.code === 'SESION') terminarSesion()
    throw e
  }
}

// ---------------------------------------------------------------- acceso
export async function iniciarSesion(cedula: string, clave: string): Promise<Sesion> {
  const { user } = await llamar<{ user: CitizenProfileDTO }>('/api/citizen/login', { method: 'POST', body: { cedula: normalizeCedula(cedula), password: clave } })
  return abrirSesion(user)
}

export function cerrarSesion() {
  vencio = false
  borrar(K.sesion)
  borrar(K.pendientes)
  tokens.clear()
  // La cookie es HttpOnly: solo el servidor puede borrarla. Si falla la red, la sesión igual vence sola a los 30 min.
  void fetch('/api/citizen/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined)
}

/**
 * El servidor devuelve el teléfono ENMASCARADO (`0426-***0319`). Las pantallas lo enmascaran de nuevo con
 * `maskTelefono` (primeros 4 + últimos 4 dígitos), así que se arma uno de 11 dígitos con relleno que nunca se ve.
 */
const paraMostrar = (enmascarado: string) => `${enmascarado.slice(0, 4)}000${enmascarado.slice(-4)}`

/** Paso 1: el código va al teléfono que el sistema tiene para esa cédula (el `telefono` tecleado no se usa). */
export async function solicitarCodigo(datos: { cedula: string; telefono: string; correo: string | null; clave: string }): Promise<{ telefono: string }> {
  const cedula = normalizeCedula(datos.cedula)
  const r = await llamar<{ telefono: string }>('/api/citizen/register', {
    method: 'POST',
    body: { cedula, password: datos.clave, ...(datos.correo && { email: datos.correo }) },
  })
  const telefono = paraMostrar(r.telefono)
  guardar(K.registro, { cedula, telefono, correo: datos.correo || null, enviadoEn: Date.now() } satisfies Registro)
  return { telefono }
}

/** Registro pendiente de verificar (para la pantalla del código). */
export const getRegistroPendiente = () => leer<Registro>(K.registro)

export async function reenviarCodigo(): Promise<void> {
  const r = getRegistroPendiente()
  if (!r) throw new DemoError('SIN_REGISTRO')
  await llamar('/api/citizen/register/resend', { method: 'POST', body: { cedula: r.cedula } })
  guardar(K.registro, { ...r, enviadoEn: Date.now() })
}

/** Paso 2: con el código correcto el servidor crea la cuenta y abre la sesión. */
export async function verificarCodigo(codigo: string): Promise<{ vehiculos: Vehiculo[] }> {
  const r = getRegistroPendiente()
  if (!r) throw new DemoError('SIN_REGISTRO')
  const { user, vehicles } = await llamar<{ user: CitizenProfileDTO; vehicles: CitizenVehicleDTO[] }>('/api/citizen/register/verify', {
    method: 'POST',
    body: { cedula: r.cedula, code: codigo },
  })
  borrar(K.registro)
  abrirSesion(user)
  return { vehiculos: vehicles.map(aVehiculo) }
}

// ---------------------------------------------------------------- datos de la cuenta
const aVehiculo = (v: CitizenVehicleDTO): Vehiculo => ({ plate: v.plate, brand: v.brand, model: v.model, color: v.color, year: v.year ?? 0 })

/** id de multa → token de pago (lo trae la API; las pantallas solo conocen el id). */
const tokens = new Map<string, string>()

function aMulta(f: CitizenFineDTO): Multa {
  tokens.set(f.id, f.token)
  const { token: _token, ...resto } = f
  return resto as Multa
}

/** Conteo inmediato para el contador del menú (sin red): el de la última carga de multas. */
export function contarPendientes(): number {
  return getSesion() ? (leer<number>(K.pendientes) ?? 0) : 0
}

async function cargarMultas(): Promise<Multa[]> {
  const { items } = await llamar<{ items: CitizenFineDTO[] }>('/api/citizen/fines')
  const multas = items.map(aMulta)
  guardar(K.pendientes, multas.filter(esPagable).length)
  return multas
}

/** Multas propias, de la más reciente a la más antigua. */
export const getMultas = () => protegido(cargarMultas)

export const getMulta = (id: string) => protegido(async () => aMulta(await llamar<CitizenFineDTO>(`/api/citizen/fines/${encodeURIComponent(id)}`)))

export const getVehiculos = () => protegido(async () => (await llamar<{ items: CitizenVehicleDTO[] }>('/api/citizen/vehicles')).items.map(aVehiculo))

export const getPerfil = () =>
  protegido(async () => {
    const { user } = await llamar<{ user: CitizenProfileDTO }>('/api/citizen/me')
    return { cedula: user.cedula, telefono: user.telefono, correo: user.correo }
  })

export async function cambiarClave(actual: string, nueva: string): Promise<void> {
  await protegido(() => llamar('/api/citizen/password', { method: 'POST', body: { current: actual, next: nueva } }))
}

export async function apelarMulta(id: string): Promise<Multa> {
  return protegido(async () => {
    const multa = aMulta(await llamar<CitizenFineDTO>(`/api/citizen/fines/${encodeURIComponent(id)}/appeal`, { method: 'POST' }))
    guardar(K.pendientes, Math.max(0, (leer<number>(K.pendientes) ?? 1) - 1))
    return multa
  })
}

/**
 * Pago Móvil C2P SIMULADO de una o varias multas: una llamada por multa a `POST /api/payments/c2p` (P3), en
 * orden. Si una falla, se detiene y lanza su error; las anteriores quedan pagadas (la pantalla recarga la lista).
 * Clave 000000 = inválida y 111111 = fondos insuficientes, como en la demo.
 */
export async function pagarMultas(ids: string[], pago: DatosPago): Promise<Multa[]> {
  return protegido(async () => {
    if (!ids.length) throw new DemoError('VALIDACION')
    if (ids.some((id) => !tokens.has(id))) await cargarMultas()
    for (const id of ids) {
      const fineToken = tokens.get(id)
      if (!fineToken) throw new DemoError('NO_ENCONTRADA')
      const r = await llamar<C2PPaymentDTO>('/api/payments/c2p', {
        method: 'POST',
        body: { fineToken, payerBankCode: pago.banco, payerPhone: pago.telefono, payerCedula: pago.cedula, c2pKey: pago.clave, idempotencyKey: crypto.randomUUID() },
      })
      if (r.status !== 'APPROVED') throw new DemoError(r.failureCode === 'INSUFFICIENT_FUNDS' ? 'FONDOS' : 'CLAVE_C2P')
    }
    return (await cargarMultas()).filter((m) => ids.includes(m.id))
  }, true)
}

/** Último fotograma de cada cámara pública (no es video). Los datos de las cámaras siguen siendo de ejemplo. */
export const getCamaras = () =>
  protegido(async (): Promise<Camara[]> => {
    // `renew=0`: sondear cada pocos segundos no debe mantener la sesión abierta (el servidor tampoco la renueva).
    await llamar('/api/citizen/me?renew=0')
    const ahora = new Date()
    const frame = Math.floor(ahora.getTime() / 4000)
    // CAM-004 sin señal: último fotograma hoy a las 09:40 (Caracas), o hace 1 h si aún no son las 09:40.
    const sinSenal = new Date(Math.min(Date.parse(`${diaCaracas(ahora)}T13:40:00Z`), ahora.getTime() - 3_600_000)).toISOString()
    return CAMARAS_DEMO.map((c, i) => ({ ...c, capturedAt: c.light ? ahora.toISOString() : sinSenal, frame: c.light ? frame + i : 0 }))
  }, false)
