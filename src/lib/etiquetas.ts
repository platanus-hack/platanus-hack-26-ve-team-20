import type { FineStatus, LightState, ViolationType } from '@contracts'

// Etiquetas exactas del brief: Luz roja / Flecha de giro / Exceso de velocidad; PENDIENTE, VENCIDA, PAGADA, APELADA, ANULADA.
export const TIPO: Record<ViolationType, string> = {
  RED_LIGHT: 'Luz roja',
  TURN_ARROW: 'Flecha de giro',
  SPEEDING: 'Exceso de velocidad',
}

export const ESTADO: Record<FineStatus, string> = {
  PENDING: 'PENDIENTE',
  OVERDUE: 'VENCIDA',
  PAID: 'PAGADA',
  APPEALED: 'APELADA',
  VOID: 'ANULADA',
}

export const LUZ: Record<LightState, string> = {
  RED: 'ROJO',
  YELLOW: 'AMARILLO',
  GREEN: 'VERDE',
  UNKNOWN: 'DESCONOCIDO',
}
