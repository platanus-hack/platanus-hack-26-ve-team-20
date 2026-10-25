import { ArrowDown, ArrowUp, CalendarDays, Car, Clock, EllipsisVertical } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router'
import { esPagable, getMultas, getVehiculos, type Multa } from '@/lib/demo/api.ts'
import { TIPO, estadoTexto } from '@/lib/etiquetas.ts'
import { diaCaracas, diasEntre, formatBs, formatFecha } from '@/lib/format.ts'
import { useCarga } from '@/hooks/useCarga.ts'
import { RangoFechas } from '@/components/ui/RangoFechas.tsx'
import { Selector } from '@/components/ui/Selector.tsx'
import { esDia } from '@/components/ui/calendario.ts'
import { cx } from '@/components/ui/estilos.ts'
import { ErrorCarga, ListaMultas, Vacio } from '@/components/cuenta/piezas.tsx'

type Tab = 'todas' | 'por-pagar' | 'pagadas' | 'otras'
const TABS: Array<[Tab, string]> = [['todas', 'Todas'], ['por-pagar', 'Por pagar'], ['pagadas', 'Pagadas'], ['otras', 'Otras']]
const FILTRO: Record<Tab, (m: Multa) => boolean> = {
  todas: () => true,
  'por-pagar': esPagable,
  pagadas: (m) => m.status === 'PAID',
  otras: (m) => m.status === 'APPEALED' || m.status === 'VOID',
}
const VACIO: Record<Tab, [string, string]> = {
  todas: ['Sin multas', 'No tiene multas registradas'],
  'por-pagar': ['Está al día', 'No tiene multas por pagar'],
  pagadas: ['Aún no hay pagos', 'Cuando pague una multa, su comprobante aparecerá aquí.'],
  otras: ['Nada por aquí', 'No tiene multas apeladas ni anuladas.'],
}
// Punto y texto del estado: el color acompaña a la palabra, nunca la reemplaza.
const ESTADO_COLOR: Record<Multa['status'], [string, string]> = {
  PENDING: ['bg-ambar', 'text-ambar-osc'],
  OVERDUE: ['bg-rojo', 'text-rojo-osc'],
  PAID: ['bg-verde', 'text-verde-osc'],
  APPEALED: ['bg-tinta', 'text-tinta'],
  VOID: ['bg-texto-3', 'text-texto-2'],
}

type Orden = { col: 'fecha' | 'vence'; dir: 'asc' | 'desc' }
// Debajo de 1280 la columna N.º se oculta y Placa pasa a ser el borde izquierdo de la fila.
const primeraVisible = 'rounded-l-xl border-l xl:rounded-l-none xl:border-l-0'
const celda = 'h-14 border-y border-borde bg-card px-3 first:rounded-l-xl xl:px-4 first:border-l last:rounded-r-xl last:border-r'

/** Encabezado que ordena la tabla; la flecha atenuada indica que la columna no es la activa. */
function CabeceraOrden({ col, orden, onOrdenar, children }: { col: Orden['col']; orden: Orden; onOrdenar: (col: Orden['col']) => void; children: string }) {
  const activa = orden.col === col
  const Flecha = activa && orden.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <button type="button" onClick={() => onOrdenar(col)} className="flex min-h-11 items-center gap-1 font-semibold">
      {children}<Flecha size={13} strokeWidth={2.4} aria-hidden="true" className={cx('transition-opacity duration-150', !activa && 'opacity-35')} />
    </button>
  )
}

/** Tiempo para pagar: días hasta el vencimiento, "Vencida" o nada si ya no se paga. */
function Vence({ m, hoy }: { m: Multa; hoy: string }) {
  if (m.status === 'OVERDUE') return <span className="flex items-center gap-1.5 text-rojo-osc"><Clock size={15} strokeWidth={2} aria-hidden="true" />Vencida</span>
  if (m.status !== 'PENDING') return <span className="text-texto-3">—</span>
  const dias = diasEntre(hoy, m.dueAt)
  return <span className="flex items-center gap-1.5"><Clock size={15} strokeWidth={2} aria-hidden="true" className="text-texto-2" />{dias <= 0 ? 'Hoy' : `${dias} ${dias === 1 ? 'día' : 'días'}`}</span>
}

