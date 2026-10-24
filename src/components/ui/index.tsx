import { ChevronDown, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { useTema, type Tema } from '@/hooks/useTema.ts'
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

/** V/E: la letra y la flecha van centradas juntas; el select nativo, invisible encima, conserva teclado y lector de pantalla. */
export function SelectCedula({ value, onChange }: { value: string; onChange: (v: 'V' | 'E') => void }) {
  return (
    <span className="relative flex h-12 w-[76px] flex-none items-center justify-center gap-1.5 rounded-control border border-input bg-card font-mono text-base font-bold has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-azul">
      <span aria-hidden="true">{value}</span>
      <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className="text-texto-2" />
      <select
        aria-label="Tipo de cédula"
        value={value}
        onChange={(e) => onChange(e.target.value === 'E' ? 'E' : 'V')}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0 outline-none"
      >
        <option value="V">V</option>
        <option value="E">E</option>
      </select>
    </span>
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

// ---------------------------------------------------------------- pestañas: pista suave, pastilla clara que se desliza 220 ms
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
        className="absolute top-1 bottom-1 left-1 rounded-[10px] bg-card shadow-card transition-transform duration-[220ms] ease-sheet motion-reduce:transition-none"
        style={{ width: `calc((100% - 8px) / ${opciones.length})`, transform: `translateX(${i * 100}%)` }}
      />
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={o.id === valor}
          onClick={() => onCambio(o.id)}
          className={cx('relative h-10 rounded-[10px] text-sm font-semibold transition-colors duration-[220ms]', o.id === valor ? 'text-tinta' : 'text-texto-2 hover:text-tinta')}
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
      className={cx('flex h-8 w-[52px] rounded-full p-1 transition-colors duration-[220ms]', activo ? 'justify-end bg-primario' : 'justify-start bg-input')}
    >
      <span className={cx('size-6 rounded-full', activo ? 'bg-boli-on' : 'bg-card')} />
    </button>
  )
}

// ---------------------------------------------------------------- tema (claro / oscuro / sistema)
const TEMAS: Array<{ id: Tema; nombre: string; Icono: LucideIcon }> = [
  { id: 'claro', nombre: 'Claro', Icono: Sun },
  { id: 'oscuro', nombre: 'Oscuro', Icono: Moon },
  { id: 'sistema', nombre: 'Sistema', Icono: Monitor },
]

/** Tres estados en pista suave; el activo lleva pastilla clara. */
export function SelectorTema({ className }: { className?: string }) {
  const [tema, cambiar] = useTema()
  return (
    <div role="radiogroup" aria-label="Tema" className={cx('grid grid-cols-3 rounded-control bg-suave p-1', className)}>
      {TEMAS.map(({ id, nombre, Icono }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={tema === id}
          onClick={() => cambiar(id)}
          className={cx('flex h-10 items-center justify-center gap-1.5 rounded-[10px] text-sm font-semibold', tema === id ? 'bg-card text-tinta shadow-card' : 'text-texto-2 hover:text-tinta')}
        >
          <Icono size={16} strokeWidth={1.75} aria-hidden="true" />
          {nombre}
        </button>
      ))}
    </div>
  )
}

/** Ícono discreto que rota claro → oscuro → sistema. */
export function BotonTema({ className }: { className?: string }) {
  const [tema, cambiar] = useTema()
  const i = TEMAS.findIndex((t) => t.id === tema)
  const { nombre, Icono } = TEMAS[i]!
  const siguiente = TEMAS[(i + 1) % TEMAS.length]!
  return (
    <button
      type="button"
      onClick={() => cambiar(siguiente.id)}
      aria-label={`Tema: ${nombre}. Cambiar a ${siguiente.nombre.toLowerCase()}`}
      title={`Tema: ${nombre}`}
      className={cx('flex size-11 items-center justify-center rounded-control text-texto-2 hover:text-tinta', className)}
    >
      <Icono size={20} strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}

const OSCURO_MQ = '(prefers-color-scheme: dark)'
const sistemaOscuro = () => typeof window !== 'undefined' && window.matchMedia?.(OSCURO_MQ).matches === true
const oirSistema = (f: () => void) => {
  const mq = window.matchMedia?.(OSCURO_MQ)
  mq?.addEventListener('change', f)
  return () => mq?.removeEventListener('change', f)
}

/** Interruptor claro/oscuro: el círculo se desliza en 220 ms entre el sol y la luna. Con «sistema» muestra el tema que rige. */
export function InterruptorTema({ className }: { className?: string }) {
  const [tema, cambiar] = useTema()
  const delSistema = useSyncExternalStore(oirSistema, sistemaOscuro, () => false)
  const oscuro = tema === 'oscuro' || (tema === 'sistema' && delSistema)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={oscuro}
      aria-label="Modo oscuro"
      title={oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      onClick={() => cambiar(oscuro ? 'claro' : 'oscuro')}
      className={cx('group flex h-11 items-center rounded-full', className)}
    >
      <span className="relative flex h-8 w-[60px] items-center justify-between rounded-full border border-borde bg-suave px-2 text-texto-3 transition-colors duration-200 group-hover:border-input">
        <Sun size={14} strokeWidth={2} aria-hidden="true" />
        <Moon size={14} strokeWidth={2} aria-hidden="true" />
        <span
          aria-hidden="true"
          className={cx(
            'absolute top-[3px] left-[3px] flex size-6 items-center justify-center rounded-full bg-card text-tinta shadow-card transition-transform duration-[220ms] ease-sheet motion-reduce:transition-none',
            oscuro && 'translate-x-7',
          )}
        >
          {oscuro ? <Moon size={14} strokeWidth={2} /> : <Sun size={14} strokeWidth={2} className="text-ambar-osc" />}
        </span>
      </span>
    </button>
  )
}
