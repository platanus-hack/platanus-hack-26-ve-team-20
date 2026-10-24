import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { SEMANA, atajos, cuadricula, fechaCorta, mesDe, nombreMes, ordenar, sumarMeses } from './calendario.ts'
import { cx } from './estilos.ts'

/**
 * Selector de rango de fechas con calendario propio (tokens del tema, sin colores de acento). Se abre desde una
 * cápsula; se elige el primer día y luego el último (pasar el cursor previsualiza el rango) o un atajo.
 * Teclado: Esc cierra y devuelve el foco; fuera del panel también cierra. Fechas como `YYYY-MM-DD`.
 */
export function RangoFechas({ desde, hasta, min, max, onCambio, className }: {
  desde: string
  hasta: string
  /** Primer día elegible (para «Todo» y para deshabilitar días anteriores). */
  min: string
  /** Último día elegible, normalmente hoy. */
  max: string
  onCambio: (desde: string, hasta: string) => void
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [mes, setMes] = useState(mesDe(hasta))
  const [inicio, setInicio] = useState<string | null>(null) // primer clic, mientras se espera el segundo
  const [sobre, setSobre] = useState<string | null>(null)
  const caja = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const id = useId()

  const cerrar = (devolverFoco: boolean) => {
    setAbierto(false)
    setInicio(null)
    setSobre(null)
    if (devolverFoco) boton.current?.focus()
  }

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => { if (!caja.current?.contains(e.target as Node)) cerrar(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(true) }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])

  // En pantallas bajas el panel puede quedar bajo el borde o la barra inferior: se desplaza hasta verlo entero.
  useEffect(() => { if (abierto) panel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [abierto])

  const abrir = () => { setMes(mesDe(hasta)); setInicio(null); setSobre(null); setAbierto(true) }
  const aplicar = (a: string, b: string) => {
    const [d, h] = ordenar(a, b)
    onCambio(d < min ? min : d, h > max ? max : h)
    cerrar(true)
  }
  const elegir = (d: string) => (inicio ? aplicar(inicio, d) : (setInicio(d), setSobre(d)))

  // Mientras se espera el segundo clic, el rango visible es inicio → cursor; si no, el aplicado.
  const [a, b] = inicio ? ordenar(inicio, sobre ?? inicio) : [desde, hasta]
  const celdas = cuadricula(mes)
  const anterior = sumarMeses(mes, -1)
  const siguiente = sumarMeses(mes, 1)

  return (
    <div ref={caja} className={cx('relative', className)}>
      <button
        ref={boton}
        type="button"
        onClick={() => (abierto ? cerrar(false) : abrir())}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        aria-label={`Rango de fechas: ${fechaCorta(desde)} a ${fechaCorta(hasta)}. Cambiar`}
        className="press flex h-12 w-full items-center gap-2.5 rounded-full border border-borde bg-card px-4 text-sm font-semibold transition-colors duration-150 hover:bg-suave"
      >
        <CalendarDays size={18} strokeWidth={1.9} aria-hidden="true" className="flex-none text-texto-2" />
        <span className="whitespace-nowrap">{fechaCorta(desde)} <span className="px-0.5 text-texto-3">–</span> {fechaCorta(hasta)}</span>
        <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className={cx('ml-auto flex-none text-texto-2 transition-transform duration-150', abierto && 'rotate-180')} />
      </button>

      {abierto && (
        <div ref={panel} id={id} role="dialog" aria-label="Elegir rango de fechas" className="absolute top-full left-0 z-30 mt-2 mb-20 w-[min(340px,calc(100vw-32px))] scroll-mb-24 rounded-[18px] border border-borde bg-card p-3.5 shadow-card">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setMes(anterior)} disabled={anterior < mesDe(min)} aria-label="Mes anterior" className="press flex size-10 items-center justify-center rounded-full text-texto-2 hover:bg-suave hover:text-tinta disabled:opacity-30">
              <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
            </button>
            <span role="status" aria-live="polite" className="font-semibold">{nombreMes(mes)}</span>
            <button type="button" onClick={() => setMes(siguiente)} disabled={siguiente > mesDe(max)} aria-label="Mes siguiente" className="press flex size-10 items-center justify-center rounded-full text-texto-2 hover:bg-suave hover:text-tinta disabled:opacity-30">
              <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 text-center text-caption text-texto-3" aria-hidden="true">
            {SEMANA.map((s, i) => <span key={i} className="flex h-8 items-center justify-center">{s}</span>)}
          </div>
          <div role="grid" aria-label={nombreMes(mes)} className="grid grid-cols-7" onPointerLeave={() => setSobre(null)}>
            {celdas.map((c) => {
              const fuera = c.dia < min || c.dia > max
              const extremo = c.dia === a || c.dia === b
              const dentro = c.dia > a && c.dia < b
              return (
                <button
                  key={c.dia}
                  type="button"
                  role="gridcell"
                  disabled={fuera}
                  aria-selected={extremo || dentro}
                  aria-label={fechaCorta(c.dia)}
                  onClick={() => elegir(c.dia)}
                  onPointerEnter={() => inicio && setSobre(c.dia)}
                  onFocus={() => inicio && setSobre(c.dia)}
                  className={cx(
                    'relative flex h-9 items-center justify-center text-sm transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-25',
                    dentro && 'bg-suave',
                    c.dia === a && c.dia !== b && 'rounded-l-full bg-suave',
                    c.dia === b && c.dia !== a && 'rounded-r-full bg-suave',
                    !c.delMes && !extremo && 'text-texto-3',
                  )}
                >
                  <span className={cx('flex size-8 items-center justify-center rounded-full font-mono', extremo ? 'bg-tinta font-bold text-card' : !fuera && 'hover:bg-borde', c.dia === max && !extremo && 'ring-1 ring-borde')}>
                    {Number(c.dia.slice(8))}
                  </span>
                </button>
              )
            })}
          </div>

          <p className="mt-1.5 min-h-4 text-caption text-texto-2" role="status">{inicio ? 'Elija el último día del rango.' : ' '}</p>
          <div className="mt-1 flex flex-wrap gap-2 border-t border-borde pt-3">
            {atajos(max, min).map((x) => (
              <button key={x.id} type="button" onClick={() => aplicar(x.desde, x.hasta)} className={cx('press h-9 rounded-full border px-3 text-[13px] font-semibold transition-colors duration-150', x.desde === desde && x.hasta === hasta ? 'border-tinta text-tinta' : 'border-borde text-texto-2 hover:text-tinta')}>
                {x.nombre}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
