import { ChevronLeft, Info, Play, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { apelarMulta, esPagable, getMulta, reenviarNotificacion, type Multa } from '@/lib/demo/api.ts'
import { LUZ, TIPO } from '@/lib/etiquetas.ts'
import { formatBs, formatFecha, formatHora } from '@/lib/format.ts'
import { useCarga } from '@/hooks/useCarga.ts'
import { Boton, Hoja } from '@/components/ui/index.tsx'
import { BotonReenviar } from '@/components/vc/Reenviar.tsx'
import { cx } from '@/components/ui/estilos.ts'
import { ErrorCarga, Pagina, Vacio } from '@/components/cuenta/piezas.tsx'
import { EST } from '@/components/vc/estados.ts'
import { EstadoBadge, Fotograma, Monto, PastillaTinta, Placa } from '@/components/vc/index.tsx'
import { fotosDeInfraccion, srcEvidencia, type EvidenciaItem } from '@/components/evidencia/fotos.ts'

// Sin fotos (multas sembradas sin evidencia), la escena se dibuja en tres momentos del cruce.
const FRAMES = [
  { t: 'translate(188,100) scale(1)', seg: ':11,9', momento: 'antes' },
  { t: 'translate(180,70) scale(.84)', seg: ':12,3', momento: 'en la línea' },
  { t: 'translate(178,50) scale(.7)', seg: ':12,7', momento: 'después' },
]

const bloque = 'entra relative min-h-0 overflow-hidden rounded-[18px] bg-card shadow-card'

function textoVence(m: Multa) {
  if (m.status === 'OVERDUE') return `Venció el ${formatFecha(m.dueAt)}`
  if (m.status === 'PENDING') return `Vence el ${formatFecha(m.dueAt)}`
  return m.status === 'PAID' ? 'Saldada' : 'Sin cobro'
}

function nota(m: Multa) {
  if (m.status === 'PAID') return `Pagada el ${formatFecha(m.paidAt ?? m.occurredAt)} · ${m.paymentReference}`
  if (m.status === 'VOID') return `Anulada: ${m.voidReason}. No hay nada que pagar.`
  if (m.status === 'APPEALED') return 'Cobro en pausa mientras se revisa su apelación.'
  return null
}

/** Una foto de la prueba que llena su bloque; si no carga, lo dice en vez de dejar el hueco. */
function FotoBloque({ item, alt, contain }: { item: EvidenciaItem; alt: string; contain?: boolean }) {
  const [rota, setRota] = useState(false)
  if (rota) return <div className="absolute inset-0 flex items-center justify-center bg-tinta-2 text-caption text-niebla">No disponible</div>
  return <img src={srcEvidencia(item.url)} alt={alt} loading="lazy" onError={() => setRota(true)} className={cx('absolute inset-0 h-full w-full bg-tinta-2', contain ? 'object-contain' : 'object-cover')} />
}

export default function MultaDetalle() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { state } = useLocation()
  const desde = (state as { desde?: string } | null)?.desde === 'inicio' ? 'inicio' : 'multas'
  const { data, error, cargando, recargar } = useCarga(() => getMulta(id), [id])
  const [apelada, setApelada] = useState<Multa | null>(null)
  const [frame, setFrame] = useState(1)
  const [jugando, setJugando] = useState(false)
  const [apelar, setApelar] = useState(false)
  const [apelando, setApelando] = useState(false)
  const [comoSe, setComoSe] = useState(false)
  const reloj = useRef<ReturnType<typeof setInterval>>(undefined)
  useEffect(() => () => clearInterval(reloj.current), [])

  const volver = (
    <Link to={`/${desde}`} className="flex min-h-11 items-center gap-1.5 self-start pr-2 text-sm font-semibold">
      <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />{desde === 'inicio' ? 'Inicio' : 'Multas'}
    </Link>
  )

  if (cargando) {
    return <Pagina>{volver}<div aria-busy="true" aria-label="Cargando la multa" className="flex flex-col gap-3"><span className="sk h-8 w-40" /><span className="sk h-10 w-64" /><span className="sk aspect-video rounded-card lg:w-7/12" /></div></Pagina>
  }
  if (error || !data) {
    return (
      <Pagina>
        {volver}
        {error?.code === 'NO_ENCONTRADA'
          ? <Vacio titulo="No encontramos esta multa" texto="Puede que no pertenezca a su cuenta. Revise la lista de multas." />
          : error?.code !== 'SESION' && <ErrorCarga titulo="No pudimos cargar la multa" texto="Revise su conexión e intente de nuevo." onReintentar={recargar} />}
      </Pagina>
    )
  }

  const m = apelada ?? data
  const pagable = esPagable(m)
  const fr = FRAMES[frame] ?? FRAMES[1]!
  const luz = m.type === 'SPEEDING' ? 'GREEN' : 'RED'
  const textoNota = nota(m)
  const pagar = () => navigate(`/multas/${m.id}/pagar`, { state: { desde } })
  const { escena, vehiculo, placa } = fotosDeInfraccion(m.evidence ?? [])
  const enRojo = escena?.lightState !== 'GREEN'
  const verificacion = m.verification === 'AUTO' ? 'Verificado automáticamente' : 'Verificado por operador'

  const reproducir = () => {
    clearInterval(reloj.current)
    setFrame(0)
    setJugando(true)
    let i = 0
    reloj.current = setInterval(() => {
      i += 1
      if (i > 2) { clearInterval(reloj.current); setJugando(false); return }
      setFrame(i)
    }, 700)
  }

  const auditoria = [
    { cuando: `${formatFecha(m.occurredAt)} ${formatHora(m.occurredAt)}`, que: `Detectada por ${m.cameraCode}` },
    { cuando: `${formatFecha(m.occurredAt)} ${formatHora(m.occurredAt)}`, que: m.verification === 'AUTO' ? 'Verificada automáticamente' : 'Verificada por operador' },
    { cuando: formatFecha(m.occurredAt), que: 'Aviso enviado por WhatsApp' },
    ...(m.status === 'PAID' && m.paidAt ? [{ cuando: formatFecha(m.paidAt), que: `Pago simulado · ${m.paymentReference}` }] : []),
    ...(m.status === 'VOID' ? [{ cuando: formatFecha(new Date(Date.parse(m.occurredAt) + 86_400_000).toISOString()), que: `Anulada por operador: ${m.voidReason}` }] : []),
    ...(m.status === 'APPEALED' && m.appealedAt ? [{ cuando: formatFecha(m.appealedAt), que: 'Apelación recibida · cobro en pausa' }] : []),
  ]

  return (
    <>
      {/* ≥1024 ocupa el alto de <main> y los bloques se reparten la pantalla, sin scroll; debajo se apila. */}
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6 lg:absolute lg:inset-0 lg:min-h-[560px] lg:overflow-x-clip lg:px-0 lg:pt-0 lg:pb-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 lg:h-11 lg:flex-nowrap lg:pr-36">
          <Link to={`/${desde}`} aria-label={desde === 'inicio' ? 'Volver al resumen' : 'Volver a multas'} className="press -ml-2 flex size-11 flex-none items-center justify-center rounded-full text-tinta transition-colors duration-150 hover:bg-suave">
            <ChevronLeft size={22} strokeWidth={2.2} aria-hidden="true" />
          </Link>
          <h1 className="text-[26px] leading-none font-semibold tracking-[-0.01em] lg:text-[32px]">{TIPO[m.type]}</h1>
          <EstadoBadge status={m.status} />
          <span className="w-full text-sm text-texto-2 lg:w-auto">{formatFecha(m.occurredAt)} · {formatHora(m.occurredAt)} · <span className="font-mono">{m.cameraCode}</span></span>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-4 lg:grid-rows-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {/* Escena: la foto del cruce (o el dibujo con sus tres momentos) */}
          <section aria-label="Escena de la infracción" className={cx(bloque, 'col-span-2 aspect-[2.1/1] bg-tinta-2 lg:col-span-3 lg:aspect-auto')}>
            {escena?.url ? (<>
              <FotoBloque item={escena} alt={`Escena de la infracción, cámara ${m.cameraCode}`} contain />
              <PastillaTinta className="left-3" punto={cx('size-2', enRojo ? 'bg-rojo' : 'bg-verde')}>
                {enRojo ? 'Luz roja' : 'Luz verde'}{escena.capturedAt && <> · <span className="font-mono">{formatHora(escena.capturedAt)}</span></>}
              </PastillaTinta>
              <span className="tinta absolute bottom-3 left-3 rounded-full bg-tinta px-2.5 py-1 text-xs font-semibold text-card">Escena</span>
            </>) : (<>
              <div className="absolute inset-0 flex items-center justify-center bg-suave">
                <Fotograma luz={luz} carro={fr.t} placa={m.plate} lineaPare alt={`Fotograma ${frame + 1} de 3, ${fr.momento} de la línea de pare, ${m.cameraCode}`} className="h-full w-full" />
              </div>
              <PastillaTinta className="left-3" punto={luz === 'RED' ? 'size-2 bg-[#ff6b5e]' : 'size-2 bg-[#3dd68c]'}>
                <span className="sr-only">{LUZ[luz]} · </span><span className="font-mono">{formatHora(m.occurredAt)}{fr.seg}</span>
              </PastillaTinta>
              <div className="absolute inset-x-3 bottom-3 flex gap-2">
                <div role="group" aria-label="Fotogramas" className="flex flex-1 gap-1 rounded-control bg-card/90 p-1">
                  {FRAMES.map((x, i) => (
                    <button key={x.momento} type="button" aria-pressed={frame === i} aria-label={`Fotograma ${i + 1} de 3, ${x.momento} de la línea`}
                      onClick={() => { clearInterval(reloj.current); setJugando(false); setFrame(i) }}
                      className={cx('flex min-h-10 flex-1 items-center justify-center rounded-[10px] text-caption font-semibold transition-colors duration-200', frame === i ? 'bg-suave text-tinta' : 'text-texto-2 hover:text-tinta')}>
                      {x.momento[0]!.toUpperCase() + x.momento.slice(1)}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={reproducir} aria-label={jugando ? 'Reproduciendo clip' : 'Ver clip'} className="press flex size-12 flex-none items-center justify-center rounded-control bg-card/90 text-tinta">
                  <Play size={18} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
            </>)}
          </section>

          {/* Monto: lima mientras se puede pagar; si no, el estado de la multa */}
          <section aria-label="Monto" className={cx('entra col-span-2 flex flex-wrap items-end justify-between gap-3 rounded-[18px] p-5 lg:col-span-1 lg:flex-col lg:flex-nowrap lg:items-stretch', pagable ? 'bg-brand text-[#0e1726]' : 'bg-card shadow-card')} style={{ '--i': 1 } as CSSProperties}>
            <div className="flex flex-col gap-0.5">
              <span className={cx('text-sm', pagable ? '' : 'text-texto-2')}>{pagable ? 'Total a pagar' : 'Monto'}</span>
              <Monto cents={m.amountCents} anulada={m.status === 'VOID'} className="text-[clamp(26px,2.2vw,34px)] leading-tight" />
              <span className={cx('text-sm', pagable ? (m.status === 'OVERDUE' ? 'font-semibold text-rojo-osc' : '') : 'text-texto-2')}>{textoVence(m)}</span>
            </div>
            {pagable
              ? <button type="button" onClick={pagar} className="press flex min-h-12 items-center justify-center rounded-control bg-[#0e1726] px-6 font-semibold text-brand transition-opacity duration-150 hover:opacity-90">Pagar {formatBs(m.amountCents)}</button>
              : textoNota && <span className={cx('rounded-control px-3.5 py-2.5 text-sm font-semibold', EST[m.status === 'PAID' || m.status === 'APPEALED' ? m.status : 'VOID'].cls)}>{textoNota}</span>}
          </section>

          {/* Vehículo y placa: las fotos recortadas; la placa leída y su verificación van sobre la foto de la placa */}
          {vehiculo?.url && (
            <section aria-label="Vehículo" className={cx(bloque, 'min-h-[150px]', !placa?.url && 'col-span-2 lg:col-span-2')} style={{ '--i': 2 } as CSSProperties}>
              <FotoBloque item={vehiculo} alt="Vehículo en el momento de la infracción" />
              <span className="tinta absolute bottom-3 left-3 rounded-full bg-tinta px-2.5 py-1 text-xs font-semibold text-card">Vehículo</span>
            </section>
          )}
          <section aria-label="Placa leída" className={cx(bloque, 'flex flex-col', !vehiculo?.url && 'col-span-2 lg:col-span-2')} style={{ '--i': 3 } as CSSProperties}>
            {placa?.url && <div className="relative min-h-[96px] flex-1 bg-tinta-2"><FotoBloque item={placa} alt="Placa del vehículo" contain /></div>}
            <div className={cx('flex flex-col items-start gap-2 p-3 sm:flex-row sm:items-center sm:gap-3', !placa?.url && 'flex-1 justify-center sm:justify-center')}>
              <Placa value={m.plate} size="sm" />
              <span className="flex min-w-0 flex-col text-sm">
                <span className="font-semibold">Placa leída</span>
                <span className="flex items-center gap-1.5 text-caption text-texto-2"><ShieldCheck size={14} strokeWidth={2} aria-hidden="true" className="text-verde-osc" />{verificacion}</span>
              </span>
            </div>
          </section>

          {/* Recorrido y acciones */}
          <section aria-label="Recorrido de la multa" className={cx(bloque, 'col-span-2 flex flex-col gap-3 p-5', !vehiculo?.url && !placa?.url ? 'lg:col-span-2' : '')} style={{ '--i': 4 } as CSSProperties}>
            <h2 className="text-base font-medium">Recorrido</h2>
            <ol className="flex min-h-0 flex-col gap-2.5 overflow-y-auto text-sm">
              {auditoria.map((a) => (
                <li key={a.que} className="flex items-baseline gap-2.5"><span aria-hidden="true" className="size-2 flex-none translate-y-[-1px] rounded-full bg-brand" /><span className="min-w-0 flex-1">{a.que}</span><span className="text-caption whitespace-nowrap text-texto-2">{a.cuando}</span></li>
              ))}
            </ol>
            <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-borde pt-2">
              <button type="button" onClick={() => setComoSe(true)} className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-texto-2 transition-colors duration-150 hover:text-tinta"><Info size={16} strokeWidth={2} aria-hidden="true" />Cómo se detectó</button>
              {pagable && <button type="button" onClick={() => setApelar(true)} className="flex min-h-11 items-center text-sm font-semibold text-texto-2 transition-colors duration-150 hover:text-tinta">Apelar</button>}
              {pagable && <BotonReenviar compacto enviar={() => reenviarNotificacion(m.id)} />}
            </div>
          </section>
        </div>
      </div>

      <Hoja abierta={comoSe} modo="modal" etiqueta="Cómo se detectó" onCerrar={() => setComoSe(false)}>
        <h2 className="text-h2 font-semibold">Cómo se detectó</h2>
        <p className="text-texto-2">
          La cámara {m.cameraCode} grabó el cruce. El modelo leyó la placa con una confianza de{' '}
          <span className="font-mono font-semibold text-tinta">{m.confidence.toFixed(2).replace('.', ',')}</span> y la regla de la línea de pare confirmó la luz.
        </p>
        <ol className="flex flex-col gap-3">
          {auditoria.map((a) => (
            <li key={a.que} className="flex gap-3">
              <span aria-hidden="true" className="mt-2 size-1.5 flex-none rounded-full bg-texto-3" />
              <span className="flex flex-col"><span>{a.que}</span><span className="text-caption text-texto-2">{a.cuando}</span></span>
            </li>
          ))}
        </ol>
        <Boton variante="outline" onClick={() => setComoSe(false)}>Cerrar</Boton>
      </Hoja>

      <Hoja abierta={apelar} modo="modal" etiqueta="Apelar multa" onCerrar={() => setApelar(false)}>
        <h2 className="text-h2 font-semibold">¿Desea apelar esta multa?</h2>
        <p className="text-texto-2">Su apelación congela el cobro hasta que un operador la revise. Le avisaremos por WhatsApp.</p>
        <Boton disabled={apelando} aria-busy={apelando} onClick={async () => {
          if (apelando) return
          setApelando(true)
          try { setApelada(await apelarMulta(m.id)) } catch { /* SESION la muestra el Shell */ } finally { setApelando(false); setApelar(false) }
        }}>{apelando ? 'Enviando…' : 'Confirmar apelación'}</Boton>
        <Boton variante="outline" onClick={() => setApelar(false)}>Cancelar</Boton>
      </Hoja>
    </>
  )
}
