import { estadoCaptura, type EstadoCaptura, type Incidente } from '@/lib/choques/sim.ts'

/** Lo que muestra el mapa por nodo: fuera de un incidente todos están grabando su buffer. */
export type EstadoNodo = EstadoCaptura | 'GRABANDO'

/** Colores sobre el mapa tinta. El lima (clip listo) solo vive sobre tinta. */
export const COLOR: Record<EstadoNodo, string> = {
  GRABANDO: '#A9B4C4',
  EN_CAMINO: '#F5A524',
  CAPTURANDO: '#FF5A4A',
  SUBIENDO: '#6F9BFF',
  LISTO: '#C6F24E',
  PERDIDO: '#667085',
}

export const ETIQUETA: Record<EstadoNodo, string> = {
  GRABANDO: 'Grabando',
  EN_CAMINO: 'Alerta en camino',
  CAPTURANDO: 'Capturando',
  SUBIENDO: 'Subiendo',
  LISTO: 'Clip listo',
  PERDIDO: 'Perdido',
}

export function estadoNodo(inc: Incidente | null, nodoId: string, ahora: number): EstadoNodo {
  const c = inc?.capturas.find((x) => x.nodoId === nodoId)
  if (!inc || !c) return 'GRABANDO'
  const s = estadoCaptura(c, ahora)
  // Antes de que el servidor despache, la alerta todavía no existe para nadie.
  if (s === 'EN_CAMINO' && (c.reportero || inc.servidorEn == null || ahora < inc.servidorEn)) return 'GRABANDO'
  return s
}

/** Dónde quedó el choque en el cuadro de ese nodo. */
export function orientacion(anguloRel: number): string {
  const a = Math.abs(anguloRel)
  if (a <= 35) return 'de frente'
  if (a <= 110) return anguloRel > 0 ? 'a la derecha' : 'a la izquierda'
  return 'detrás'
}
