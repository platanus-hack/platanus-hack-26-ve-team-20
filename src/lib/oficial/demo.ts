// Capa de DEMO del historial de multas del oficial: sin servidor, con las multas del demo del ciudadano más otros
// titulares ficticios. La REAL (`real.ts`, contrato en docs/12) tiene las mismas firmas; `api.ts` elige una u otra.
// Los tipos son los DTO de docs/12: la cédula sale SIEMPRE enmascarada y nunca hay nombre ni teléfono (docs/08).
import {
  maskCedula, normalizeCedula, normalizePlate,
  type ActorType, type EvidenceKind, type FineStatus, type LightState, type ViolationType,
} from '@contracts'
import { CEDULA_DEMO, MULTAS_DEMO, VEHICULOS_DEMO, type Multa, type Vehiculo } from '../demo/datos.ts'
import { DemoError, borrar, esperar, guardar, leer } from '../demo/demo.ts'

export type Accion = 'VOID' | 'APPEAL_ACCEPT' | 'APPEAL_REJECT'

export interface Auditoria {
  at: string
  actor: { type: ActorType; label: string }
  action: string
  from: FineStatus | null
  to: FineStatus | null
  reason: string | null
}

export interface MultaOficial {
  id: string
  type: ViolationType
  /** Incluye `OVERDUE` (calculado). */
  status: FineStatus
  occurredAt: string
  intersection: string
  cameraCode: string
  plate: string
  /** `V-****0001`; `null` si el vehículo no tiene titular. */
  cedulaMasked: string | null
  amountCents: number
  currency: 'VES' | 'USD'
  dueAt: string
  verification: 'AUTO' | 'HUMAN'
  confidence: number
}

export interface MultaDetalle extends MultaOficial {
  vehicle: Omit<Vehiculo, 'plate'> | null
  evidence: Array<{ kind: EvidenceKind; url: string; capturedAt: string; lightState: LightState | null }>
  paidAt: string | null
  paymentReference: string | null
  voidReason: string | null
  appealedAt: string | null
  audit: Auditoria[]
}

export interface PaginaMultas { items: MultaOficial[]; nextCursor: string | null }
export interface Filtros { cedula?: string; placa?: string; cursor?: string | null; limit?: number }
export interface SesionOficial { correo: string; nombre: string; expira: number }

export const MOTIVO_MIN = 10
const SESION_MS = 12 * 3600_000 // igual que SESSION_TTL_S.officer (lib/auth/session.ts); no se renueva
const POR_PAGINA = 25

export const CORREO_DEMO = 'oficial.a@example.com'
export const CLAVE_DEMO = 'demo1234'

// ---------------------------------------------------------------- datos de ejemplo (todos ficticios)
const L = [
  'Av. Demo Norte con Calle 1 (ejemplo)', 'Av. Demo Sur con Calle 4 (ejemplo)',
  'Av. Demo Este con Calle 3 (ejemplo)', 'Av. Demo Oeste con Calle 2 (ejemplo)',
] as const

const VEHICULOS: Array<Vehiculo & { cedula: string }> = [
  ...VEHICULOS_DEMO.map((v) => ({ ...v, cedula: CEDULA_DEMO })),
  { plate: 'XY789ZA', brand: 'Ford', model: 'Fiesta', color: 'Azul', year: 2015, cedula: 'V99000002' },
  { plate: 'KL321MN', brand: 'Hyundai', model: 'Getz', color: 'Rojo', year: 2010, cedula: 'V99000002' },
  { plate: 'PQ654RS', brand: 'Renault', model: 'Logan', color: 'Negro', year: 2016, cedula: 'E99000003' },
  { plate: 'GH987JK', brand: 'Kia', model: 'Rio', color: 'Plata', year: 2019, cedula: 'V99000004' },
]

