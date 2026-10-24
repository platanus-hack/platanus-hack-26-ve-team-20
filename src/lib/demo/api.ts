// Capa de datos de DEMO para la cuenta del ciudadano. No hay API de cuentas todavía: cada función
// simula latencia y reglas del prototipo. Reemplazar el cuerpo de cada una por `fetch('/api/...')`
// manteniendo la firma. Pagos SIMULADOS: nada sale del navegador.
import { normalizeCedula } from '@contracts'
import { TELEFONO_RE, diaCaracas, diasEntre } from '../format.ts'
import {
  CAMARAS_DEMO, CEDULA_DEMO, CEDULA_REGISTRADA, CLAVE_INCORRECTA, MULTAS_DEMO, TELEFONO_DEMO, VEHICULOS_DEMO,
  type Camara, type Multa, type Vehiculo,
} from './datos.ts'

export type { Camara, Multa, Vehiculo } from './datos.ts'

export type DemoErrorCode =
  | 'CREDENCIALES' | 'YA_REGISTRADA' | 'CODIGO_INVALIDO' | 'CODIGO_VENCIDO' | 'SIN_REGISTRO'
  | 'CLAVE_C2P' | 'FONDOS' | 'YA_PAGADA' | 'VALIDACION' | 'NO_ENCONTRADA' | 'RED' | 'SESION'

export class DemoError extends Error {
  code: DemoErrorCode
  constructor(code: DemoErrorCode, message: string = code) {
    super(message)
    this.code = code
  }
}

export interface Sesion { cedula: string; telefono: string; correo: string | null; expira: number }
interface Cuenta { cedula: string; telefono: string; correo: string | null }
interface Registro extends Cuenta { enviadoEn: number }

const SESION_MS = 30 * 60_000
const CODIGO_MS = 10 * 60_000

// ---------------------------------------------------------------- almacenamiento
// sessionStorage puede no existir o lanzar (modo privado, tests en Node): copia en memoria siempre.
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

const K = { sesion: 'st.sesion', cuentas: 'st.cuentas', registro: 'st.registro', multas: 'st.multas' }

/** Solo para tests: vuelve al estado inicial. */
export function reiniciarDemo() {
  Object.values(K).forEach(borrar)
  vencio = false
}

// ---------------------------------------------------------------- latencia y fallos simulados
const enTest = import.meta.env?.MODE === 'test'
const esperar = (min = 300, max = 600) =>
  enTest ? Promise.resolve() : new Promise<void>((r) => setTimeout(r, min + Math.random() * (max - min)))

// `?demo=red` hace fallar las cargas de los primeros 2 s (para ver "Reintentar"); `?demo=sesion` vence la sesión.
const cargaInicial = Date.now()
function falloDemo(): string | null {
  try { return new URLSearchParams(window.location.search).get('demo') } catch { return null }
}

const oyentes = new Set<() => void>()
/** Avisa cuando una llamada descubre que la sesión venció (la pantalla muestra el diálogo). */
export function alVencerSesion(cb: () => void) {
  oyentes.add(cb)
  return () => { oyentes.delete(cb) }
}

let vencio = false
/** `true` si la última sesión terminó por tiempo (la pantalla de login lo avisa). */
export const sesionVencio = () => vencio

/** Sesión vigente o `null`. Una sesión vencida se borra. */
export function getSesion(): Sesion | null {
  const s = leer<Sesion>(K.sesion)
  if (!s) return null
  if (s.expira < Date.now()) { borrar(K.sesion); vencio = true; return null }
  return s
}

// `renovar = false` para el sondeo: si no, dejar /en-vivo abierto impide que la sesión venza.
async function protegido<T>(fn: (s: Sesion) => T, latencia?: [number, number], renovar = true): Promise<T> {
  await esperar(...(latencia ?? []))
  const fallo = falloDemo()
  if (fallo === 'red' && Date.now() - cargaInicial < 2000) throw new DemoError('RED', 'Sin conexión')
  const s = getSesion()
  if (!s || fallo === 'sesion') {
    borrar(K.sesion)
    vencio = true
    oyentes.forEach((cb) => cb())
    throw new DemoError('SESION', 'La sesión venció')
  }
  if (renovar) guardar(K.sesion, { ...s, expira: Date.now() + SESION_MS })
  return fn(s)
}

function abrirSesion(c: Cuenta): Sesion {
  vencio = false
  const s = { ...c, expira: Date.now() + SESION_MS }
  guardar(K.sesion, s)
  return s
}

const cuentas = () => leer<Cuenta[]>(K.cuentas) ?? []
const multasDe = (cedula: string): Multa[] =>
  cedula === CEDULA_DEMO ? leer<Multa[]>(K.multas) ?? MULTAS_DEMO : []

