import { CalendarDays, ChevronDown, CornerUpRight, Gauge, Maximize2 } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { esPagable, getMultas, type Multa } from '@/lib/demo/api.ts'
import { mesCorto, pagadoPorMes } from '@/lib/resumen.ts'
import { TIPO } from '@/lib/etiquetas.ts'
import { formatBs, formatFecha } from '@/lib/format.ts'
import { useCarga } from '@/hooks/useCarga.ts'
import { useConteo } from '@/hooks/useConteo.ts'
import { cx } from '@/components/ui/estilos.ts'
import { ErrorCarga, SkeletonLista } from '@/components/cuenta/piezas.tsx'

const miles = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 0 })

// shortcut: actividad de la zona fija y marcada "de ejemplo"; cuando el backend exponga estadísticas por zona, se reemplaza.
const ZONA: Array<[string, number, number, number]> = [
  ['Ene', 120, 52, 24], ['Feb', 110, 24, 42], ['Mar', 90, 24, 50], ['Abr', 120, 32, 34],
  ['May', 100, 24, 58], ['Jun', 150, 36, 104], ['Jul', 110, 32, 18], ['Ago', 130, 38, 70],
  ['Sep', 120, 70, 24], ['Oct', 110, 26, 58], ['Nov', 150, 26, 104], ['Dic', 120, 46, 72],
]

function zona(periodo: 'mensual' | 'trimestral') {
  if (periodo === 'mensual') return ZONA.map(([n, f, o, l]) => ({ n, f, o, l }))
  return [0, 1, 2, 3].map((q) => {
    const tri = ZONA.slice(q * 3, q * 3 + 3)
    const suma = (k: 1 | 2 | 3) => Math.round(tri.reduce((t, x) => t + x[k], 0) / 2)
    return { n: `T${q + 1}`, f: suma(1), o: suma(2), l: suma(3) }
  })
}

function IconoTipo({ m }: { m: Multa }) {
  if (m.type === 'TURN_ARROW') return <CornerUpRight size={16} strokeWidth={2.2} aria-hidden="true" />
  if (m.type === 'SPEEDING') return <Gauge size={16} strokeWidth={2.2} aria-hidden="true" />
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <rect x="8" y="3" width="8" height="18" rx="3" /><circle cx="12" cy="8" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="12" cy="16" r="1.2" />
    </svg>
  )
}

const tarjeta = 'rounded-[18px] bg-card shadow-card'