const base = { amountCents: 125_000, currency: 'VES' as const, paidAt: null, paymentReference: null, voidReason: null, appealedAt: null }
const OTRAS: Multa[] = [
  { ...base, id: 'o1', plate: 'XY789ZA', type: 'RED_LIGHT', status: 'APPEALED', occurredAt: '2026-10-10T13:20:00Z', intersection: L[0], cameraCode: 'CAM-001', dueAt: '2026-11-09T16:00:00Z', verification: 'HUMAN', confidence: 0.81, appealedAt: '2026-10-12T15:00:00Z' },
  { ...base, id: 'o2', plate: 'PQ654RS', type: 'SPEEDING', status: 'APPEALED', occurredAt: '2026-09-28T21:05:00Z', intersection: L[1], cameraCode: 'CAM-002', dueAt: '2026-10-28T16:00:00Z', verification: 'AUTO', confidence: 0.93, appealedAt: '2026-10-01T12:30:00Z' },
  { ...base, id: 'o3', plate: 'GH987JK', type: 'TURN_ARROW', status: 'APPEALED', occurredAt: '2026-08-30T16:40:00Z', intersection: L[2], cameraCode: 'CAM-003', dueAt: '2026-09-29T16:00:00Z', verification: 'HUMAN', confidence: 0.77, appealedAt: '2026-09-02T14:10:00Z' },
  { ...base, id: 'o4', plate: 'KL321MN', type: 'RED_LIGHT', status: 'OVERDUE', occurredAt: '2026-09-05T11:15:00Z', intersection: L[3], cameraCode: 'CAM-004', dueAt: '2026-10-05T16:00:00Z', verification: 'AUTO', confidence: 0.95 },
  { ...base, id: 'o5', plate: 'XY789ZA', type: 'RED_LIGHT', status: 'PENDING', occurredAt: '2026-10-22T23:48:00Z', intersection: L[0], cameraCode: 'CAM-001', dueAt: '2026-11-21T16:00:00Z', verification: 'AUTO', confidence: 0.9 },
  { ...base, id: 'o6', plate: 'PQ654RS', type: 'RED_LIGHT', status: 'PENDING', occurredAt: '2026-10-23T12:02:00Z', intersection: L[2], cameraCode: 'CAM-003', dueAt: '2026-11-22T16:00:00Z', verification: 'HUMAN', confidence: 0.84 },
  { ...base, id: 'o7', plate: 'GH987JK', type: 'SPEEDING', status: 'PAID', occurredAt: '2026-07-19T18:25:00Z', intersection: L[1], cameraCode: 'CAM-002', dueAt: '2026-08-18T16:00:00Z', verification: 'AUTO', confidence: 0.92, paidAt: '2026-07-21T13:00:00Z', paymentReference: 'SIM-25530981' },
  { ...base, id: 'o8', plate: 'KL321MN', type: 'TURN_ARROW', status: 'VOID', occurredAt: '2026-07-02T15:33:00Z', intersection: L[3], cameraCode: 'CAM-004', dueAt: '2026-08-01T16:00:00Z', verification: 'HUMAN', confidence: 0.71, voidReason: 'placa mal leída por el modelo' },
  // Historial pagado más viejo, para que haya más de una página.
  ...Array.from({ length: 12 }, (_, i): Multa => {
    const occurredAt = new Date(Date.UTC(2026, 5 - i, 10 + i, 13, 15)).toISOString()
    const dia = (n: number) => new Date(Date.parse(occurredAt) + n * 86_400_000).toISOString()
    return {
      ...base, id: `h${i + 1}`, plate: i % 2 ? 'KL321MN' : 'XY789ZA', type: (['RED_LIGHT', 'TURN_ARROW', 'SPEEDING'] as const)[i % 3]!,
      status: 'PAID', occurredAt, intersection: L[i % 4]!, cameraCode: `CAM-00${(i % 4) + 1}`, dueAt: dia(30),
      verification: 'AUTO', confidence: 0.9, paidAt: dia(2), paymentReference: `SIM-4${String(i).padStart(7, '0')}`,
    }
  }),
]

const SISTEMA = { type: 'SYSTEM', label: 'Sistema' } as const
const OPERADOR = { type: 'OPERATOR', label: 'Operador de revisión (ejemplo)' } as const
const CIUDADANO = { type: 'CITIZEN', label: 'Ciudadano (titular)' } as const

