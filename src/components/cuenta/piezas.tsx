import { Check, WifiOff } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'
import type { Multa } from '@/lib/demo/api.ts'
import { esPagable } from '@/lib/demo/api.ts'
import { TIPO, ESTADO } from '@/lib/etiquetas.ts'
import { formatBs, formatFecha, formatHora } from '@/lib/format.ts'
import { Boton } from '@/components/ui/index.tsx'
import { cx, tarjeta } from '@/components/ui/estilos.ts'
import { EstadoBadge, EstadoTile, Monto, PlacaChip } from '@/components/vc/index.tsx'

/** Contenedor de cada pantalla: máx. 1160, margen 16 en móvil y 48 en desktop. */
export function Pagina({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto flex w-full max-w-[1160px] flex-col gap-5 px-4 pt-5 pb-6 lg:gap-6 lg:px-12 lg:pt-8 lg:pb-12', className)}>{children}</div>
}

export function Titulo({ children, antes, despues }: { children: ReactNode; antes?: ReactNode; despues?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      {antes && <span className="text-sm text-texto-2">{antes}</span>}
      <h1 className="font-display text-h1-m font-bold tracking-[-0.02em] lg:text-h1">{children}</h1>
      {despues && <span className="text-texto-2">{despues}</span>}
    </div>
  )
}

export const h2 = 'text-h2-m font-semibold lg:text-h2'
export const display = 'font-display text-display-m font-bold tracking-[-0.02em] lg:text-display'

export function ErrorCarga({ titulo, texto, onReintentar }: { titulo: string; texto: string; onReintentar: () => void }) {
  return (
    <div role="alert" className={cx(tarjeta, 'flex flex-col items-start gap-3 p-6')}>
      <span className="flex size-12 items-center justify-center rounded-control bg-ambar-bg text-ambar-osc">
        <WifiOff size={22} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="text-h3 font-semibold">{titulo}</span>
      <span className="text-texto-2">{texto}</span>
      <Boton onClick={onReintentar}>Reintentar</Boton>
    </div>
  )
}

/** Celebración en tinta con check lima que se dibuja en 400 ms. */
export function Celebra({ titulo, children, icono }: { titulo: string; children: ReactNode; icono?: ReactNode }) {
  return (
    <div className="tinta flex flex-col items-start gap-5 rounded-card bg-tinta p-6 lg:flex-row lg:items-center lg:p-8">
      <span className="flex size-[72px] flex-none items-center justify-center rounded-full bg-brand text-tinta">
        {icono ?? (
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path className="check" d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </span>
      <span className="flex flex-col gap-1.5">
        <span className="font-display text-display-m font-bold tracking-[-0.02em] text-card lg:text-display">{titulo}</span>
        {children}
      </span>
    </div>
  )
}

export function Vacio({ titulo, texto, icono }: { titulo: string; texto: string; icono?: ReactNode }) {
  return (
    <div className={cx(tarjeta, 'flex flex-col items-start gap-2.5 p-6')}>
      {icono ?? (
        <span className="tinta flex size-12 items-center justify-center rounded-control bg-tinta text-brand">
          <Check size={22} strokeWidth={2} aria-hidden="true" />
        </span>
      )}
      <span className="text-h3 font-semibold">{titulo}</span>
      <span className="text-texto-2">{texto}</span>
    </div>
  )
}

/** Fila de multa: tile por estado, chip de placa, infracción, fecha y lugar; monto mono y badge a la derecha. */
export function MultaFila({ m, i, conPagar, desde }: { m: Multa; i: number; conPagar?: boolean; desde: 'inicio' | 'multas' }) {
  const pagar = conPagar && esPagable(m)
  return (
    <li className={cx('entra flex flex-wrap items-center lg:flex-nowrap', i > 0 && 'border-t border-borde')} style={{ '--i': i } as CSSProperties}>
      <Link
        to={`/multas/${m.id}`}
        state={{ desde }}
        aria-label={`${TIPO[m.type]}, ${m.plate}, ${formatFecha(m.occurredAt)}, ${ESTADO[m.status]}, ${formatBs(m.amountCents)}. Ver detalle`}
        className="press flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left"
      >
        <EstadoTile status={m.status} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2"><PlacaChip value={m.plate} /><span className="font-semibold">{TIPO[m.type]}</span></span>
          <span className="text-caption text-texto-2 lg:truncate">{formatFecha(m.occurredAt)} · {formatHora(m.occurredAt)} · {m.intersection}</span>
        </span>
        <span className="flex flex-none flex-col items-end gap-1">
          <Monto cents={m.amountCents} anulada={m.status === 'VOID'} />
          <EstadoBadge status={m.status} />
        </span>
      </Link>
      {pagar && (
        <Link
          to={`/multas/${m.id}/pagar`}
          state={{ desde }}
          aria-label={`Pagar ${TIPO[m.type]} de ${m.plate}`}
          className="press mr-4 mb-3 ml-[68px] inline-flex h-10 flex-[1_1_100%] items-center justify-center rounded-control bg-rojo px-[18px] text-sm font-semibold text-contraste hover:bg-rojo-osc lg:mb-0 lg:ml-0 lg:flex-none"
        >
          Pagar
        </Link>
      )}
    </li>
  )
}

export function ListaMultas({ multas, conPagar, desde }: { multas: Multa[]; conPagar?: boolean; desde: 'inicio' | 'multas' }) {
  return (
    <ul className={cx(tarjeta, 'overflow-hidden')}>
      {multas.map((m, i) => <MultaFila key={m.id} m={m} i={i} conPagar={conPagar} desde={desde} />)}
    </ul>
  )
}

export function SkeletonLista({ grande }: { grande?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Cargando sus multas" className="flex flex-col gap-3">
      {grande && <span className="sk h-[180px] rounded-card" />}
      <span className="sk h-16 rounded-card" />
      <span className="sk h-16 rounded-card" />
      <span className="sk h-16 rounded-card" />
    </div>
  )
}