/** Menú ⋮ de una fila: ver detalle y, según el estado, pagar o ver el comprobante. Escape o un clic fuera lo cierran. */
function Acciones({ m, abierto, setMenu }: { m: Multa; abierto: boolean; setMenu: (id: string | null) => void }) {
  const caja = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => { if (!caja.current?.contains(e.target as Node)) setMenu(null) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(null); boton.current?.focus() } }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    caja.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus()
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto, setMenu])
  const item = 'flex min-h-10 items-center rounded-lg px-3 text-sm whitespace-nowrap no-underline transition-colors duration-150 hover:bg-suave focus-visible:bg-suave'
  return (
    <div ref={caja} className="relative z-10 flex justify-center">
      <button ref={boton} type="button" aria-label={`Acciones de la multa ${m.plate}`} aria-haspopup="menu" aria-expanded={abierto} onClick={() => setMenu(abierto ? null : m.id)} className="press flex size-11 items-center justify-center rounded-full text-tinta transition-colors duration-150 hover:bg-suave">
        <EllipsisVertical size={18} strokeWidth={2.2} aria-hidden="true" />
      </button>
      {abierto && (
        <div role="menu" aria-label={`Multa ${m.plate}`} className="menu-entra absolute top-full right-0 mt-1 flex min-w-40 flex-col rounded-xl border border-borde bg-card p-1.5 shadow-card">
          <Link role="menuitem" to={`/multas/${m.id}`} state={{ desde: 'multas' }} className={cx(item, 'text-tinta')}>Ver detalle</Link>
          {esPagable(m) && <Link role="menuitem" to={`/multas/${m.id}/pagar`} state={{ desde: 'multas' }} className={cx(item, 'font-semibold text-rojo-osc')}>Pagar</Link>}
          {m.status === 'PAID' && <Link role="menuitem" to={`/multas/${m.id}/comprobante`} state={{ desde: 'multas' }} className={cx(item, 'text-tinta')}>Ver comprobante</Link>}
        </div>
      )}
    </div>
  )
}

