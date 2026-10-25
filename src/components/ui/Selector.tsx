import { Check, ChevronDown, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { cx } from './estilos.ts'

export interface OpcionSelector { valor: string; etiqueta: string; mono?: boolean }

/**
 * Selector con lista propia (la nativa no respeta el tema): botón + listbox con flechas, Inicio/Fin, Enter/Espacio
 * y Esc. `valor` debe ser uno de los de `opciones`; la primera suele ser «Todas».
 */
export function Selector({ valor, opciones, onCambio, etiqueta, Icono, className }: {
  valor: string
  opciones: OpcionSelector[]
  onCambio: (v: string) => void
  /** Nombre accesible del campo (p. ej. «Placa»). */
  etiqueta: string
  Icono?: LucideIcon
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [activa, setActiva] = useState(0)
  const caja = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const id = useId()
  const actual = opciones.find((o) => o.valor === valor) ?? opciones[0]

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [abierto])

  useEffect(() => { if (abierto) lista.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [abierto])

  const abrir = () => { setActiva(Math.max(0, opciones.findIndex((o) => o.valor === valor))); setAbierto(true) }
  const elegir = (v: string) => { onCambio(v); setAbierto(false); boton.current?.focus() }
  const tecla = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!abierto) return abrir()
      setActiva((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + opciones.length) % opciones.length)
    } else if (e.key === 'Home' || e.key === 'End') {
      if (!abierto) return
      e.preventDefault()
      setActiva(e.key === 'Home' ? 0 : opciones.length - 1)
    } else if ((e.key === 'Enter' || e.key === ' ') && abierto) {
      e.preventDefault()
      const o = opciones[activa]
      if (o) elegir(o.valor)
    } else if (e.key === 'Escape' && abierto) {
      e.stopPropagation()
      setAbierto(false)
    }
  }

  return (
    <div ref={caja} className={cx('relative', className)}>
      <button
        ref={boton}
        type="button"
        role="combobox"
        aria-label={etiqueta}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        aria-activedescendant={abierto ? `${id}-${activa}` : undefined}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        onKeyDown={tecla}
        className="press flex h-12 w-full items-center gap-2.5 rounded-full border border-borde bg-card px-4 text-sm font-semibold transition-colors duration-150 hover:bg-suave"
      >
        {Icono && <Icono size={18} strokeWidth={1.9} aria-hidden="true" className="flex-none text-texto-2" />}
        <span className={cx('truncate', actual?.mono && 'font-mono')}>{actual?.etiqueta}</span>
        <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className={cx('ml-auto flex-none text-texto-2 transition-transform duration-150', abierto && 'rotate-180')} />
      </button>
      {abierto && (
        <ul ref={lista} id={id} role="listbox" aria-label={etiqueta} className="absolute top-full left-0 z-30 mt-2 mb-20 max-h-72 w-full min-w-[200px] overflow-y-auto rounded-[18px] border border-borde bg-card p-1.5 shadow-card">
          {opciones.map((o, i) => (
            <li
              key={o.valor}
              id={`${id}-${i}`}
              role="option"
              aria-selected={o.valor === valor}
              onPointerEnter={() => setActiva(i)}
              onClick={() => elegir(o.valor)}
              className={cx('flex min-h-11 cursor-pointer items-center gap-2 rounded-[12px] px-3 text-sm font-semibold', i === activa ? 'bg-suave' : '', o.mono && 'font-mono')}
            >
              <span className="flex-1 truncate">{o.etiqueta}</span>
              {o.valor === valor && <Check size={16} strokeWidth={2.2} aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
