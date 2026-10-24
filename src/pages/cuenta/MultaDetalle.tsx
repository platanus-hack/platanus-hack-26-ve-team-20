import { ChevronDown, ChevronLeft, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { apelarMulta, esPagable, getMulta, getVehiculos, type Multa } from '@/lib/demo/api.ts'
import { LUZ, TIPO } from '@/lib/etiquetas.ts'
import { diasEntre, enDias, formatBs, formatFecha, formatHora } from '@/lib/format.ts'
import { useCarga } from '@/hooks/useCarga.ts'
import { Boton, Hoja } from '@/components/ui/index.tsx'
import { cx, tarjeta } from '@/components/ui/estilos.ts'
import { ErrorCarga, Pagina, Vacio, display } from '@/components/cuenta/piezas.tsx'
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
      <button type="button" onClick={() => setAbierto(!abierto)} aria-expanded={abierto} className={cx('flex min-h-14 items-center gap-3 px-4 text-left font-semibold', borde && 'border-t border-borde')}>
        <span className="flex-1">{titulo}</span>
        <ChevronDown size={18} strokeWidth={2} aria-hidden="true" className={cx('transition-transform duration-[220ms] ease-sheet motion-reduce:transition-none', abierto && 'rotate-180')} />
      </button>
      {abierto && <div className="px-4 pb-4 text-sm text-texto-2">{children}</div>}
    </>
  )
}

function textoVence(m: Multa) {
  if (m.status === 'OVERDUE') return `Venció el ${formatFecha(m.dueAt)}`
  if (m.status === 'PENDING') return `Vence el ${formatFecha(m.dueAt)} · ${enDias(diasEntre(new Date(), m.dueAt))}`
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

  return (
    <>
      <Pagina className="flex-1">
        {volver}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
            <div className="flex flex-col gap-2">
              <EstadoBadge status={m.status} className="self-start" />
              <h1 className={display}>{TIPO[m.type]}</h1>
              <span className="text-texto-2"><span className="font-mono font-bold text-tinta">{formatFecha(m.occurredAt)} · {formatHora(m.occurredAt)}</span> · {m.intersection}</span>
              <span className="flex items-center gap-2 text-sm text-texto-2">
                <PlacaChip value={m.plate} grande />
                {v ? `${v.brand} ${v.model} ${v.color.toLowerCase()} ${v.year} (ejemplo)` : ''}
              </span>
            </div>

            <div className={cx(tarjeta, 'flex flex-col gap-1.5 p-4 lg:hidden')}>
              <span className="text-caption text-texto-2">Monto de ejemplo</span>
              <Monto cents={m.amountCents} anulada={m.status === 'VOID'} className="text-[40px] leading-[44px]" />
              <span className="text-sm text-texto-2">{textoVence(m)}</span>
            </div>

            <section aria-label="Evidencia" className="flex flex-col gap-2.5">
              <div className="relative overflow-hidden rounded-card bg-tinta-2">
                <Fotograma luz={luz} carro={fr.t} placa={m.plate} lineaPare alt={`Fotograma ${frame + 1} de 3, ${fr.momento} de la línea de pare, ${m.cameraCode}`} />
                <PastillaTinta className="left-2.5 h-7" punto={luz === 'RED' ? 'size-2 bg-rojo' : 'size-2 bg-verde'}>
                  {LUZ[luz]} · <span className="font-mono">{formatHora(m.occurredAt)}{fr.seg}</span>
                </PastillaTinta>
                <PastillaTinta className="right-2.5 h-7 font-mono font-bold">{m.cameraCode}</PastillaTinta>
              </div>
              <div className="flex gap-2">
                {FRAMES.map((x, i) => (
                  <button
                    key={x.momento}
                    type="button"
                    aria-pressed={frame === i}
                    aria-label={`Fotograma ${i + 1} de 3, ${x.momento} de la línea`}
                    onClick={() => { clearInterval(reloj.current); setJugando(false); setFrame(i) }}
                    className={cx('press flex min-h-[52px] flex-1 flex-col items-center justify-center rounded-control transition-colors duration-[220ms]', frame === i ? 'border-2 border-tinta bg-suave' : 'border border-borde bg-card')}
                  >
                    <span className="font-mono text-[13px] font-bold">{i + 1}</span>
                    <span className="text-xs">{x.momento}</span>
                  </button>
                ))}
                <button type="button" onClick={reproducir} className="press tinta flex min-h-[52px] flex-[1.2] items-center justify-center gap-1.5 rounded-control bg-tinta text-sm font-semibold text-card">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#C6F24E" aria-hidden="true"><path d="M6 3l14 9-14 9z" /></svg>
                  {jugando ? 'Reproduciendo…' : 'Ver clip'}
                </button>
              </div>
              <div className={cx(tarjeta, 'flex items-center gap-3 p-3')}>
                <Placa value={m.plate} size="sm" />
                <span className="flex flex-col text-sm"><span className="font-semibold">Recorte de placa</span><span className="text-texto-2">Ampliado del fotograma 2.</span></span>
              </div>
              <span className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck size={18} strokeWidth={1.75} aria-hidden="true" className="text-verde" />
                {m.verification === 'AUTO' ? 'Verificado automáticamente' : 'Verificado por operador'}
              </span>
            </section>

            <div className={cx(tarjeta, 'flex flex-col')}>
              <Acordeon titulo="Cómo se detectó">
                <div className="flex flex-col gap-2">
                  <span>La cámara {m.cameraCode} grabó el cruce. El modelo leyó la placa y la regla de la línea de pare confirmó la luz en el momento del cruce.</span>
                  <span className="flex justify-between"><span>Confianza del modelo</span><span className="font-mono font-bold text-tinta">{m.confidence.toFixed(2).replace('.', ',')}</span></span>
                </div>
              </Acordeon>
              <Acordeon titulo="Auditoría" borde>
                <ol className="flex flex-col gap-2">
                  {auditoria.map((a) => (
                    <li key={a.que} className="flex gap-2.5"><span className="w-24 flex-none font-mono font-bold text-tinta">{a.cuando}</span><span>{a.que}</span></li>
                  ))}
                </ol>
              </Acordeon>
            </div>
          </div>

          <aside className={cx(tarjeta, 'sticky top-8 hidden flex-col gap-3 self-start p-6 lg:col-span-5 lg:flex')}>
            <span className="text-caption text-texto-2">Monto de ejemplo</span>
            <Monto cents={m.amountCents} anulada={m.status === 'VOID'} className="text-[40px] leading-[44px]" />
            <span className="text-sm text-texto-2">{textoVence(m)}</span>
            {pagable && <Boton variante="pay" onClick={pagar}>Pagar {formatBs(m.amountCents)}</Boton>}
            {pagable && <Boton variante="outline" onClick={() => setApelar(true)}>Apelar</Boton>}
            {notaEl}
          </aside>
        </div>
        {pagable && <Boton variante="outline" className="lg:hidden" onClick={() => setApelar(true)}>Apelar esta multa</Boton>}
        {notaEl && <div className="lg:hidden">{notaEl}</div>}
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
