import { useEffect, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router'
import { esPagable, getMultas, getSesion } from '@/lib/demo/api.ts'
import { TIPO } from '@/lib/etiquetas.ts'
import { formatBs, formatFecha, formatHora, maskTelefono } from '@/lib/format.ts'
import { useCarga } from '@/hooks/useCarga.ts'
import { BotonLink } from '@/components/ui/index.tsx'
import { cx, tarjeta } from '@/components/ui/estilos.ts'
import { ErrorCarga, Pagina, Vacio, display } from '@/components/cuenta/piezas.tsx'
import { EstadoBadge } from '@/components/vc/index.tsx'

export default function Comprobante() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { state } = useLocation()
  const st = state as { recien?: boolean; telefono?: string; desde?: string } | null
  const { data, error, cargando, recargar } = useCarga(getMultas, [])
  // Recién pagado: el check se dibuja (400 ms) y el badge pasa de PENDIENTE a PAGADA (200 ms).
  const [pagada, setPagada] = useState(!st?.recien)

  useEffect(() => {
    if (!st?.recien) return
    try { navigator.vibrate?.([12, 40, 20]) } catch { /* sin háptica */ }
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t = setTimeout(() => setPagada(true), reducido ? 0 : 420)
    return () => clearTimeout(t)
  }, [st?.recien])

  const ids = id ? [id] : params.get('multas')?.split(',').filter(Boolean) ?? []
  const multas = (data ?? []).filter((m) => ids.includes(m.id) && m.status === 'PAID')
  const restantes = (data ?? []).filter(esPagable)
  const pagadoEl = multas[0]?.paidAt
  const telefono = st?.telefono ?? getSesion()?.telefono ?? ''

  if (cargando) return <Pagina><div aria-busy="true" aria-label="Cargando el comprobante" className="mx-auto flex w-full max-w-[520px] flex-col gap-3"><span className="sk mx-auto size-20 rounded-full" /><span className="sk h-72 rounded-card" /></div></Pagina>
  if (error) return <Pagina>{error.code !== 'SESION' && <ErrorCarga titulo="No pudimos cargar el comprobante" texto="Su pago está registrado. Revise su conexión e intente de nuevo." onReintentar={recargar} />}</Pagina>
  if (!multas.length) return <Pagina><Vacio titulo="No encontramos este comprobante" texto="La multa no está pagada o no pertenece a su cuenta." /><BotonLink to="/inicio" className="self-start">Volver al inicio</BotonLink></Pagina>

  return (
    <Pagina>
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-5">
        <div className="flex flex-col items-center gap-3 pt-2 text-center">
          <span className="flex size-20 items-center justify-center rounded-full bg-verde text-card">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path className={st?.recien ? 'check' : undefined} d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <h1 className={display}>Pago aprobado</h1>
          <span aria-live="polite"><EstadoBadge status={pagada ? 'PAID' : 'PENDING'} /></span>
        </div>

        <section aria-label="Comprobante" className={cx(tarjeta, 'flex flex-col overflow-hidden')}>
          <div className="flex flex-col items-center gap-1.5 border-b border-dashed border-borde px-4 py-5">
            <span className="text-caption text-texto-2">Total pagado · monto de ejemplo</span>
            <span className="num font-mono text-[32px] leading-[38px] font-bold">{formatBs(multas.reduce((t, m) => t + m.amountCents, 0))}</span>
            <span className="inline-flex h-[26px] items-center rounded-placa border-[1.5px] border-dashed border-texto-2 px-2.5 font-mono text-xs font-bold tracking-[.12em] text-texto-2">SIMULADO</span>
          </div>
          {multas.map((m) => (
            <div key={m.id} className="flex min-h-14 items-center justify-between gap-3 border-b border-borde px-4">
              <span className="flex flex-col leading-5"><span className="font-semibold">{m.plate} · {TIPO[m.type]}</span><span className="text-caption text-texto-2">{formatBs(m.amountCents)}</span></span>
              <span className="font-mono font-bold">{m.paymentReference}</span>
            </div>
          ))}
          <div className="grid grid-cols-2">
            <div className="flex flex-col px-4 py-3"><span className="text-caption text-texto-2">Fecha</span><span className="font-mono font-bold">{pagadoEl && `${formatFecha(pagadoEl)} · ${formatHora(pagadoEl)}`}</span></div>
            <div className="flex flex-col border-l border-borde px-4 py-3"><span className="text-caption text-texto-2">Teléfono</span><span className="font-mono font-bold">{telefono && maskTelefono(telefono)}</span></div>
          </div>
        </section>

        <BotonLink to="/inicio">Volver al inicio</BotonLink>
        {restantes.length > 0 && (
          <BotonLink variante="outline" to={restantes.length === 1 ? `/multas/${restantes[0]?.id}/pagar` : '/pagar'} state={{ desde: st?.desde }}>
            Pagar {restantes.length === 1 ? 'la restante' : 'las restantes'} ({formatBs(restantes.reduce((t, m) => t + m.amountCents, 0))})
          </BotonLink>
        )}
        <span className="text-center text-caption text-texto-2">Le enviamos la confirmación por WhatsApp.</span>
      </div>
    </Pagina>
  )
}
