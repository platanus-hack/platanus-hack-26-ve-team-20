import type { FineStatus } from '@contracts'
import { Ban, CircleAlert, CircleCheck, Clock, Scale, type LucideIcon } from 'lucide-react'

/** Par texto/fondo e ícono por estado: nunca solo el color. */
export const EST: Record<FineStatus, { cls: string; txt: string; Icono: LucideIcon }> = {
  PENDING: { cls: 'bg-rojo-bg text-rojo-osc', txt: 'text-rojo-osc', Icono: Clock },
  OVERDUE: { cls: 'bg-rojo-bg text-rojo-osc', txt: 'text-rojo-osc', Icono: CircleAlert },
  PAID: { cls: 'bg-verde-bg text-verde-osc', txt: 'text-verde-osc', Icono: CircleCheck },
  APPEALED: { cls: 'bg-azul-bg text-azul-osc', txt: 'text-azul-osc', Icono: Scale },
  VOID: { cls: 'bg-gris-bg text-texto-2', txt: 'text-texto-2', Icono: Ban },
}
