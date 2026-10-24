// Adaptadores de la red en vivo (DTOs de /api/choques) a los tipos de la simulación, para reutilizar el mapa
// y las vistas. En vivo todos los nodos son teléfonos con la cámara trasera como dashcam.
import type { CrashAlertDTO, CrashAlertStatus, CrashIncidentDTO, CrashNodeDTO } from '@contracts'
import { normalizar, vista, type Captura, type Dir, type Incidente, type Nodo, type Punto } from '@/lib/choques/sim.ts'
import type { EstadoNodo } from './estados.ts'

export const FOV_TELEFONO = 130
export const ALCANCE_TELEFONO = 120

const DIRS: Array<[Dir, number]> = [['E', 0], ['S', 90], ['O', 180], ['N', 270]]
const dirDe = (rumbo: number): Dir => DIRS.reduce((m, d) => (Math.abs(normalizar(rumbo - d[1])) < Math.abs(normalizar(rumbo - m[1])) ? d : m))[0]

export function nodoDeRed(n: CrashNodeDTO, propioId: string | null): Nodo {
  return {
    id: n.id,
    nombre: n.name,
    tipo: 'TELEFONO',
    propio: n.id === propioId,
    pos: { x: n.x, y: n.y },
    dir: dirDe(n.heading),
    rumbo: n.heading,
    velocidad: 0,
    fov: FOV_TELEFONO,
    alcance: ALCANCE_TELEFONO,
    // Sin cámara activa se dibuja como "sin señal": no recibe alertas.
    senal: n.recording ? 'OK' : 'SIN',
    latenciaMs: 0,
    detenido: false,
  }
}

/** Cómo vio el choque un teléfono desde donde estaba en T0. */
export function capturaDeAlerta(a: CrashAlertDTO, choque: Punto, reporterId: string | null): Captura {
  const pos = { x: a.x, y: a.y }
  return {
    nodoId: a.nodeId,
    tipo: 'TELEFONO',
    propio: false,
    reportero: a.nodeId === reporterId,
    pos,
    rumbo: a.heading,
    fov: FOV_TELEFONO,
    ...vista({ pos, rumbo: a.heading, fov: FOV_TELEFONO, alcance: ALCANCE_TELEFONO }, choque),
    alertaEn: 0,
    perdida: a.status === 'MISSED',
    finCaptura: 0,
    listoEn: 0,
  }
}

/** Tiempos en el reloj del servidor (ms epoch): `servidorEn` es cuando se despachó la alerta. */
export function incidenteDeRed(i: CrashIncidentDTO): Incidente {
  const t0 = Date.parse(i.occurredAt)
  const pos = { x: i.x, y: i.y }
  return {
    id: `INC-${i.id.slice(-4).toUpperCase()}`,
    pos,
    t0,
    reportero: i.reporterId,
    confianza: 0,
    radioM: i.radiusM,
    centro: { x: i.centerX, y: i.centerY },
    servidorEn: t0,
    capturas: i.alerts.map((a) => capturaDeAlerta(a, pos, i.reporterId)),
  }
}

export const ESTADO_ALERTA: Record<CrashAlertStatus, EstadoNodo> = {
  PENDING: 'EN_CAMINO',
  CAPTURING: 'CAPTURANDO',
  UPLOADED: 'LISTO',
  MISSED: 'PERDIDO',
}

export function estadoEnVivo(i: CrashIncidentDTO | null, nodoId: string): EstadoNodo {
  const a = i?.alerts.find((x) => x.nodeId === nodoId)
  return a ? ESTADO_ALERTA[a.status] : 'GRABANDO'
}
