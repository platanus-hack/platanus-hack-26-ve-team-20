// Datos de ejemplo de la cuenta del ciudadano (todos ficticios). Sección "Datos de ejemplo" del brief C.
import type { FineStatus, LightState, ViolationType } from '@contracts'

export interface Multa {
  id: string
  plate: string
  type: ViolationType
  status: FineStatus
  occurredAt: string
  intersection: string
  cameraCode: string
  amountCents: number
  currency: 'VES'
  dueAt: string
  verification: 'AUTO' | 'HUMAN'
  confidence: number
  paidAt: string | null
  paymentReference: string | null
  voidReason: string | null
  appealedAt: string | null
}

export interface Vehiculo {
  plate: string
  brand: string
  model: string
  color: string
  year: number
}

export interface Camara {
  code: string
  intersection: string
  /** `null` = sin señal. */
  light: LightState | null
  detectionsToday: number | null
  capturedAt: string
  /** Cambia con cada fotograma; la pantalla mueve el vehículo del marcador según este valor. */
  frame: number
}

export const CEDULA_DEMO = 'V99000001'
export const TELEFONO_DEMO = '04120000001'
/** Cédula que el prototipo trata como "ya registrada". */
export const CEDULA_REGISTRADA = 'V12345678'
/** Contraseña que el prototipo trata como incorrecta. */
export const CLAVE_INCORRECTA = 'clave-mal'

const L1 = 'Av. Demo Norte con Calle 1 (ejemplo)'
const L2 = 'Av. Demo Sur con Calle 4 (ejemplo)'
const L3 = 'Av. Demo Este con Calle 3 (ejemplo)'
const L4 = 'Av. Demo Oeste con Calle 2 (ejemplo)'

const base = { amountCents: 125_000, currency: 'VES' as const, paidAt: null, paymentReference: null, voidReason: null, appealedAt: null }

// Instantes en UTC; la pantalla los muestra en hora de Caracas (UTC−4).
export const MULTAS_DEMO: Multa[] = [
  { ...base, id: 'm1', plate: 'AB123CD', type: 'RED_LIGHT', status: 'PENDING', occurredAt: '2026-10-24T14:03:00Z', intersection: L1, cameraCode: 'CAM-001', dueAt: '2026-11-23T16:00:00Z', verification: 'AUTO', confidence: 0.91 },
  { ...base, id: 'm2', plate: 'CD456EF', type: 'TURN_ARROW', status: 'OVERDUE', occurredAt: '2026-09-21T12:47:00Z', intersection: L3, cameraCode: 'CAM-003', dueAt: '2026-10-21T16:00:00Z', verification: 'HUMAN', confidence: 0.78 },
  { ...base, id: 'm3', plate: 'AB123CD', type: 'SPEEDING', status: 'PAID', occurredAt: '2026-08-02T22:20:00Z', intersection: L2, cameraCode: 'CAM-002', dueAt: '2026-09-01T16:00:00Z', verification: 'HUMAN', confidence: 0.86, paidAt: '2026-08-05T15:12:00Z', paymentReference: 'SIM-30418822' },
  { ...base, id: 'm4', plate: 'AB123CD', type: 'RED_LIGHT', status: 'PAID', occurredAt: '2026-06-15T11:55:00Z', intersection: L2, cameraCode: 'CAM-002', dueAt: '2026-07-15T16:00:00Z', verification: 'AUTO', confidence: 0.94, paidAt: '2026-06-18T13:40:00Z', paymentReference: 'SIM-27115409' },
  { ...base, id: 'm5', plate: 'AB123CD', type: 'RED_LIGHT', status: 'PAID', occurredAt: '2026-04-03T17:10:00Z', intersection: L1, cameraCode: 'CAM-001', dueAt: '2026-05-03T16:00:00Z', verification: 'AUTO', confidence: 0.92, paidAt: '2026-04-04T14:05:00Z', paymentReference: 'SIM-19902376' },
  { ...base, id: 'm6', plate: 'AB123CD', type: 'RED_LIGHT', status: 'VOID', occurredAt: '2026-03-12T02:31:00Z', intersection: L4, cameraCode: 'CAM-004', dueAt: '2026-04-11T16:00:00Z', verification: 'HUMAN', confidence: 0.89, voidReason: 'vehículo de emergencia' },
]

export const VEHICULOS_DEMO: Vehiculo[] = [
  { plate: 'AB123CD', brand: 'Toyota', model: 'Corolla', color: 'Gris', year: 2018 },
  { plate: 'CD456EF', brand: 'Chevrolet', model: 'Aveo', color: 'Blanco', year: 2012 },
]

export const CAMARAS_DEMO: Array<Omit<Camara, 'capturedAt' | 'frame'>> = [
  { code: 'CAM-001', intersection: L1, light: 'RED', detectionsToday: 14 },
  { code: 'CAM-002', intersection: L2, light: 'GREEN', detectionsToday: 9 },
  { code: 'CAM-003', intersection: L3, light: 'YELLOW', detectionsToday: 22 },
  { code: 'CAM-004', intersection: L4, light: null, detectionsToday: null },
]

export const BANCOS_DEMO = [
  { code: '0102', name: 'Banco de Venezuela (ejemplo)' },
  { code: '0105', name: 'Mercantil (ejemplo)' },
  { code: '0134', name: 'Banesco (ejemplo)' },
  { code: '0191', name: 'BNC (ejemplo)' },
]
