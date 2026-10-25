import { EvidenciaInfraccion, tieneFotos } from '@/components/evidencia/EvidenciaInfraccion.tsx'
import { ArrowRight, ChevronLeft, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { accionesPermitidas, getMulta, reenviarNotificacion, type Accion, type MultaDetalle as Detalle } from '@/lib/oficial/api.ts'
import { ACCION, AUDITORIA, LUZ, TIPO } from '@/lib/etiquetas.ts'
import { formatFecha, formatHora } from '@/lib/format.ts'
import { useCarga } from '@/hooks/useCarga.ts'
import { Boton } from '@/components/ui/index.tsx'
import { cx, tarjeta } from '@/components/ui/estilos.ts'
import { ErrorCarga, Pagina, Vacio, display, h2 } from '@/components/cuenta/piezas.tsx'
import { CambioEstado } from '@/components/oficial/CambioEstado.tsx'
import { EstadoBadge, Fotograma, Monto, PastillaTinta, Placa } from '@/components/vc/index.tsx'
import { BotonReenviar } from '@/components/vc/Reenviar.tsx'

const fechaHora = (iso: string) => `${formatFecha(iso)} ${formatHora(iso)}`

function nota(m: Detalle) {
  if (m.status === 'PAID') return `Pagada el ${m.paidAt ? formatFecha(m.paidAt) : '—'} · ${m.paymentReference ?? ''}`
  if (m.status === 'VOID') return `Anulada: ${m.voidReason ?? 'sin motivo registrado'}.`
  if (m.status === 'APPEALED') return `Apelada el ${m.appealedAt ? formatFecha(m.appealedAt) : '—'}. Cobro en pausa.`
  return m.status === 'OVERDUE' ? `Venció el ${formatFecha(m.dueAt)}.` : `Vence el ${formatFecha(m.dueAt)}.`
}

export default function MultaDetalle() {
  const { id = '' } = useParams()
  const volver = (useLocation().state as { volver?: string } | null)?.volver ?? '/oficial/multas'
  const { data, error, cargando, recargar } = useCarga(() => getMulta(id), [id])
  const [cambiada, setCambiada] = useState<Detalle | null>(null)
  const [accion, setAccion] = useState<Accion | null>(null)

  const atras = (
    <Link to={volver} className="flex min-h-11 items-center gap-1.5 self-start pr-2 text-sm font-semibold">
      <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />Historial
    </Link>
  )

  if (cargando) {
    return <Pagina>{atras}<div aria-busy="true" aria-label="Cargando la multa" className="flex flex-col gap-3"><span className="sk h-8 w-40" /><span className="sk h-10 w-64" /><span className="sk aspect-video rounded-card lg:w-7/12" /></div></Pagina>
  }
  const m = cambiada ?? data
  if (error || !m) {
    return (
      <Pagina>
        {atras}
        {error?.code === 'NO_ENCONTRADA'
          ? <Vacio titulo="No encontramos esta multa" texto="Revise el enlace o vuelva al historial." />
          : error?.code !== 'SESION' && <ErrorCarga titulo="No pudimos cargar la multa" texto="Revise su conexión e intente de nuevo." onReintentar={recargar} />}
      </Pagina>
    )
  }

  const acciones = accionesPermitidas(m.status)
  const luz = m.type === 'SPEEDING' ? 'GREEN' : 'RED'
  const foto = m.evidence.find((e) => e.kind === 'FRAME')
  const v = m.vehicle

  return (
    <Pagina>
      {atras}
      <div className="flex flex-col gap-2">
        <EstadoBadge status={m.status} className="self-start" />
        <h1 className={display}>{TIPO[m.type]}</h1>
        <span className="text-texto-2"><span className="font-mono font-bold text-tinta">{formatFecha(m.occurredAt)} · {formatHora(m.occurredAt)}</span> · {m.intersection}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <aside aria-label="Monto y acciones" className={cx(tarjeta, 'flex min-w-0 flex-col gap-3 self-start p-5 lg:order-2 lg:col-span-5 lg:p-6')}>
          <span className="text-caption text-texto-2">Monto</span>
          <Monto cents={m.amountCents} anulada={m.status === 'VOID'} className="text-[32px] leading-[38px] xl:text-[40px] xl:leading-[44px]" />
          <span className="text-sm text-texto-2">{nota(m)}</span>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-borde pt-3 text-sm">
            <dt className="text-texto-2">Placa</dt><dd><Placa value={m.plate} size="sm" /></dd>
            <dt className="text-texto-2">Vehículo</dt><dd>{v ? `${v.brand} ${v.model} ${v.color.toLowerCase()} ${v.year}` : 'Sin datos'}</dd>
            <dt className="text-texto-2">Cédula</dt><dd className="font-mono font-bold">{m.cedulaMasked ?? 'Sin titular'}</dd>
            <dt className="text-texto-2">Cámara</dt><dd className="font-mono font-bold">{m.cameraCode}</dd>
            <dt className="text-texto-2">Confianza</dt><dd className="font-mono font-bold">{m.confidence.toFixed(2).replace('.', ',')}</dd>
          </dl>
          {acciones.includes('VOID') && <Boton variante="pay" onClick={() => setAccion('VOID')} aria-haspopup="dialog">{ACCION.VOID}</Boton>}
          {acciones.includes('APPEAL_ACCEPT') && <Boton onClick={() => setAccion('APPEAL_ACCEPT')} aria-haspopup="dialog">{ACCION.APPEAL_ACCEPT}</Boton>}
          {acciones.includes('APPEAL_REJECT') && <Boton variante="outline" onClick={() => setAccion('APPEAL_REJECT')} aria-haspopup="dialog">{ACCION.APPEAL_REJECT}</Boton>}
          {(m.status === 'PENDING' || m.status === 'OVERDUE') && <BotonReenviar enviar={() => reenviarNotificacion(m.id)} onHecho={(r) => setCambiada(r.fine)} />}
          {!acciones.length && <span className="rounded-control bg-gris-bg px-3.5 py-3 text-sm font-semibold text-texto-2">Estado final: no admite cambios.</span>}
        </aside>

        <div className="flex min-w-0 flex-col gap-4 lg:order-1 lg:col-span-7">
          <section aria-label="Evidencia" className="flex flex-col gap-2.5">
            {tieneFotos(m.evidence) ? <EvidenciaInfraccion items={m.evidence} camara={m.cameraCode} /> : (
            <div className="relative overflow-hidden rounded-card bg-tinta-2">
              {foto
                ? <img src={foto.url} alt={`Fotograma de la infracción, ${m.cameraCode}`} className="block aspect-video w-full object-cover" />
                : <Fotograma luz={luz} carro="translate(180,70) scale(.84)" placa={m.plate} lineaPare alt={`Ilustración del cruce en la línea de pare, ${m.cameraCode}`} />}
              <PastillaTinta className="left-2.5 h-7" punto={luz === 'RED' ? 'size-2 bg-rojo' : 'size-2 bg-verde'}>
                {LUZ[luz]} · <span className="font-mono">{formatHora(m.occurredAt)}</span>
              </PastillaTinta>
              <PastillaTinta className="right-2.5 h-7 font-mono font-bold">{m.cameraCode}</PastillaTinta>
            </div>
            )}
            <span className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck size={18} strokeWidth={1.75} aria-hidden="true" className="text-verde" />
              {m.verification === 'AUTO' ? 'Verificado automáticamente' : 'Verificado por operador'}
            </span>
          </section>

          <section aria-labelledby="aud" className="flex flex-col gap-2.5">
            <h2 id="aud" className={h2}>Auditoría</h2>
            <ol className={cx(tarjeta, 'flex flex-col')}>
              {m.audit.map((a, i) => (
                <li key={`${a.at}-${i}`} className={cx('flex flex-col gap-1.5 px-4 py-3 text-sm', i > 0 && 'border-t border-borde')}>
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <time dateTime={a.at} className="font-mono font-bold">{fechaHora(a.at)}</time>
                    <span className="font-semibold">{AUDITORIA[a.action] ?? a.action}</span>
                    <span className="text-texto-2">· {a.actor.label}</span>
                  </span>
                  {a.to && (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {a.from ? <EstadoBadge status={a.from} /> : <span className="text-caption text-texto-2">Nueva</span>}
                      <ArrowRight size={14} strokeWidth={2} aria-hidden="true" /><span className="sr-only">pasa a</span>
                      <EstadoBadge status={a.to} />
                    </span>
                  )}
                  {a.reason && <span className="text-texto-2">Motivo: {a.reason}</span>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      {accion && <CambioEstado multa={m} inicial={accion} onCerrar={() => setAccion(null)} onHecho={setCambiada} />}
    </Pagina>
  )
}