/** Historia con la que nace cada multa del demo: revisión (si hubo), emisión y lo que pasó después. */
function auditoriaInicial(m: Multa): Auditoria[] {
  const t = (min: number) => new Date(Date.parse(m.occurredAt) + min * 60_000).toISOString()
  const humano = m.verification === 'HUMAN'
  return [
    ...(humano ? [{ at: t(25), actor: OPERADOR, action: 'REVIEW_APPROVED', from: null, to: null, reason: 'Placa legible en el fotograma 2' }] : []),
    { at: t(humano ? 26 : 1), actor: SISTEMA, action: 'FINE_CREATED', from: null, to: 'PENDING', reason: null },
    ...(m.status === 'PAID' && m.paidAt ? [{ at: m.paidAt, actor: CIUDADANO, action: 'PAID', from: 'PENDING' as const, to: 'PAID' as const, reason: null }] : []),
    ...(m.status === 'APPEALED' && m.appealedAt ? [{ at: m.appealedAt, actor: CIUDADANO, action: 'APPEALED', from: 'PENDING' as const, to: 'APPEALED' as const, reason: null }] : []),
    ...(m.status === 'VOID' ? [{ at: t(24 * 60), actor: OPERADOR, action: 'VOID', from: 'PENDING' as const, to: 'VOID' as const, reason: m.voidReason }] : []),
  ]
}

interface Registro extends Multa { cedula: string | null; audit: Auditoria[] }

const INICIALES: Registro[] = [...MULTAS_DEMO, ...OTRAS].map((m) => ({
  ...m,
  cedula: VEHICULOS.find((v) => v.plate === m.plate)?.cedula ?? null,
  audit: auditoriaInicial(m),
}))

// ---------------------------------------------------------------- estado (sessionStorage con copia en memoria)
const K = { sesion: 'st.oficial.sesion', multas: 'st.oficial.multas' }
const registros = () => leer<Registro[]>(K.multas) ?? INICIALES

/** Solo para tests: vuelve al estado inicial. */
export function reiniciarOficial() {
  Object.values(K).forEach(borrar)
  vencio = false
}

// ---------------------------------------------------------------- sesión de demo (la reemplaza el login por invitación)
const oyentes = new Set<() => void>()
/** Avisa cuando una llamada descubre que la sesión venció (la pantalla muestra el diálogo). */
export function alVencerSesionOficial(cb: () => void) {
  oyentes.add(cb)
  return () => { oyentes.delete(cb) }
}

let vencio = false
export const sesionOficialVencio = () => vencio

export function getSesionOficial(): SesionOficial | null {
  const s = leer<SesionOficial>(K.sesion)
  if (!s) return null
  if (s.expira < Date.now()) { borrar(K.sesion); vencio = true; return null }
  return s
}

/** Descarta la sesión y avisa a las pantallas (también la usa `real.ts` ante un 401). */
export function vencerSesionOficial() {
  borrar(K.sesion)
  vencio = true
  oyentes.forEach((cb) => cb())
}

/** Demo: oficial.a@example.com / demo1234. Cualquier otra combinación (p. ej. «clave-mal») es incorrecta. */
export async function iniciarSesionOficial(correo: string, clave: string): Promise<SesionOficial> {
  await esperar()
  if (correo.trim().toLowerCase() !== CORREO_DEMO || clave !== CLAVE_DEMO) throw new DemoError('CREDENCIALES')
  vencio = false
  const s = { correo: CORREO_DEMO, nombre: 'Oficial A (ejemplo)', expira: Date.now() + SESION_MS }
  guardar(K.sesion, s)
  return s
}

export function cerrarSesionOficial() {
  vencio = false
  borrar(K.sesion)
}

async function protegido<T>(fn: (s: SesionOficial) => T): Promise<T> {
  await esperar()
  const s = getSesionOficial()
  if (!s) { vencerSesionOficial(); throw new DemoError('SESION', 'La sesión venció') }
  return fn(s)
}

// ---------------------------------------------------------------- reglas de cambio de estado (docs/12 §3)
const ACCIONES: Record<FineStatus, Accion[]> = {
  PENDING: ['VOID'],
  OVERDUE: ['VOID'],
  APPEALED: ['APPEAL_ACCEPT', 'APPEAL_REJECT'],
  PAID: [],
  VOID: [],
}
export const accionesPermitidas = (status: FineStatus) => ACCIONES[status]

