import { Check, ChevronRight, WifiOff } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'
import type { Multa } from '@/lib/demo/api.ts'
import { TIPO, estadoTexto } from '@/lib/etiquetas.ts'
import { formatBs, formatFecha } from '@/lib/format.ts'
import { Boton } from '@/components/ui/index.tsx'
import { cx, tarjeta } from '@/components/ui/estilos.ts'
import { EstadoTile, Monto } from '@/components/vc/index.tsx'
import { EST } from '@/components/vc/estados.ts'

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

const diaMes = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', timeZone: 'America/Caracas' })

/** Fila de multa: qué pasó, placa y fecha, monto y estado. El pago se hace desde el detalle. */
export function MultaFila({ m, i, desde }: { m: Multa; i: number; desde: 'inicio' | 'multas' }) {
  const e = EST[m.status]
  return (
    <li className="entra" style={{ '--i': i } as CSSProperties}>
      {i > 0 && <span aria-hidden="true" className="ml-[68px] block h-px bg-borde" />}
      <Link
        to={`/multas/${m.id}`}
        state={{ desde }}
        aria-label={`${TIPO[m.type]}, ${m.plate}, ${formatFecha(m.occurredAt)}, ${estadoTexto(m.status)}, ${formatBs(m.amountCents)}. Ver detalle`}
        className="group flex min-h-[68px] items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-suave"
      >
        <EstadoTile status={m.status} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-semibold">{TIPO[m.type]}</span>
          <span className="text-caption text-texto-2"><span className="font-mono font-semibold">{m.plate}</span> · {diaMes.format(new Date(m.occurredAt)).replace('.', '').replace('sept', 'sep')}</span>
        </span>
        <span className="flex flex-none flex-col items-end gap-0.5">
          <Monto cents={m.amountCents} anulada={m.status === 'VOID'} className="text-[15px]" />
          <span className={cx('text-caption font-semibold', e.txt)}>{estadoTexto(m.status)}</span>
        </span>
        <ChevronRight size={18} strokeWidth={2} aria-hidden="true" className="flex-none text-texto-3 transition-transform duration-150 group-hover:translate-x-0.5" />
      </Link>
    </li>
  )
}

export function ListaMultas({ multas, desde }: { multas: Multa[]; desde: 'inicio' | 'multas' }) {
  return (
    <ul className={cx(tarjeta, 'overflow-hidden')}>
      {multas.map((m, i) => <MultaFila key={m.id} m={m} i={i} desde={desde} />)}
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
