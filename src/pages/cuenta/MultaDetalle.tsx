import { ChevronDown, ChevronLeft, Play, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { apelarMulta, esPagable, getMulta, getVehiculos, reenviarNotificacion, type Multa } from '@/lib/demo/api.ts'
import { LUZ, TIPO } from '@/lib/etiquetas.ts'
import { formatBs, formatFecha, formatHora } from '@/lib/format.ts'
import { useCarga } from '@/hooks/useCarga.ts'
import { Boton, Hoja } from '@/components/ui/index.tsx'
import { BotonReenviar } from '@/components/vc/Reenviar.tsx'
import { cx, tarjeta } from '@/components/ui/estilos.ts'
import { ErrorCarga, Pagina, Vacio } from '@/components/cuenta/piezas.tsx'
import { EST } from '@/components/vc/estados.ts'
import { EstadoBadge, Fotograma, Monto, PastillaTinta, Placa, PlacaChip } from '@/components/vc/index.tsx'

const FRAMES = [
  { t: 'translate(188,100) scale(1)', seg: ':11,9', momento: 'antes' },
  { t: 'translate(180,70) scale(.84)', seg: ':12,3', momento: 'en la línea' },
  { t: 'translate(178,50) scale(.7)', seg: ':12,7', momento: 'después' },
]

function Acordeon({ titulo, children, borde }: { titulo: string; children: ReactNode; borde?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAbierto(!abierto)} aria-expanded={abierto} className={cx('flex min-h-14 items-center gap-3 px-4 text-left font-semibold transition-colors duration-150 hover:bg-suave', borde && 'border-t border-borde')}>
        <span className="flex-1">{titulo}</span>
        <ChevronDown size={18} strokeWidth={2} aria-hidden="true" className={cx('transition-transform duration-[220ms] ease-sheet motion-reduce:transition-none', abierto && 'rotate-180')} />
      </button>
      {abierto && <div className="px-4 pb-4 text-sm text-texto-2">{children}</div>}
    </>
  )
}

