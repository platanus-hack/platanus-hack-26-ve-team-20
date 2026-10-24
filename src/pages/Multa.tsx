// /multa/:token — aterrizaje de la multa desde el WhatsApp (docs/05 §3.3, HU-04).
// Muestra evidencia, monto y estado; nunca cédula ni teléfono (no vienen en FinePublicDTO).
import { Link, useParams } from 'react-router'
import { formatAmount, formatDate, formatDateTime, isPayable, statusLabel, VIOLATION_LABELS } from '../components/multa/format.ts'
import { Card, Evidence, LoadingFine, MONO, Notice, PageShell, Plate, Row, SourceNote, StatusBadge } from '../components/multa/ui.tsx'
import { useFine } from '../components/multa/use-fine.ts'

export default function Multa() {
  const { token } = useParams()
  const load = useFine(token)

  if (!load) {
    return (
      <PageShell>
        <LoadingFine />
      </PageShell>
    )
  }
  if (load.kind === 'not_found') {
    return (
      <PageShell>
        <Notice title="No encontramos esta multa">
          Revise que el enlace esté completo, tal como llegó por WhatsApp. Si el problema sigue, consulte su historial en{' '}
          <Link to="/consulta" className="font-semibold text-[#1F5FAD] underline">
            Consultar por cédula
          </Link>
          .
        </Notice>
      </PageShell>
    )
  }
  if (load.kind === 'unavailable') {
    return (
      <PageShell>
        <Notice title="No pudimos cargar la multa">Hay un problema de conexión con el servidor. Intente de nuevo en unos minutos.</Notice>
      </PageShell>
    )
  }

  const { fine, source } = load
  const status = statusLabel(fine.status, fine.overdue)
  const paid = fine.status === 'PAID'

  return (
    <PageShell>
      <SourceNote source={source} />

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] font-bold leading-[1.15]">Aviso de infracción</h1>
        <StatusBadge {...status} />
      </div>
      <p className="mt-2 text-[18px] font-semibold">{VIOLATION_LABELS[fine.type]}</p>
      <p className="text-[#2B3A55]">
        {formatDateTime(fine.occurredAt)} (hora de Caracas) · {fine.intersection}
      </p>

      <h2 className="mb-3 mt-6 text-[18px] font-bold">Evidencia</h2>
      <Evidence items={fine.evidence} />

      <Card className="mt-6">
        <dl>
          <Row label="Placa">
            <Plate value={fine.plateMasked} />
          </Row>
          {fine.vehicle && <Row label="Vehículo">{fine.vehicle}</Row>}
          <Row label="Cámara">
            <span className={MONO}>{fine.cameraCode}</span>
          </Row>
          <Row label="Monto (ejemplo)">
            <span className={`${MONO} text-[22px]`}>{formatAmount(fine.amountCents, fine.currency)}</span>
          </Row>
          {!paid && (
            <Row label="Vence">
              <span className={fine.overdue ? 'text-[#A61B1B]' : ''}>{formatDate(fine.dueAt)}</span>
            </Row>
          )}
        </dl>
      </Card>

      {paid ? (
        <Card className="mt-4 border-[#2D7D46]">
          <h2 className="text-[18px] font-bold text-[#22603A]">Multa pagada</h2>
          <dl className="mt-2">
            {fine.paymentReference && (
              <Row label="Referencia">
                <span className={MONO}>{fine.paymentReference}</span>
              </Row>
            )}
            {fine.paidAt && <Row label="Fecha de pago">{formatDateTime(fine.paidAt)}</Row>}
            <Row label="Método">Pago Móvil C2P (simulado)</Row>
          </dl>
        </Card>
      ) : (
        isPayable(fine.status) && (
          <Link
            to={`/multa/${encodeURIComponent(fine.token)}/pagar`}
            className="mt-6 flex min-h-12 items-center justify-center rounded-[6px] bg-[#D62828] px-4 py-3 text-[18px] font-bold text-white hover:bg-[#B71F1F] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]"
          >
            Pagar con Pago Móvil C2P
          </Link>
        )
      )}

      <section className="mt-8 text-[13px] text-[#2B3A55]">
        <p className="font-semibold text-[#14213D]">
          {fine.verification === 'AUTO' ? 'Verificado automáticamente' : 'Verificado por un operador'}
        </p>
        <p className="mt-1">
          Una cámara registró el cruce de la línea de pare y el sistema confirmó que el semáforo estaba en rojo en ese instante.
          {fine.verification === 'AUTO'
            ? ' La detección y la lectura de la placa coincidieron con alta confianza.'
            : ' Un operador revisó la evidencia antes de emitir la multa.'}{' '}
          Si cree que hay un error, podrá apelar con la evidencia a la vista.
        </p>
      </section>
    </PageShell>
  )
}
