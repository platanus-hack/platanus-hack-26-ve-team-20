import type { FineStatus, LightState, ViolationType } from '@contracts'
import type { Accion } from './oficial/demo.ts'

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

/** Estado en tipo oración para la interfaz ('Pendiente'); ESTADO queda en mayúsculas para el CSV. */
export const estadoTexto = (s: FineStatus) => ESTADO[s][0] + ESTADO[s].slice(1).toLowerCase()

export const LUZ: Record<LightState, string> = {
  RED: 'ROJO',
  YELLOW: 'AMARILLO',
  GREEN: 'VERDE',
  UNKNOWN: 'DESCONOCIDO',
}

/** Cambios de estado que puede hacer el policía (`/oficial/multas`). */
export const ACCION: Record<Accion, string> = {
  VOID: 'Anular multa',
  APPEAL_ACCEPT: 'Aceptar apelación',
  APPEAL_REJECT: 'Rechazar apelación',
}

/** `action` de cada entrada de la auditoría; una desconocida se muestra tal cual. */
export const AUDITORIA: Record<string, string> = {
  FINE_CREATED: 'Multa emitida',
  REVIEW_APPROVED: 'Revisión aprobada',
  PAID: 'Pago simulado',
  APPEALED: 'Apelación del ciudadano',
  VOID: 'Anulada',
  APPEAL_ACCEPT: 'Apelación aceptada',
  APPEAL_REJECT: 'Apelación rechazada',
  NOTIFICATION_RESENT: 'Notificación reenviada',
}