function Dato({ etiqueta, children, borde }: { etiqueta: string; children: ReactNode; borde?: boolean }) {
  return (
    <div className={cx('flex items-start justify-between gap-4 px-4 py-3.5', borde && 'border-t border-borde')}>
      <dt className="text-texto-2">{etiqueta}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

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

export default function MultaDetalle() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { state } = useLocation()
  const desde = (state as { desde?: string } | null)?.desde === 'inicio' ? 'inicio' : 'multas'
  const { data, error, cargando, recargar } = useCarga(() => Promise.all([getMulta(id), getVehiculos()]), [id])
  const [apelada, setApelada] = useState<Multa | null>(null)
  const [frame, setFrame] = useState(1)
  const [jugando, setJugando] = useState(false)
  const [apelar, setApelar] = useState(false)
  const [apelando, setApelando] = useState(false)
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

  const m = apelada ?? data[0]
  const v = data[1].find((x) => x.plate === m.plate)
  const pagable = esPagable(m)
  const fr = FRAMES[frame] ?? FRAMES[1]!
  const luz = m.type === 'SPEEDING' ? 'GREEN' : 'RED'
  const textoNota = nota(m)
  const pagar = () => navigate(`/multas/${m.id}/pagar`, { state: { desde } })

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
    { cuando: `${formatFecha(m.occurredAt)} ${formatHora(m.occurredAt)}`, que: m.verification === 'AUTO' ? 'Verificado automáticamente' : 'Verificado por operador' },
    { cuando: formatFecha(m.occurredAt), que: 'Aviso enviado por WhatsApp' },
    ...(m.status === 'PAID' && m.paidAt ? [{ cuando: formatFecha(m.paidAt), que: `Pago simulado · ${m.paymentReference}` }] : []),
    ...(m.status === 'VOID' ? [{ cuando: formatFecha(new Date(Date.parse(m.occurredAt) + 86_400_000).toISOString()), que: `Anulada por operador: ${m.voidReason}` }] : []),
    ...(m.status === 'APPEALED' && m.appealedAt ? [{ cuando: formatFecha(m.appealedAt), que: 'Apelación recibida · cobro en pausa' }] : []),
  ]

  const notaEl = textoNota && (
    <span className={cx('block rounded-control px-3.5 py-3 text-sm font-semibold', EST[m.status === 'PAID' || m.status === 'APPEALED' ? m.status : 'VOID'].cls)}>{textoNota}</span>
  )
  const apelarEl = pagable && (
    <button type="button" onClick={() => setApelar(true)} className="inline-flex min-h-11 items-center self-center px-1 text-sm font-semibold text-texto-2 hover:text-tinta">
      ¿No está de acuerdo? Apelar esta multa
    </button>
  )

  return (
    <>
      <Pagina className="flex-1">
        {volver}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
            <div className="flex flex-col gap-2">
              <EstadoBadge status={m.status} className="self-start" />
              <h1 className="font-display text-h1-m font-bold tracking-[-0.02em] lg:text-h1">{TIPO[m.type]}</h1>
              <span className="text-sm text-texto-2">{formatFecha(m.occurredAt)} · {formatHora(m.occurredAt)}</span>
            </div>

            <div className="flex flex-col gap-0.5 lg:hidden">
              <Monto cents={m.amountCents} anulada={m.status === 'VOID'} className="text-[40px] leading-[44px]" />
              <span className={cx('text-sm', m.status === 'OVERDUE' ? 'text-rojo-osc' : 'text-texto-2')}>{textoVence(m)} · monto de ejemplo</span>
            </div>

            <dl className={cx(tarjeta, 'flex flex-col text-sm')}>
              <Dato etiqueta="Lugar">{m.intersection}</Dato>
              <Dato etiqueta="Vehículo" borde>
                <span className="flex flex-col items-end gap-1">
                  <PlacaChip value={m.plate} />
                  {v && <span className="text-caption text-texto-2">{`${v.brand} ${v.model} ${v.color.toLowerCase()} ${v.year} (ejemplo)`}</span>}
                </span>
              </Dato>
              <Dato etiqueta="Cámara" borde><span className="font-mono font-semibold">{m.cameraCode}</span></Dato>
            </dl>

            <section aria-labelledby="prueba-t" className="flex flex-col gap-3">
              <h2 id="prueba-t" className="text-h3 font-semibold">Prueba</h2>
              <div className="relative overflow-hidden rounded-card bg-suave">
                <Fotograma luz={luz} carro={fr.t} placa={m.plate} lineaPare alt={`Fotograma ${frame + 1} de 3, ${fr.momento} de la línea de pare, ${m.cameraCode}`} />
                <PastillaTinta className="left-2.5 h-7" punto={luz === 'RED' ? 'size-2 bg-[#ff6b5e]' : 'size-2 bg-[#3dd68c]'}>
                  <span className="sr-only">{LUZ[luz]} · </span><span className="font-mono">{formatHora(m.occurredAt)}{fr.seg}</span>
                </PastillaTinta>
              </div>
              <div className="flex gap-2">
                <div role="group" aria-label="Fotogramas" className="flex flex-1 gap-1 rounded-control bg-suave p-1">
                  {FRAMES.map((x, i) => (
                    <button
                      key={x.momento}
                      type="button"
                      aria-pressed={frame === i}
                      aria-label={`Fotograma ${i + 1} de 3, ${x.momento} de la línea`}
                      onClick={() => { clearInterval(reloj.current); setJugando(false); setFrame(i) }}
                      className={cx('flex min-h-10 flex-1 items-center justify-center rounded-[10px] text-caption font-semibold transition-[background-color,color,box-shadow] duration-200', frame === i ? 'bg-card text-tinta shadow-card' : 'text-texto-2 hover:text-tinta')}
                    >
                      {x.momento[0]!.toUpperCase() + x.momento.slice(1)}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={reproducir} aria-label={jugando ? 'Reproduciendo clip' : 'Ver clip'} className="press flex size-12 flex-none items-center justify-center rounded-control bg-suave text-tinta transition-colors duration-150 hover:bg-borde">
                  <Play size={18} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <Placa value={m.plate} size="sm" />
                <span className="flex flex-col text-sm">
                  <span className="font-semibold">Placa leída</span>
                  <span className="flex items-center gap-1.5 text-caption text-texto-2">
                    <ShieldCheck size={14} strokeWidth={2} aria-hidden="true" className="text-verde-osc" />
                    {m.verification === 'AUTO' ? 'Verificado automáticamente' : 'Verificado por operador'}
                  </span>
                </span>
              </div>
            </section>

            <div className={cx(tarjeta, 'flex flex-col')}>
              <Acordeon titulo="Cómo se detectó">
                <div className="flex flex-col gap-4">
                  <span>
                    La cámara {m.cameraCode} grabó el cruce. El modelo leyó la placa con una confianza de{' '}
                    <span className="font-mono font-semibold text-tinta">{m.confidence.toFixed(2).replace('.', ',')}</span> y la regla de la línea de pare confirmó la luz.
                  </span>
                  <ol className="flex flex-col gap-3">
                    {auditoria.map((a) => (
                      <li key={a.que} className="flex gap-3">
                        <span aria-hidden="true" className="mt-2 size-1.5 flex-none rounded-full bg-texto-3" />
                        <span className="flex flex-col"><span className="text-tinta">{a.que}</span><span className="text-caption">{a.cuando}</span></span>
                      </li>
                    ))}
                  </ol>
                </div>
              </Acordeon>
            </div>
            <div className="lg:hidden">{apelarEl}</div>
            {pagable && <div className="lg:hidden"><BotonReenviar enviar={() => reenviarNotificacion(m.id)} /></div>}
            {notaEl && <div className="lg:hidden">{notaEl}</div>}
          </div>

          <aside className={cx(tarjeta, 'sticky top-8 hidden flex-col gap-4 self-start p-6 lg:col-span-5 lg:flex')}>
            <div className="flex flex-col gap-0.5">
              <span className="text-caption text-texto-2">Monto de ejemplo</span>
              <Monto cents={m.amountCents} anulada={m.status === 'VOID'} className="text-[40px] leading-[44px]" />
              <span className={cx('text-sm', m.status === 'OVERDUE' ? 'text-rojo-osc' : 'text-texto-2')}>{textoVence(m)}</span>
            </div>
            {pagable && <Boton variante="pay" onClick={pagar}>Pagar {formatBs(m.amountCents)}</Boton>}
            {apelarEl}
            {pagable && <BotonReenviar enviar={() => reenviarNotificacion(m.id)} />}
            {notaEl}
          </aside>
        </div>
      </Pagina>

      {pagable && (
        <div className="sticky bottom-0 border-t border-borde bg-card px-4 pt-3 pb-4 lg:hidden">
          <Boton variante="pay" className="w-full" onClick={pagar}>Pagar {formatBs(m.amountCents)}</Boton>
        </div>
      )}

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