// ---------------------------------------------------------------- acceso
/** Login con cédula + contraseña. Demo: V-99000001 (o una cuenta creada en esta sesión), clave de 6+ caracteres salvo `clave-mal`. */
export async function iniciarSesion(cedula: string, clave: string): Promise<Sesion> {
  await esperar()
  const ced = normalizeCedula(cedula)
  const cuenta = ced === CEDULA_DEMO
    ? { cedula: ced, telefono: TELEFONO_DEMO, correo: null }
    : cuentas().find((c) => c.cedula === ced)
  if (!cuenta || clave.length < 6 || clave === CLAVE_INCORRECTA) throw new DemoError('CREDENCIALES')
  return abrirSesion(cuenta)
}

export function cerrarSesion() {
  vencio = false
  borrar(K.sesion)
}

/** Paso 1 del registro: el código va al teléfono que el sistema tiene para esa cédula. */
export async function solicitarCodigo(datos: Cuenta & { clave: string }): Promise<{ telefono: string }> {
  await esperar()
  const ced = normalizeCedula(datos.cedula)
  if (ced === CEDULA_REGISTRADA || cuentas().some((c) => c.cedula === ced)) throw new DemoError('YA_REGISTRADA')
  if (!/^[VE]\d{6,9}$/.test(ced) || !TELEFONO_RE.test(datos.telefono) || datos.clave.length < 8) throw new DemoError('VALIDACION')
  const telefono = ced === CEDULA_DEMO ? TELEFONO_DEMO : datos.telefono
  guardar(K.registro, { cedula: ced, telefono, correo: datos.correo || null, enviadoEn: Date.now() } satisfies Registro)
  return { telefono }
}

/** Registro pendiente de verificar (para la pantalla del código). */
export const getRegistroPendiente = () => leer<Registro>(K.registro)

export async function reenviarCodigo(): Promise<void> {
  await esperar()
  const r = getRegistroPendiente()
  if (!r) throw new DemoError('SIN_REGISTRO')
  guardar(K.registro, { ...r, enviadoEn: Date.now() })
}

/** Paso 2: 123456 es válido; 000000 (o un código de más de 10 min) está vencido; otro es inválido. Crea la cuenta y la sesión. */
export async function verificarCodigo(codigo: string): Promise<{ vehiculos: Vehiculo[] }> {
  await esperar()
  const r = getRegistroPendiente()
  if (!r) throw new DemoError('SIN_REGISTRO')
  if (codigo === '000000' || Date.now() - r.enviadoEn > CODIGO_MS) throw new DemoError('CODIGO_VENCIDO')
  if (codigo !== '123456') throw new DemoError('CODIGO_INVALIDO')
  const cuenta: Cuenta = { cedula: r.cedula, telefono: r.telefono, correo: r.correo }
  guardar(K.cuentas, [...cuentas(), cuenta])
  borrar(K.registro)
  abrirSesion(cuenta)
  return { vehiculos: r.cedula === CEDULA_DEMO ? VEHICULOS_DEMO : [] }
}

// ---------------------------------------------------------------- datos de la cuenta
const porFecha = (a: Multa, b: Multa) => b.occurredAt.localeCompare(a.occurredAt)

export const esPagable = (m: Pick<Multa, 'status'>) => m.status === 'PENDING' || m.status === 'OVERDUE'

/** Conteo inmediato para el contador del menú (sin latencia). */
export function contarPendientes(): number {
  const s = getSesion()
  return s ? multasDe(s.cedula).filter(esPagable).length : 0
}

/** Multas propias, de la más reciente a la más antigua. */
export const getMultas = () => protegido((s) => [...multasDe(s.cedula)].sort(porFecha))

export const getMulta = (id: string) => protegido((s) => {
  const m = multasDe(s.cedula).find((x) => x.id === id)
  if (!m) throw new DemoError('NO_ENCONTRADA')
  return m
})

export const getVehiculos = () => protegido((s) => (s.cedula === CEDULA_DEMO ? VEHICULOS_DEMO : []))

export const getPerfil = () => protegido((s) => ({ cedula: s.cedula, telefono: s.telefono, correo: s.correo }))

export async function cambiarClave(actual: string, nueva: string): Promise<void> {
  await protegido(() => {
    if (!actual || nueva.length < 8) throw new DemoError('VALIDACION')
  })
}

export async function apelarMulta(id: string): Promise<Multa> {
  return protegido((s) => {
    const todas = multasDe(s.cedula)
    const m = todas.find((x) => x.id === id)
    if (!m) throw new DemoError('NO_ENCONTRADA')
    if (!esPagable(m)) throw new DemoError('VALIDACION')
    const nueva: Multa = { ...m, status: 'APPEALED', appealedAt: new Date().toISOString() }
    guardar(K.multas, todas.map((x) => (x.id === id ? nueva : x)))
    return nueva
  })
}

