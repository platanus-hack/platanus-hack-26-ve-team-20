// Evidencia de la infracción: las 3 fotos que guarda el modo en vivo (ml/app/en_vivo.py → POST /api/live/violations):
// la escena en el instante del cruce (semáforo, línea de pare y vehículo marcado), el vehículo y la placa.
// La usan los detalles de multa público, del ciudadano y del oficial.
import { useState } from 'react'
import { PastillaTinta } from '@/components/vc/index.tsx'
import { cx } from '@/components/ui/estilos.ts'
import { formatHora } from '@/lib/format.ts'
import { fotosDeInfraccion, srcEvidencia, type EvidenciaItem } from './fotos.ts'

export { tieneFotos } from './fotos.ts'

function Foto({ item, titulo, alt, className, contain }: { item?: EvidenciaItem; titulo: string; alt: string; className?: string; contain?: boolean }) {
  const [rota, setRota] = useState(false)
  return (
    <figure className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="relative overflow-hidden rounded-card bg-tinta-2">
        {item?.url && !rota
          ? <img src={srcEvidencia(item.url)} alt={alt} loading="lazy" onError={() => setRota(true)} className={cx('block aspect-video w-full', contain ? 'object-contain' : 'object-cover')} />
          : <div className="flex aspect-video w-full items-center justify-center text-caption text-niebla">No disponible</div>}
      </div>
      <figcaption className="text-caption font-semibold text-texto-2">{titulo}</figcaption>
    </figure>
  )
}

export function EvidenciaInfraccion({ items, camara }: { items: readonly EvidenciaItem[]; camara?: string }) {
  const { escena, vehiculo, placa } = fotosDeInfraccion(items)
  const enRojo = escena?.lightState !== 'GREEN'
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="relative col-span-2">
        <Foto item={escena} titulo="1 · Escena: cruce de la línea con el semáforo en rojo" alt={`Escena de la infracción${camara ? `, cámara ${camara}` : ''}`} />
        {escena?.capturedAt && (
          <PastillaTinta className="left-2.5" punto={cx('size-2', enRojo ? 'bg-rojo' : 'bg-verde')}>
            {enRojo ? 'Luz roja' : 'Luz verde'} · <span className="font-mono">{formatHora(escena.capturedAt)}</span>
          </PastillaTinta>
        )}
        {camara && <PastillaTinta className="right-2.5 font-mono font-bold">{camara}</PastillaTinta>}
      </div>
      <Foto item={vehiculo} titulo="2 · Vehículo" alt="Vehículo en el momento de la infracción" />
      <Foto item={placa} titulo="3 · Placa" alt="Placa del vehículo" contain />
    </div>
  )
}