/** Estado al que llega la multa con `accion`; lanza `TRANSICION` si no se permite desde el estado actual. */
export function destino(m: Pick<MultaOficial, 'status' | 'dueAt'>, accion: Accion, ahora = new Date()): FineStatus {
  if (!ACCIONES[m.status].includes(accion)) throw new DemoError('TRANSICION', 'La multa ya no admite ese cambio')
  if (accion !== 'APPEAL_REJECT') return 'VOID'
  return Date.parse(m.dueAt) < ahora.getTime() ? 'OVERDUE' : 'PENDING'
}

// ---------------------------------------------------------------- consultas
// `OVERDUE` se calcula como en el backend (effectiveFineStatus): PENDING con plazo vencido.
const efectivo = (r: Registro): FineStatus => (r.status === 'PENDING' && Date.parse(r.dueAt) < Date.now() ? 'OVERDUE' : r.status)

function aLista(r: Registro): MultaOficial {
  return {
    id: r.id, type: r.type, status: efectivo(r), occurredAt: r.occurredAt, intersection: r.intersection, cameraCode: r.cameraCode,
    plate: r.plate, cedulaMasked: r.cedula && maskCedula(r.cedula), amountCents: r.amountCents, currency: r.currency, dueAt: r.dueAt,
    verification: r.verification, confidence: r.confidence,
  }
}

function aDetalle(r: Registro): MultaDetalle {
  const v = VEHICULOS.find((x) => x.plate === r.plate)
  return {
    ...aLista(r),
    vehicle: v ? { brand: v.brand, model: v.model, color: v.color, year: v.year } : null,
    evidence: [], // el demo dibuja el fotograma de ejemplo
    paidAt: r.paidAt, paymentReference: r.paymentReference, voidReason: r.voidReason, appealedAt: r.appealedAt,
    audit: r.audit,
  }
}

/**
 * Multas filtradas, la más reciente primero. Cédula: coincidencia EXACTA (V/E + número). Placa: por PREFIJO
 * (`AB12` encuentra `AB123CD`), útil cuando el oficial solo alcanzó a leer el comienzo.
 */
export const listarMultas = (f: Filtros = {}) => protegido((): PaginaMultas => {
  const ced = normalizeCedula(f.cedula ?? '')
  const pla = normalizePlate(f.placa ?? '')
  const lista = registros()
    .filter((r) => (!ced || r.cedula === ced) && (!pla || r.plate.startsWith(pla)))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const desde = Number(f.cursor) || 0
  const hasta = desde + (f.limit ?? POR_PAGINA)
  return { items: lista.slice(desde, hasta).map(aLista), nextCursor: hasta < lista.length ? String(hasta) : null }
})

export const getMulta = (id: string) => protegido(() => {
  const r = registros().find((x) => x.id === id)
  if (!r) throw new DemoError('NO_ENCONTRADA')
  return aDetalle(r)
})

/** Anula o resuelve una apelación. El motivo (≥ 10 caracteres) queda en la auditoría con el oficial como actor. */
export const cambiarEstado = (id: string, accion: Accion, motivo: string) => protegido((s) => {
  const todas = registros()
  const r = todas.find((x) => x.id === id)
  if (!r) throw new DemoError('NO_ENCONTRADA')
  const reason = motivo.trim()
  if (reason.length < MOTIVO_MIN) throw new DemoError('VALIDACION', `El motivo debe tener al menos ${MOTIVO_MIN} caracteres`)
  const from = efectivo(r)
  const to = destino({ status: from, dueAt: r.dueAt }, accion)
  const nuevo: Registro = {
    ...r,
    status: to,
    voidReason: to === 'VOID' ? reason : r.voidReason,
    audit: [...r.audit, { at: new Date().toISOString(), actor: { type: 'OFFICER', label: s.nombre }, action: accion, from, to, reason }],
  }
  guardar(K.multas, todas.map((x) => (x.id === id ? nuevo : x)))
  return aDetalle(nuevo)
})
