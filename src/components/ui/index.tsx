import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { boton, cx, type Variante } from './estilos.ts'

export function Boton({ variante, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return <button type="button" {...p} className={boton(variante, className)} />
}

export function BotonLink({ variante, className, ...p }: LinkProps & { variante?: Variante }) {
  return <Link {...p} className={boton(variante, className)} />
}

// ---------------------------------------------------------------- campos (label arriba, error debajo)
export function Campo({ id, label, error, ayuda, children }: { id: string; label: ReactNode; error?: string | false | null; ayuda?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      {children}
      {error && <span id={`${id}-err`} className="text-caption text-rojo-osc">{error}</span>}
      {ayuda && <span id={`${id}-ayuda`} className="text-caption text-texto-2">{ayuda}</span>}
    </div>
  )
}

export function SelectCedula({ value, onChange }: { value: string; onChange: (v: 'V' | 'E') => void }) {
  return (
    <select
      aria-label="Tipo de cédula"
      value={value}
      onChange={(e) => onChange(e.target.value === 'E' ? 'E' : 'V')}
      className="h-12 w-[76px] flex-none rounded-control border border-input bg-card px-2.5 font-mono text-base font-bold"
    >
      <option value="V">V</option>
      <option value="E">E</option>
    </select>
  )
}

// ---------------------------------------------------------------- Sheet y modal sobre <dialog> (foco atrapado, Escape y velo del navegador)
export function Hoja({ abierta, onCerrar, etiqueta, modo = 'sheet', bloqueada = false, children }: {
  abierta: boolean
  onCerrar: () => void
  etiqueta: string
  modo?: 'sheet' | 'modal'
  /** Mientras se envía algo: ni Escape ni clic fuera la cierran. */
  bloqueada?: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (abierta && !d.open) d.showModal()
    if (!abierta && d.open) d.close()
  }, [abierta])
  return (
    <dialog
      ref={ref}
      aria-label={etiqueta}
      className={modo}
      onClose={onCerrar}
      onCancel={(e) => { if (bloqueada) e.preventDefault() }}
      onClick={(e) => { if (e.target === e.currentTarget && !bloqueada) onCerrar() }}
    >
      {modo === 'sheet' ? (
        <div className="flex flex-col rounded-t-card bg-card px-4 pt-2.5 pb-6 shadow-sheet">
          <span aria-hidden="true" className="mb-2 h-1 w-10 self-center rounded-sm bg-borde" />
          {children}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 rounded-card bg-card p-6 shadow-modal">{children}</div>
      )}
    </dialog>
  )
}

// ---------------------------------------------------------------- pestañas: pista suave, pastilla tinta que se desliza 220 ms
export function Pestanas<T extends string>({ opciones, valor, onCambio, etiqueta }: {
  opciones: Array<{ id: T; nombre: string; n?: number }>
  valor: T
  onCambio: (v: T) => void
  etiqueta: string
}) {
  const i = Math.max(0, opciones.findIndex((o) => o.id === valor))
  return (
    <div role="tablist" aria-label={etiqueta} className="relative grid max-w-[520px] rounded-control bg-suave p-1" style={{ gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }}>
      <span
        aria-hidden="true"
        className="absolute top-1 bottom-1 left-1 rounded-[10px] bg-tinta transition-transform duration-[220ms] ease-sheet motion-reduce:transition-none"
        style={{ width: `calc((100% - 8px) / ${opciones.length})`, transform: `translateX(${i * 100}%)` }}
      />
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={o.id === valor}
          onClick={() => onCambio(o.id)}
          className={cx('relative h-10 rounded-[10px] text-sm font-semibold transition-colors duration-[220ms]', o.id === valor ? 'text-card' : 'text-texto-2')}
        >
          {o.nombre} {o.n != null && <span className="font-mono">{o.n}</span>}
        </button>
      ))}
    </div>
  )
}

export function Interruptor({ activo, onCambio, etiqueta }: { activo: boolean; onCambio: (v: boolean) => void; etiqueta: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={() => onCambio(!activo)}
      className={cx('flex h-8 w-[52px] rounded-full p-1 transition-colors duration-[220ms]', activo ? 'justify-end bg-tinta' : 'justify-start bg-input')}
    >
      <span className={cx('size-6 rounded-full', activo ? 'bg-brand' : 'bg-card')} />
    </button>
  )
}