export interface DatosPago { banco: string; telefono: string; cedula: string; clave: string }

/**
 * Pago Móvil C2P SIMULADO de una o varias multas. Clave 000000 = clave inválida, 111111 = fondos
 * insuficientes; cualquier otra de 6–8 dígitos aprueba con referencia `SIM-########` por multa.
 */
export async function pagarMultas(ids: string[], pago: DatosPago): Promise<Multa[]> {
  // 1,2 s: coincide con el relleno del botón "Procesando pago…" del diseño.
  return protegido((s) => {
    if (!ids.length || !TELEFONO_RE.test(pago.telefono) || !/^[VE]\d{6,9}$/.test(normalizeCedula(pago.cedula)) || !/^\d{6,8}$/.test(pago.clave)) {
      throw new DemoError('VALIDACION')
    }
    const todas = multasDe(s.cedula)
    const elegidas = ids.map((id) => todas.find((m) => m.id === id))
    if (elegidas.some((m) => !m)) throw new DemoError('NO_ENCONTRADA')
    if (elegidas.some((m) => m && !esPagable(m))) throw new DemoError('YA_PAGADA')
    if (pago.clave === '000000') throw new DemoError('CLAVE_C2P')
    if (pago.clave === '111111') throw new DemoError('FONDOS')
    const paidAt = new Date().toISOString()
    const pagadas = new Map(ids.map((id) => [id, referencia()]))
    const nuevas = todas.map((m): Multa => {
      const ref = pagadas.get(m.id)
      return ref ? { ...m, status: 'PAID', paidAt, paymentReference: ref } : m
    })
    guardar(K.multas, nuevas)
    return nuevas.filter((m) => pagadas.has(m.id))
  }, [1200, 1200])
}

const referencia = () => `SIM-${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`

/** Último fotograma de cada cámara pública (no es video). Llamar cada 4 s. */
export const getCamaras = () => protegido((): Camara[] => {
  const ahora = new Date()
  const frame = Math.floor(ahora.getTime() / 4000)
  // CAM-004 sin señal: último fotograma hoy a las 09:40 (Caracas), o hace 1 h si aún no son las 09:40.
  const sinSenal = new Date(Math.min(Date.parse(`${diaCaracas(ahora)}T13:40:00Z`), ahora.getTime() - 3_600_000)).toISOString()
  return CAMARAS_DEMO.map((c, i) => ({
    ...c,
    capturedAt: c.light ? ahora.toISOString() : sinSenal,
    frame: c.light ? frame + i : 0,
  }))
}, undefined, false)

// ---------------------------------------------------------------- estadísticas
export interface Estadisticas {
  total: number
  porPagar: number
  pagadas: number
  montoPagadoCents: number
  /** Días desde la infracción más reciente; `null` si no hay ninguna. */
  diasSinInfracciones: number | null
  desde: string | null
  porMes: Array<{ mes: string; n: number }>
  porTipo: Array<{ type: Multa['type']; n: number }>
  porVehiculo: Array<{ plate: string; n: number }>
}

/** Cifras de la pantalla de estadísticas. `porMes` cubre los 8 meses que terminan en el mes de `hoy`. */
export function calcularEstadisticas(multas: Multa[], hoy: Date = new Date()): Estadisticas {
  const fechas = multas.map((m) => m.occurredAt).sort()
  const ultima = fechas.at(-1)
  const [y, mo] = diaCaracas(hoy).split('-').map(Number) as [number, number]
  const porMes = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(Date.UTC(y, mo - 1 - (7 - i), 15, 12))
    const clave = d.toISOString().slice(0, 7)
    return { mes: d.toISOString(), n: multas.filter((m) => diaCaracas(m.occurredAt).startsWith(clave)).length }
  })
  const placas = [...new Set(multas.map((m) => m.plate))]
  return {
    total: multas.length,
    porPagar: multas.filter(esPagable).length,
    pagadas: multas.filter((m) => m.status === 'PAID').length,
    montoPagadoCents: multas.filter((m) => m.status === 'PAID').reduce((t, m) => t + m.amountCents, 0),
    diasSinInfracciones: ultima ? diasEntre(ultima, hoy) : null,
    desde: fechas[0] ?? null,
    porMes,
    porTipo: (['RED_LIGHT', 'TURN_ARROW', 'SPEEDING'] as const).map((type) => ({ type, n: multas.filter((m) => m.type === type).length })),
    porVehiculo: placas.map((plate) => ({ plate, n: multas.filter((m) => m.plate === plate).length })),
  }
}
