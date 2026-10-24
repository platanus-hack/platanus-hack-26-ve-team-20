// Qué foto de la evidencia es la escena, el vehículo y la placa (sin React, para poder testearlo).
import type { EvidenceKind, LightState } from '@contracts'

export interface EvidenciaItem { kind: EvidenceKind; url: string; capturedAt?: string; lightState?: LightState | null }

interface Fotos { escena?: EvidenciaItem; vehiculo?: EvidenciaItem; placa?: EvidenciaItem }

/** Reparte la evidencia en escena / vehículo / placa por el nombre del archivo; si no, por orden de los fotogramas. */
export function fotosDeInfraccion(items: readonly EvidenciaItem[]): Fotos {
  const frames = items.filter((e) => e.kind === 'FRAME' || e.kind === 'ANNOTATED')
  const escena = frames.find((e) => /escena/i.test(e.url)) ?? frames[0]
  const vehiculo = frames.find((e) => /vehiculo/i.test(e.url)) ?? frames.find((e) => e !== escena)
  const placa = items.find((e) => e.kind === 'PLATE_CROP')
  return { escena, vehiculo, placa }
}

export const tieneFotos = (items: readonly EvidenciaItem[]) => {
  const f = fotosDeInfraccion(items)
  return Boolean(f.escena?.url || f.vehiculo?.url || f.placa?.url)  // los ejemplos sin foto siguen con el dibujo
}