export default function Multas() {
  // Pestaña, rango de fechas y placa en la URL: "Ver sus multas" desde Vehículos llega ya filtrado.
  const [params, setParams] = useSearchParams()
  const tab: Tab = TABS.find(([id]) => id === params.get('tab'))?.[0] ?? 'todas'
  const placa = params.get('placa')
  const [hoy] = useState(() => diaCaracas(new Date()))
  const inicioAnio = `${hoy.slice(0, 4)}-01-01`
  const desdeP = params.get('desde')
  const hastaP = params.get('hasta')
  const desde = esDia(desdeP) ? desdeP : inicioAnio
  const hasta = esDia(hastaP) ? hastaP : hoy
  const rangoPropio = desde !== inicioAnio || hasta !== hoy
  const [orden, setOrden] = useState<Orden>({ col: 'fecha', dir: 'desc' })
  const [menu, setMenu] = useState<string | null>(null)

  const { data, error, cargando, recargar } = useCarga(() => Promise.all([getMultas(), getVehiculos()]), [])
  const cambiar = (k: string, v: string | null) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    setParams(p, { replace: true })
  }
  const cambiarRango = (d: string, h: string) => {
    const p = new URLSearchParams(params)
    if (d === inicioAnio) p.delete('desde')
    else p.set('desde', d)
    if (h === hoy) p.delete('hasta')
    else p.set('hasta', h)
    setParams(p, { replace: true })
  }
  // Fecha arranca por lo más reciente; Vence, por lo que vence antes.
  const ordenar = (col: Orden['col']) => setOrden((o) => ({ col, dir: o.col === col ? (o.dir === 'desc' ? 'asc' : 'desc') : col === 'vence' ? 'asc' : 'desc' }))

  const multas = data?.[0] ?? []
  // Lo que pasa los filtros de fecha y placa; las pestañas cuentan sobre esto para que los números coincidan con la tabla.
  const enRango = multas.filter((m) => {
    const dia = diaCaracas(m.occurredAt)
    return dia >= desde && dia <= hasta && (!placa || m.plate === placa)
  })
  // Al ordenar por vencimiento, las que ya no se pagan van siempre al final.
  const clave = (m: Multa) => (orden.col === 'fecha' ? m.occurredAt : m.dueAt)
  const sinVence = (m: Multa) => Number(orden.col === 'vence' && !esPagable(m))
  const filas = enRango.filter(FILTRO[tab]).sort((a, b) => sinVence(a) - sinVence(b) || (clave(a) < clave(b) ? -1 : clave(a) > clave(b) ? 1 : 0) * (orden.dir === 'asc' ? 1 : -1))
  const placas = data ? [...new Set([...data[1].map((v) => v.plate), ...multas.map((m) => m.plate)])].sort() : []
  // Primer día elegible: tres años atrás o la multa más antigua, lo que llegue antes.
  const minimo = [`${Number(hoy.slice(0, 4)) - 3}-01-01`, ...multas.map((m) => diaCaracas(m.occurredAt))].sort()[0]!
  const vacioPorRango = rangoPropio && multas.some(FILTRO[tab])

  const ariaSort = (col: Orden['col']) => (orden.col === col ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none')

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-6 lg:px-0 lg:pt-0 lg:pb-4">
      <h1 className="text-[26px] font-semibold tracking-[-0.01em] lg:flex lg:h-11 lg:items-center lg:text-[36px] lg:leading-none">Multas</h1>

      {cargando && (
        <div aria-busy="true" aria-label="Cargando sus multas" className="flex flex-col gap-2 rounded-[18px] bg-suave p-4 lg:p-6">
          <span className="sk h-11 w-72 rounded-full" />
          {[0, 1, 2, 3].map((i) => <span key={i} className="sk h-14 rounded-xl" />)}
        </div>
      )}
      {error && error.code !== 'SESION' && (
        <ErrorCarga titulo="Sin conexión" texto="No pudimos traer sus multas. Revise su conexión e intente de nuevo." onReintentar={recargar} />
      )}

      {data && (
        <section aria-label="Historial de multas" className="entra flex flex-col gap-4 rounded-[18px] bg-suave p-4 lg:gap-5 lg:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
            <div role="tablist" aria-label="Estado" className="flex sm:gap-1 lg:gap-2">
              {TABS.map(([id, nombre]) => {
                const on = tab === id
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => cambiar('tab', id === 'todas' ? null : id)}
                    className={cx('relative flex min-h-11 flex-1 items-center justify-center gap-1 px-1 text-[15px] whitespace-nowrap sm:flex-none sm:gap-1.5 sm:px-3 transition-colors duration-150 after:absolute after:inset-x-1 after:bottom-1.5 sm:after:inset-x-3 after:h-0.5 after:rounded-full after:transition-transform after:duration-200 after:ease-press', on ? 'font-semibold text-tinta after:scale-x-100 after:bg-tinta' : 'text-texto-2 after:scale-x-0 after:bg-tinta hover:text-tinta')}
                  >
                    {nombre}<span className="num font-mono text-xs text-texto-2">{enRango.filter(FILTRO[id]).length}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:items-center">
              <RangoFechas className="w-full sm:w-[330px]" desde={desde} hasta={hasta} min={minimo} max={hoy} onCambio={cambiarRango} />
              {placas.length > 1 && (
                <Selector
                  className="w-full sm:w-[210px]"
                  etiqueta="Placa"
                  Icono={Car}
                  valor={placa ?? ''}
                  onCambio={(v) => cambiar('placa', v || null)}
                  opciones={[{ valor: '', etiqueta: 'Todas las placas' }, ...placas.map((p) => ({ valor: p, etiqueta: p, mono: true }))]}
                />
              )}
            </div>
          </div>

          {filas.length === 0 ? (
            <Vacio
              icono={vacioPorRango ? <span className="flex size-12 items-center justify-center rounded-control bg-suave text-texto-2"><CalendarDays size={22} strokeWidth={1.75} aria-hidden="true" /></span> : undefined}
              titulo={vacioPorRango ? 'Nada en este rango' : VACIO[tab][0]}
              texto={vacioPorRango ? 'Pruebe con otras fechas o con «Todo» en el selector de fechas.' : `${VACIO[tab][1]}${placa && !VACIO[tab][1].endsWith('.') ? ` para ${placa}` : ''}${VACIO[tab][1].endsWith('.') ? '' : '.'}`}
            />
          ) : (
            <>
              {/* Debajo de 1024 las ocho columnas no caben: la misma información en tarjetas. */}
              <div className="lg:hidden"><ListaMultas multas={filas} desde="multas" /></div>

              <table className="tabla-multas hidden w-full border-separate border-spacing-y-2 text-sm lg:table">
                <caption className="sr-only">Sus multas, {TABS.find(([id]) => id === tab)![1].toLowerCase()}</caption>
                <thead>
                  <tr className="text-left text-[13px] text-tinta">
                    {/* N.º desde 1280: a 1024 las otras siete columnas ya llenan el ancho. */}
                    <th scope="col" className={cx(celda, 'hidden h-11 font-semibold xl:table-cell')}>N.º</th>
                    <th scope="col" className={cx(celda, primeraVisible, 'h-11 font-semibold')}>Placa</th>
                    <th scope="col" aria-sort={ariaSort('fecha')} className={cx(celda, 'h-11')}><CabeceraOrden col="fecha" orden={orden} onOrdenar={ordenar}>Fecha</CabeceraOrden></th>
                    <th scope="col" aria-sort={ariaSort('vence')} className={cx(celda, 'h-11')}><CabeceraOrden col="vence" orden={orden} onOrdenar={ordenar}>Vence</CabeceraOrden></th>
                    <th scope="col" className={cx(celda, 'h-11 font-semibold')}>Infracción</th>
                    <th scope="col" className={cx(celda, 'h-11 font-semibold')}>Estado</th>
                    <th scope="col" className={cx(celda, 'h-11 font-semibold')}>Monto</th>
                    <th scope="col" className={cx(celda, 'h-11 text-center font-semibold')}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((m, i) => {
                    const [punto, texto] = ESTADO_COLOR[m.status]
                    return (
                      <tr key={m.id} className={cx('fila relative', menu === m.id && 'fila-activa')} style={{ '--i': Math.min(i, 10) } as CSSProperties}>
                        <td className={cx(celda, 'hidden font-mono text-texto-2 xl:table-cell')}>#{m.id.slice(-6).toUpperCase()}</td>
                        <td className={cx(celda, primeraVisible)}>
                          {/* El enlace cubre toda la fila; el menú ⋮ queda por encima. */}
                          <Link to={`/multas/${m.id}`} state={{ desde: 'multas' }} className="flex items-center gap-2.5 font-medium text-tinta no-underline after:absolute after:inset-0 after:rounded-xl">
                            <span aria-hidden="true" className="flex size-8 flex-none items-center justify-center rounded-full bg-suave text-texto-2"><Car size={15} strokeWidth={2} /></span>
                            <span className="font-mono">{m.plate}</span>
                          </Link>
                        </td>
                        <td className={cx(celda, 'whitespace-nowrap text-texto-2')}>{formatFecha(m.occurredAt)}</td>
                        <td className={cx(celda, 'whitespace-nowrap')}><Vence m={m} hoy={hoy} /></td>
                        <td className={cx(celda, 'whitespace-nowrap')}>{TIPO[m.type]}</td>
                        <td className={celda}>
                          <span className={cx('flex items-center gap-2 font-medium whitespace-nowrap', texto)}><span aria-hidden="true" className={cx('size-2 flex-none rounded-full', punto, m.status === 'OVERDUE' && 'latido')} />{estadoTexto(m.status)}</span>
                        </td>
                        <td className={cx(celda, 'num font-mono font-bold whitespace-nowrap')}>{formatBs(m.amountCents)}</td>
                        <td className={cx(celda, 'w-20')}><Acciones m={m} abierto={menu === m.id} setMenu={setMenu} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}
    </div>
  )
}