export default function Inicio() {
  const { data: multas, error, cargando, recargar } = useCarga(() => getMultas(), [])
  const [periodo, setPeriodo] = useState<'mensual' | 'trimestral'>('mensual')
  const [hoy] = useState(() => new Date())

  const lista = multas ?? []
  const pend = lista.filter(esPagable)
  const total = pend.reduce((t, m) => t + m.amountCents, 0)
  const totalVisible = useConteo(total)
  const n = (s: Multa['status']) => lista.filter((m) => m.status === s).length

  const curva = pagadoPorMes(lista, hoy)
  const maxPagado = Math.max(1, ...curva.map((p) => p.cents))
  const puntos = curva.map((p, i) => ({ ...p, x: 26 + i * 50, y: 134 - Math.round((p.cents / maxPagado) * 56) }))
  const actual = puntos[5]!
  const barras = zona(periodo)

  return (
    <div className="flex flex-col gap-4 px-4 pt-5 pb-8 lg:px-0 lg:pt-1">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-[28px] font-semibold tracking-[-0.01em] lg:text-[36px]">Resumen de multas</h1>
        <span className="flex h-[47px] items-center gap-2.5 rounded-full bg-suave px-5 text-sm">
          <CalendarDays size={18} strokeWidth={2} aria-hidden="true" />
          1 Ene {hoy.getFullYear()} - {hoy.getDate()} {mesCorto(hoy)} {hoy.getFullYear()}
        </span>
        <label className="relative flex h-[47px] items-center rounded-full bg-ambar text-[15px] font-semibold text-[#0e1726]">
          <span className="sr-only">Período de las barras</span>
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value === 'trimestral' ? 'trimestral' : 'mensual')} className="h-full cursor-pointer appearance-none rounded-full bg-transparent pr-11 pl-6 outline-none">
            <option value="mensual">Mensual</option>
            <option value="trimestral">Trimestral</option>
          </select>
          <ChevronDown size={14} strokeWidth={2.6} aria-hidden="true" className="pointer-events-none absolute right-5" />
        </label>
      </div>

      {cargando && <SkeletonLista grande />}
      {error && error.code !== 'SESION' && (
        <ErrorCarga titulo="No pudimos cargar sus multas" texto="Revise su conexión a internet. Sus datos están a salvo." onReintentar={recargar} />
      )}

      {multas && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_272px]">
          <div className="grid min-w-0 grid-cols-1 gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,446fr)_minmax(0,356fr)]">

              <section aria-labelledby="total-t" className={cx(tarjeta, 'entra relative flex flex-col p-[22px_26px] lg:h-[270px]')}>
                <p className="num font-mono text-[clamp(26px,2.7vw,38px)] leading-tight font-bold whitespace-nowrap" aria-label={formatBs(total)}>{formatBs(totalVisible)}</p>
                <h2 id="total-t" className="text-base font-normal text-texto-2">Total por pagar</h2>
                <Link to="/multas" aria-label="Ver todas las multas" className="absolute top-[26px] right-[26px] flex size-10 items-center justify-center rounded-full bg-suave text-tinta transition-colors duration-150 hover:bg-borde">
                  <Maximize2 size={16} strokeWidth={2.4} aria-hidden="true" />
                </Link>
                {pend.length ? (
                  <ul className="mt-auto flex flex-col">
                    {pend.slice(0, 2).map((m, i) => {
                      const vencida = m.status === 'OVERDUE'
                      return (
                        <li key={m.id} className={cx(i > 0 && 'border-t border-borde')}>
                          <Link to={`/multas/${m.id}`} state={{ desde: 'inicio' }} className="flex items-center gap-[18px] py-3.5">
                            <span className={cx('flex size-10 flex-none items-center justify-center rounded-full', vencida ? 'bg-rojo-bg text-rojo-osc' : 'bg-suave text-ambar-osc')}><IconoTipo m={m} /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium">{TIPO[m.type]}</span>
                              <span className={cx('block truncate text-[13px]', vencida ? 'text-rojo-osc' : 'text-texto-2')}><span className="font-mono">{m.plate}</span> · {vencida ? 'vencida el' : 'vence el'} {formatFecha(m.dueAt).slice(0, 5)}</span>
                            </span>
                            <span className="num font-mono font-bold whitespace-nowrap">{formatBs(m.amountCents).replace('Bs. ', '')}</span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="mt-auto text-texto-2">Está al día: no tiene multas por pagar.</p>
                )}
              </section>

              <section aria-labelledby="pagado-t" className={cx(tarjeta, 'entra overflow-hidden pt-5 lg:h-[270px]')} style={{ '--i': 1 } as CSSProperties}>
                <div className="flex justify-between px-[18px]">
                  <h2 id="pagado-t" className="text-base font-medium">Pagado en {hoy.getFullYear()}</h2>
                  <Link to="/estadisticas" className="text-xs text-texto-2 no-underline hover:text-tinta">Ver todo</Link>
                </div>
                <svg role="img" aria-label={`Monto pagado acumulado por mes: ${formatBs(actual.cents)} en ${actual.nombre}`} viewBox="0 0 356 200" className="mt-2 block h-[200px] w-full">
                  <defs><linearGradient id="barra-mes" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--color-ambar)" stopOpacity=".9" /><stop offset="1" stopColor="var(--color-ambar)" stopOpacity="0" /></linearGradient></defs>
                  <rect x={actual.x - 7} y="62" width="14" height="96" rx="3" fill="url(#barra-mes)" />
                  <rect x={actual.x - 30} y="20" width="60" height="26" rx="13" fill="var(--color-ambar)" />
                  <text x={actual.x} y="38" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0e1726" fontFamily="JetBrains Mono, monospace">{miles.format(actual.cents / 100)}</text>
                  <path d={`M${actual.x - 6} 48 L${actual.x} 54 L${actual.x + 6} 48 Z`} fill="var(--color-ambar)" />
                  <polyline points={['0,' + puntos[0]!.y, ...puntos.slice(0, 6).map((p) => `${p.x},${p.y}`)].join(' ')} fill="none" stroke="var(--color-tinta)" strokeWidth="2" />
                  <polyline points={`${actual.x},${actual.y} ${puntos[6]!.x},${actual.y} 356,${actual.y}`} fill="none" stroke="var(--color-tinta)" strokeWidth="2" strokeDasharray="4 5" opacity=".45" />
                  {puntos.slice(0, 5).map((p) => <circle key={p.nombre} cx={p.x} cy={p.y} r="4" fill="var(--color-card)" stroke="var(--color-tinta)" strokeWidth="2" />)}
                  <circle cx={actual.x} cy={actual.y} r="5" fill="var(--color-tinta)" />
                  {puntos.map((p, i) => <text key={p.nombre} x={p.x} y="188" textAnchor="middle" fontSize="12" fontWeight={i === 5 ? 600 : 400} fill={i === 5 ? 'var(--color-tinta)' : 'var(--color-texto-3)'}>{p.nombre}</text>)}
                </svg>
              </section>
            </div>

            <section aria-labelledby="zona-t" className={cx(tarjeta, 'entra flex flex-col p-[22px_26px_18px] lg:h-[317px]')} style={{ '--i': 3 } as CSSProperties}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="zona-t" className="text-base font-medium">Infracciones en su zona <span className="text-[13px] font-normal text-texto-2">· datos de ejemplo</span></h2>
                <span className="flex flex-wrap gap-[18px] text-[13px] text-texto-2">
                  <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-fantasma" />Detectadas</span>
                  <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-revision" />En revisión</span>
                  <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-brand" />Multadas</span>
                </span>
              </div>
              <div role="img" aria-label="Infracciones detectadas, en revisión y multadas por período en su zona, con datos de ejemplo" className="mt-auto grid h-[200px] items-end gap-1.5 sm:gap-3" style={{ gridTemplateColumns: `repeat(${barras.length}, minmax(0, 1fr))` }}>
                {barras.map((b) => {
                  const escala = periodo === 'trimestral' ? 0.55 : 1
                  const o = Math.round(b.o * escala), l = Math.round(b.l * escala)
                  return (
                    <div key={b.n} className="relative flex h-[200px] flex-col justify-end gap-1">
                      <span className="rayado absolute inset-x-0 bottom-0 rounded-md bg-fantasma" style={{ height: Math.min(196, o + l + 4 + Math.round((b.f * escala) / 4)) }} />
                      <span className="relative rounded-md bg-revision" style={{ height: o }} />
                      <span className="relative rounded-md bg-brand" style={{ height: l }} />
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 grid gap-1.5 text-center sm:gap-3 text-[13px] text-texto-3" style={{ gridTemplateColumns: `repeat(${barras.length}, minmax(0, 1fr))` }}>
                {barras.map((b) => <span key={b.n}><span className="sm:hidden">{periodo === 'mensual' ? b.n[0] : b.n}</span><span className="hidden sm:inline">{b.n}</span></span>)}
              </div>
            </section>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:flex lg:flex-col">
            <section aria-labelledby="estado-t" className={cx(tarjeta, 'entra flex flex-col p-[18px_12px_12px] lg:h-[315px]')} style={{ '--i': 2 } as CSSProperties}>
              <h2 id="estado-t" className="mb-3.5 ml-1 text-base font-medium">Multas por estado</h2>
              <div className="grid min-h-[236px] flex-1 grid-cols-2 gap-2">
                <div className="flex flex-col gap-2">
                  <Link to="/multas" className="flex flex-[1.65] flex-col rounded-xl bg-brand p-3 text-[#0e1726] no-underline transition-transform duration-150 ease-press hover:-translate-y-0.5">
                    <span className="text-[13px]">Por pagar</span><span className="num font-mono text-[30px] leading-tight font-bold">{pend.length}</span>
                  </Link>
                  <Link to="/multas?tab=otras" className="rayado flex flex-1 flex-col rounded-xl bg-losa p-3 text-losa-texto no-underline transition-transform duration-150 ease-press hover:-translate-y-0.5">
                    <span className="text-[13px]">Anuladas</span><span className="num font-mono text-[30px] leading-tight font-bold">{n('VOID')}</span>
                  </Link>
                </div>
                <div className="flex flex-col gap-2">
                  <Link to="/multas" className="rayado flex flex-1 flex-col rounded-xl bg-losa p-3 text-losa-texto no-underline transition-transform duration-150 ease-press hover:-translate-y-0.5">
                    <span className="text-[13px]">Vencidas</span><span className="num font-mono text-[30px] leading-tight font-bold">{n('OVERDUE')}</span>
                  </Link>
                  <Link to="/multas?tab=pagadas" className="rayado flex flex-[1.65] flex-col rounded-xl bg-losa p-3 text-losa-texto no-underline transition-transform duration-150 ease-press hover:-translate-y-0.5">
                    <span className="text-[13px]">Pagadas</span><span className="num font-mono text-[30px] leading-tight font-bold">{n('PAID')}</span>
                  </Link>
                </div>
              </div>
            </section>

            <section aria-labelledby="vivo-t" className={cx(tarjeta, 'entra relative min-h-[268px] flex-1 overflow-hidden')} style={{ '--i': 4 } as CSSProperties}>
              <h2 id="vivo-t" className="relative z-10 m-0 px-[18px] pt-5 text-sm leading-snug font-semibold tracking-[0.01em]">VEA LAS CÁMARAS DE CARACAS <span className="text-ambar-osc">EN VIVO</span></h2>
              <svg aria-hidden="true" viewBox="0 0 272 200" preserveAspectRatio="xMidYMid slice" className="absolute inset-x-0 top-16 h-[200px] w-full">
                <defs><pattern id="puntos-mapa" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.4" fill="var(--color-punto-mapa)" /></pattern></defs>
                <path d="M0 30 L40 22 L70 34 L84 60 L72 86 L52 92 L58 120 L44 150 L30 140 L22 104 L0 96 Z" fill="url(#puntos-mapa)" />
                <path d="M104 26 L150 18 L176 30 L172 52 L150 58 L140 76 L150 104 L136 140 L118 132 L112 100 L98 82 L106 56 Z" fill="url(#puntos-mapa)" />
                <path d="M176 24 L240 20 L272 34 L272 70 L250 90 L222 84 L196 66 L178 52 Z" fill="url(#puntos-mapa)" />
                <path d="M216 110 L250 104 L262 124 L240 138 L218 130 Z" fill="url(#puntos-mapa)" />
                <g fill="var(--color-ambar)"><circle cx="24" cy="48" r="2" /><circle cx="36" cy="60" r="2" /><circle cx="48" cy="54" r="2" /><circle cx="30" cy="78" r="2" /><circle cx="42" cy="108" r="2" /><circle cx="124" cy="40" r="2" /><circle cx="136" cy="36" r="2" /><circle cx="130" cy="94" r="2" /><circle cx="204" cy="40" r="2" /><circle cx="222" cy="54" r="2" /><circle cx="246" cy="44" r="2" /><circle cx="238" cy="118" r="2" /></g>
              </svg>
              <Link to="/en-vivo" className="absolute inset-x-3 bottom-3 flex h-11 items-center justify-center rounded-xl bg-ambar text-sm font-semibold text-[#0e1726] no-underline transition-opacity duration-150 hover:opacity-90">Ver cámaras en vivo</Link>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
