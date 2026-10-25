import { ChevronLeft, Play, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { apelarMulta, esPagable, getMulta, getSesion, reenviarNotificacion, type Multa } from '@/lib/demo/api.ts'
import { LUZ, TIPO } from '@/lib/etiquetas.ts'
import { formatFecha, formatHora, maskTelefono } from '@/lib/format.ts'
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

const bloque = 'entra relative min-h-0 overflow-hidden rounded-[18px] bg-tinta-2 shadow-card'
const etiqueta = 'tinta absolute bottom-3 left-3 rounded-full bg-tinta px-2.5 py-1 text-xs font-semibold text-card'

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

/** Una foto de la prueba; si no carga, lo dice en vez de dejar el hueco. */
function Foto({ item, alt, className }: { item: EvidenciaItem; alt: string; className?: string }) {
  const [rota, setRota] = useState(false)
  if (rota) return <div className="absolute inset-0 flex items-center justify-center text-caption text-niebla">No disponible</div>
  return <img src={srcEvidencia(item.url)} alt={alt} loading="lazy" onError={() => setRota(true)} className={className} />
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
  const telefono = getSesion()?.telefono
  const hora = formatHora(m.occurredAt)

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

  // Franja inferior: el recorrido en una línea, como en la maqueta.
  const recorrido = [
    `Detectada ${hora}`,
    m.verification === 'AUTO' ? 'Verificada' : 'Verificada por operador',
    telefono ? `Aviso por WhatsApp al ${maskTelefono(telefono)}` : 'Aviso por WhatsApp',
    ...(m.status === 'PAID' && m.paidAt ? [`Pagada ${formatFecha(m.paidAt)}`] : []),
    ...(m.status === 'APPEALED' ? ['Apelación en revisión'] : []),
    ...(m.status === 'VOID' ? ['Anulada'] : []),
  ]
  const auditoria = [
    { cuando: `${formatFecha(m.occurredAt)} ${hora}`, que: `Detectada por ${m.cameraCode}` },
    { cuando: `${formatFecha(m.occurredAt)} ${hora}`, que: m.verification === 'AUTO' ? 'Verificada automáticamente' : 'Verificada por operador' },
    { cuando: formatFecha(m.occurredAt), que: 'Aviso enviado por WhatsApp' },
    ...(m.status === 'PAID' && m.paidAt ? [{ cuando: formatFecha(m.paidAt), que: `Pago simulado · ${m.paymentReference}` }] : []),
    ...(m.status === 'VOID' ? [{ cuando: formatFecha(new Date(Date.parse(m.occurredAt) + 86_400_000).toISOString()), que: `Anulada por operador: ${m.voidReason}` }] : []),
    ...(m.status === 'APPEALED' && m.appealedAt ? [{ cuando: formatFecha(m.appealedAt), que: 'Apelación recibida · cobro en pausa' }] : []),
  ]
  const enlaceTexto = 'flex min-h-11 items-center text-sm text-texto-2 transition-colors duration-150 hover:text-tinta'

  return (
    <>
      {/* ≥1024 ocupa el alto de <main>, sin scroll: escena (2×2), monto, vehículo y placa, y la franja del recorrido. */}
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6 lg:absolute lg:inset-0 lg:min-h-[560px] lg:overflow-x-clip lg:px-0 lg:pt-0 lg:pb-0">
        <Link to={`/${desde}`} className="-mb-2 flex min-h-11 items-center gap-1.5 self-start pr-2 text-sm font-semibold lg:hidden">
          <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />{desde === 'inicio' ? 'Inicio' : 'Multas'}
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 lg:pr-40">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[28px] leading-none font-semibold tracking-[-0.01em] lg:text-[32px]">{TIPO[m.type]}</h1>
              <EstadoBadge status={m.status} />
            </div>
            <span className="text-sm text-texto-2">{formatFecha(m.occurredAt)} · {hora} · <span className="font-mono">{m.cameraCode}</span></span>
          </div>
          <div className="flex items-center gap-5">
            {pagable && <button type="button" onClick={() => setApelar(true)} className={enlaceTexto}>Apelar</button>}
            <button type="button" onClick={() => setComoSe(true)} className={enlaceTexto}>Cómo se detectó</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-4 lg:grid-rows-[auto_minmax(0,1fr)_auto]">
          {/* Escena: 2×2. Las fotos van enteras (son la prueba); el fondo es la misma foto desenfocada para no dejar franjas vacías. */}
          <section aria-label="Escena de la infracción" className={cx(bloque, 'col-span-2 aspect-[2.1/1] lg:row-span-2 lg:aspect-auto')}>
            {escena?.url ? (<>
              <Foto item={escena} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-xl" />
              <Foto item={escena} alt={`Escena de la infracción, cámara ${m.cameraCode}`} className="absolute inset-0 h-full w-full object-contain" />
              <PastillaTinta className="top-3 left-3" punto={cx('size-2', enRojo ? 'bg-rojo' : 'bg-verde')}>
                {enRojo ? 'Luz roja' : 'Luz verde'} · <span className="font-mono">{escena.capturedAt ? formatHora(escena.capturedAt) : hora}</span>
              </PastillaTinta>
              <span className={etiqueta}>Escena</span>
            </>) : (<>
              <div className="absolute inset-0 flex items-center justify-center bg-[#8A929C]">
                <Fotograma luz={luz} carro={fr.t} placa={m.plate} lineaPare alt={`Fotograma ${frame + 1} de 3, ${fr.momento} de la línea de pare, ${m.cameraCode}`} className="h-full w-full" />
              </div>
              <PastillaTinta className="top-3 left-3" punto={luz === 'RED' ? 'size-2 bg-[#ff6b5e]' : 'size-2 bg-[#3dd68c]'}>
                <span className="sr-only">{LUZ[luz]} · </span>{luz === 'RED' ? 'Luz roja' : 'Luz verde'} · <span className="font-mono">{hora}{fr.seg}</span>
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

          {/* Monto: lima mientras se puede pagar; el botón tinta abajo a la derecha */}
          <section aria-label="Monto" className={cx('entra col-span-2 flex flex-wrap items-end justify-between gap-4 rounded-[18px] p-5', pagable ? 'bg-brand text-[#0e1726]' : 'bg-card shadow-card')} style={{ '--i': 1 } as CSSProperties}>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm">{pagable ? 'Total a pagar' : 'Monto'}</span>
              <Monto cents={m.amountCents} anulada={m.status === 'VOID'} className="text-[clamp(30px,2.8vw,42px)] leading-tight" />
              <span className={cx('text-sm', m.status === 'OVERDUE' && 'font-semibold text-rojo-osc', !pagable && 'text-texto-2')}>{textoVence(m)}</span>
            </div>
            {pagable
              ? <button type="button" onClick={pagar} className="press flex min-h-12 items-center rounded-control bg-[#0e1726] px-7 font-semibold text-brand transition-opacity duration-150 hover:opacity-90">Pagar</button>
              : textoNota && <span className={cx('rounded-control px-3.5 py-2.5 text-sm font-semibold', EST[m.status === 'PAID' || m.status === 'APPEALED' ? m.status : 'VOID'].cls)}>{textoNota}</span>}
          </section>

          {vehiculo?.url && (
            <section aria-label="Vehículo" className={cx(bloque, 'min-h-[150px]')} style={{ '--i': 2 } as CSSProperties}>
              <Foto item={vehiculo} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-xl" />
              <Foto item={vehiculo} alt="Vehículo en el momento de la infracción" className="absolute inset-0 h-full w-full object-contain" />
              <span className={etiqueta}>Vehículo</span>
            </section>
          )}

          {/* Placa: la foto de la placa (o la placa leída) centrada, con la verificación debajo */}
          <section aria-label="Placa leída" className={cx(bloque, 'flex min-h-[150px] flex-col items-center justify-center gap-2 px-3 pt-3 pb-12', !vehiculo?.url && 'col-span-2')} style={{ '--i': 3 } as CSSProperties}>
            {placa?.url
              ? <div className="relative h-24 w-full max-w-[260px] lg:h-[42%]"><Foto item={placa} alt={`Placa del vehículo, leída como ${m.plate}`} className="absolute inset-0 h-full w-full object-contain" /></div>
              : <Placa value={m.plate} size="md" />}
            <span className="flex items-center gap-1.5 text-sm font-semibold text-[#4cc38a]"><ShieldCheck size={16} strokeWidth={2} aria-hidden="true" />{m.verification === 'AUTO' ? 'Verificada' : 'Verificada por operador'}</span>
            <span className={etiqueta}>Placa</span>
          </section>

          {/* Franja: recorrido en una línea y «Reenviar» */}
          <section aria-label="Recorrido de la multa" className="entra col-span-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-[18px] bg-card px-5 py-3 shadow-card lg:col-span-4" style={{ '--i': 4 } as CSSProperties}>
            <ol className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {recorrido.map((r) => <li key={r} className="flex items-center gap-2"><span aria-hidden="true" className="size-2 flex-none rounded-full bg-brand" />{r}</li>)}
            </ol>
            {pagable && <BotonReenviar corto enviar={() => reenviarNotificacion(m.id)} className="items-end" />}
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
