import { CornerUpRight, Gauge, Maximize2 } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { esPagable, getMultas, type Multa } from '@/lib/demo/api.ts'
import { infraccionesPorMes, pagadoPorMes } from '@/lib/resumen.ts'
import { TIPO } from '@/lib/etiquetas.ts'
import { formatBs, formatFecha } from '@/lib/format.ts'
import { useCarga } from '@/hooks/useCarga.ts'
import { useConteo } from '@/hooks/useConteo.ts'
import { cx } from '@/components/ui/estilos.ts'
import { ErrorCarga, SkeletonLista } from '@/components/cuenta/piezas.tsx'

const miles = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 0 })


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

/** Resumen en una sola pantalla: ocupa el alto de <main> y las gráficas se reparten lo que queda; con muy poco alto vuelve el scroll. */
export default function Inicio() {
  const { data: multas, error, cargando, recargar } = useCarga(() => getMultas(), [])
  const [hoy] = useState(() => new Date())

  const lista = multas ?? []
  // Vencidas primero: son las más urgentes.
  const pend = lista.filter(esPagable).sort((a, b) => Number(b.status === 'OVERDUE') - Number(a.status === 'OVERDUE'))
  const total = pend.reduce((t, m) => t + m.amountCents, 0)
  const totalVisible = useConteo(total)

  const curva = pagadoPorMes(lista, hoy)
  const maxPagado = Math.max(1, ...curva.map((p) => p.cents))
  const puntos = curva.map((p, i) => ({ ...p, x: 26 + i * 50, y: 134 - Math.round((p.cents / maxPagado) * 56) }))
  const actual = puntos[5]!
  const meses = infraccionesPorMes(lista, hoy.getFullYear())
  const maxMes = Math.max(1, ...meses.map((x) => x.total))
  // La columna más alta llega al 92 % para dejar aire a la cifra que aparece al pasar.
  const alto = (n: number) => `${(n / maxMes) * 92}%`
  const conMultas = meses.filter((x) => x.total > 0)

  return (
    <div className="absolute inset-0 flex min-h-[540px] flex-col gap-4 px-4 pt-4 pb-5 lg:min-h-[480px] lg:px-0 lg:pt-0 lg:pb-0">
      <h1 className="text-[26px] font-semibold tracking-[-0.01em] lg:flex lg:h-11 lg:items-center lg:text-[36px] lg:leading-none">Resumen de multas</h1>

      {cargando && <SkeletonLista grande />}
      {error && error.code !== 'SESION' && (
        <ErrorCarga titulo="No pudimos cargar sus multas" texto="Revise su conexión a internet. Sus datos están a salvo." onReintentar={recargar} />
      )}

      {multas && (
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,446fr)_minmax(0,356fr)] md:grid-rows-[minmax(min-content,1fr)_minmax(0,1.15fr)]">

          <section aria-labelledby="total-t" className={cx(tarjeta, 'entra relative flex min-h-0 flex-col p-[18px_22px] lg:p-[24px_28px]')}>
            <p className="num font-mono text-[clamp(26px,2.9vw,44px)] leading-tight font-bold whitespace-nowrap" aria-label={formatBs(total)}>{formatBs(totalVisible)}</p>
            <h2 id="total-t" className="text-base font-normal text-texto-2">Total por pagar</h2>
            <Link to="/multas" aria-label="Ver todas las multas" className="group press absolute top-4 right-4 flex size-11 items-center justify-center rounded-full bg-suave text-tinta transition-colors duration-150 hover:bg-borde lg:top-6 lg:right-6">
              <Maximize2 size={16} strokeWidth={2.4} aria-hidden="true" className="transition-transform duration-200 ease-press group-hover:scale-115" />
            </Link>
            {pend.length ? (
              <ul className="-mx-2 mt-auto flex min-h-0 flex-col overflow-y-auto pt-1">
                {pend.slice(0, 2).map((m, i) => {
                  const vencida = m.status === 'OVERDUE'
                  return (
                    <li key={m.id} className={cx(i > 0 && 'hidden border-t border-borde md:block')}>
                      <Link to={`/multas/${m.id}`} state={{ desde: 'inicio' }} className="press flex items-center gap-4 rounded-xl px-2 py-2.5 transition-colors duration-150 hover:bg-suave">
                        <span className={cx('flex size-10 flex-none items-center justify-center rounded-full', vencida ? 'latido bg-rojo-bg text-rojo-osc' : 'bg-suave text-ambar-osc')}><IconoTipo m={m} /></span>
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
              <p className="mt-auto pt-3 text-texto-2">Está al día: no tiene multas por pagar.</p>
            )}
          </section>

          <section aria-labelledby="pagado-t" className={cx(tarjeta, 'entra flex min-h-0 flex-col pt-4 pb-2')} style={{ '--i': 1 } as CSSProperties}>
            <div className="flex justify-between px-[18px]">
              <h2 id="pagado-t" className="text-base font-medium">Pagado en {hoy.getFullYear()}</h2>
              <Link to="/estadisticas" className="text-xs text-texto-2 no-underline hover:text-tinta">Ver todo</Link>
            </div>
            <div className="relative min-h-0 flex-1">
              <svg role="img" aria-label={`Monto pagado acumulado por mes: ${formatBs(actual.cents)} en ${actual.nombre}`} viewBox="0 0 356 200" className="absolute inset-0 size-full">
              <defs><linearGradient id="barra-mes" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--color-ambar)" stopOpacity=".9" /><stop offset="1" stopColor="var(--color-ambar)" stopOpacity="0" /></linearGradient></defs>
              <rect className="crece" style={{ '--i': 4 } as CSSProperties} x={actual.x - 7} y="62" width="14" height="96" rx="3" fill="url(#barra-mes)" />
              <g className="aparece" style={{ '--i': 7 } as CSSProperties}>
                <rect x={actual.x - 30} y="20" width="60" height="26" rx="13" fill="var(--color-ambar)" />
              <text x={actual.x} y="38" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0e1726" fontFamily="JetBrains Mono, monospace">{miles.format(actual.cents / 100)}</text>
              <path d={`M${actual.x - 6} 48 L${actual.x} 54 L${actual.x + 6} 48 Z`} fill="var(--color-ambar)" />
              </g>
              <polyline points={['0,' + puntos[0]!.y, ...puntos.slice(0, 6).map((p) => `${p.x},${p.y}`)].join(' ')} pathLength={1} className="traza" fill="none" stroke="var(--color-tinta)" strokeWidth="2" />
              <polyline points={`${actual.x},${actual.y} ${puntos[6]!.x},${actual.y} 356,${actual.y}`} fill="none" stroke="var(--color-tinta)" strokeWidth="2" strokeDasharray="4 5" opacity=".45" className="aparece" style={{ '--i': 7 } as CSSProperties} />
              {puntos.slice(0, 5).map((p, i) => <circle key={p.nombre} className="aparece" style={{ '--i': i + 1 } as CSSProperties} cx={p.x} cy={p.y} r="4" fill="var(--color-card)" stroke="var(--color-tinta)" strokeWidth="2" />)}
              <circle className="aparece" style={{ '--i': 6 } as CSSProperties} cx={actual.x} cy={actual.y} r="5" fill="var(--color-tinta)" />
              {puntos.map((p, i) => <text key={p.nombre} x={p.x} y="188" textAnchor="middle" fontSize="12" fontWeight={i === 5 ? 600 : 400} fill={i === 5 ? 'var(--color-tinta)' : 'var(--color-texto-3)'}>{p.nombre}</text>)}
            </svg>
            </div>
          </section>

          <section aria-labelledby="zona-t" className={cx(tarjeta, 'entra flex min-h-0 flex-col p-[16px_18px_12px] md:col-span-2 lg:p-[20px_26px_16px]')} style={{ '--i': 2 } as CSSProperties}>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h2 id="zona-t" className="text-base font-medium">Infracciones en {hoy.getFullYear()}</h2>
              <span className="flex flex-wrap gap-x-[18px] gap-y-1 text-[13px] text-texto-2">
                <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-fantasma" />Total</span>
                <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-revision" />Por pagar</span>
                <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-brand" />Pagadas</span>
              </span>
            </div>
            <div role="img" aria-label={conMultas.length ? `Infracciones por mes en ${hoy.getFullYear()}: ${conMultas.map((x) => `${x.mes} ${x.total} (${x.porPagar} por pagar, ${x.pagadas} pagadas)`).join('; ')}` : `Sin infracciones en ${hoy.getFullYear()}`} className="columnas relative mt-3 grid h-0 min-h-0 flex-1 grid-cols-12 items-end gap-1.5 sm:gap-3">
              {meses.map((x, i) => (
                <div key={x.mes} className="columna crece relative flex h-full flex-col justify-end gap-1" style={{ '--i': i } as CSSProperties}>
                  {x.total > 0 && <span aria-hidden="true" className="pista absolute left-1/2 z-10 rounded-full bg-tinta px-2 py-0.5 font-mono text-[11px] font-bold whitespace-nowrap text-fondo" style={{ bottom: `calc(${alto(x.total)} + 6px)` }}>{x.total}</span>}
                  {x.total > 0 && <span className="rayado absolute inset-x-0 bottom-0 rounded-md bg-fantasma" style={{ height: alto(x.total) }} />}
                  {x.porPagar > 0 && <span className="relative rounded-md bg-revision" style={{ height: alto(x.porPagar) }} />}
                  {x.pagadas > 0 && <span className="relative rounded-md bg-brand" style={{ height: alto(x.pagadas) }} />}
                </div>
              ))}
              {!conMultas.length && <p className="absolute inset-0 flex items-center justify-center text-sm text-texto-2">Sin infracciones en {hoy.getFullYear()}.</p>}
            </div>
            <div className="mt-2 grid grid-cols-12 gap-1.5 text-center text-[13px] text-texto-3 sm:gap-3">
              {meses.map((x) => <span key={x.mes}><span className="sm:hidden">{x.mes[0]}</span><span className="hidden sm:inline">{x.mes}</span></span>)}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
