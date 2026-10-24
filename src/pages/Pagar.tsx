// /multa/:token/pagar — Pago Móvil C2P SIMULADO (docs/05 §3.4, HU-04). Sin banco ni dinero real.
// Un intento = una idempotencyKey: el doble clic no paga dos veces; tras un rechazo se usa una nueva.
// La clave C2P solo vive en el estado del formulario y se borra al enviar.
import { useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { EXAMPLE_BANKS, type FinePublicDTO } from '@contracts'
import { payFine, type PaymentOutcome, type Source } from '../components/multa/api.ts'
import { EMPTY_FORM, rejectionMessage, toC2PRequest, validateC2PForm, type C2PFormErrors, type C2PFormValues } from '../components/multa/c2p-form.ts'
import { formatAmount, formatDateTime, isPayable } from '../components/multa/format.ts'
import { Card, LoadingFine, MONO, Notice, PageShell, Plate, Row, SourceNote, Spinner } from '../components/multa/ui.tsx'
import { useFine } from '../components/multa/use-fine.ts'

const INPUT =
  'mt-1 block min-h-11 w-full rounded-[6px] border border-[#5B6B85] bg-white px-3 py-2 text-[15px] font-normal text-[#14213D] focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-[#1F5FAD] aria-[invalid=true]:border-[#D62828]'

export default function Pagar() {
  const { token } = useParams()
  const load = useFine(token)

  if (!load) {
    return (
      <PageShell>
        <LoadingFine />
      </PageShell>
    )
  }
  if (load.kind !== 'ok') {
    return (
      <PageShell>
        <Notice title={load.kind === 'not_found' ? 'No encontramos esta multa' : 'No pudimos cargar la multa'}>
          {load.kind === 'not_found'
            ? 'Revise que el enlace esté completo, tal como llegó por WhatsApp.'
            : 'Hay un problema de conexión con el servidor. Intente de nuevo en unos minutos.'}
        </Notice>
      </PageShell>
    )
  }
  return <PaymentFlow fine={load.fine} source={load.source} />
}

function PaymentFlow({ fine, source }: { fine: FinePublicDTO; source: Source }) {
  const [values, setValues] = useState<C2PFormValues>(EMPTY_FORM)
  const [errors, setErrors] = useState<C2PFormErrors>({})
  const [sending, setSending] = useState(false)
  const [outcome, setOutcome] = useState<PaymentOutcome | null>(null)
  const attemptKey = useRef<string>(crypto.randomUUID())
  const amount = formatAmount(fine.amountCents, fine.currency)

  if (fine.status === 'PAID' || outcome?.kind === 'already_paid') {
    return (
      <PageShell>
        <Notice title="Esta multa ya fue pagada">
          No se hizo ningún cobro nuevo.{' '}
          <Link to={`/multa/${encodeURIComponent(fine.token)}`} className="font-semibold text-[#1F5FAD] underline">
            Ver el comprobante
          </Link>
          .
        </Notice>
      </PageShell>
    )
  }
  if (!isPayable(fine.status)) {
    return (
      <PageShell>
        <Notice title="Esta multa no se puede pagar">Su estado actual no admite pagos. Revise el detalle de la multa.</Notice>
      </PageShell>
    )
  }
  if (outcome?.kind === 'approved') return <Receipt reference={outcome.reference} paidAt={outcome.paidAt} amount={amount} token={fine.token} />

  const update = <K extends keyof C2PFormValues>(key: K, value: C2PFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (sending) return
    const found = validateC2PForm(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSending(true)
    setOutcome(null)
    const result = await payFine(toC2PRequest(values, fine.token, attemptKey.current), source)
    setSending(false)
    setOutcome(result)
    // la clave C2P es de un solo uso: no se conserva en pantalla
    setValues((v) => ({ ...v, c2pKey: '' }))
    if (result.kind === 'rejected' || result.kind === 'error') attemptKey.current = crypto.randomUUID()
  }

  const field = (key: keyof C2PFormValues) => ({
    id: `c2p-${key}`,
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `${key}-error` : undefined,
  })
  const errorText = (key: keyof C2PFormValues) =>
    errors[key] && (
      <p id={`${key}-error`} className="mt-1 text-[13px] font-semibold text-[#A61B1B]">
        {errors[key]}
      </p>
    )

  return (
    <PageShell>
      <SourceNote source={source} />
      <Link to={`/multa/${encodeURIComponent(fine.token)}`} className="text-[13px] font-semibold text-[#1F5FAD] underline">
        Volver a la multa
      </Link>
      <h1 className="mt-3 text-[28px] font-bold leading-[1.15]">Pagar con Pago Móvil C2P</h1>

      <Card className="mt-4">
        <dl>
          <Row label="Monto a pagar (ejemplo)">
            <span className={`${MONO} text-[22px]`}>{amount}</span>
          </Row>
          <Row label="Placa">
            <Plate value={fine.plateMasked} />
          </Row>
        </dl>
      </Card>

      {outcome?.kind === 'rejected' && (
        <div role="alert" className="mt-4 rounded-[6px] border border-[#D62828] bg-[#FBE7E7] px-3 py-2 text-[#A61B1B]">
          <p className="font-bold">Pago rechazado</p>
          <p>{rejectionMessage(outcome.failureCode)}</p>
        </div>
      )}
      {outcome?.kind === 'error' && (
        <div role="alert" className="mt-4 rounded-[6px] border border-[#D62828] bg-[#FBE7E7] px-3 py-2 text-[#A61B1B]">
          <p className="font-bold">No se pudo procesar el pago</p>
          <p>{outcome.message}</p>
        </div>
      )}

      <form noValidate onSubmit={submit} className="mt-6 grid gap-4">
        <p className="text-[13px] text-[#2B3A55]">Genere su clave C2P en la app de su banco y complete los datos de la cuenta que paga.</p>

        <div>
          <label htmlFor="c2p-bankCode" className="font-semibold">
            Banco
          </label>
          <select value={values.bankCode} onChange={(e) => update('bankCode', e.target.value)} className={INPUT} {...field('bankCode')}>
            <option value="">Seleccione su banco</option>
            {EXAMPLE_BANKS.map((b) => (
              <option key={b.code} value={b.code}>
                {b.code} · {b.name}
              </option>
            ))}
          </select>
          {errorText('bankCode')}
        </div>

        <div>
          <label htmlFor="c2p-phone" className="font-semibold">
            Teléfono afiliado
          </label>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="04121234567"
            value={values.phone}
            onChange={(e) => update('phone', e.target.value)}
            className={`${INPUT} ${MONO}`}
            {...field('phone')}
          />
          {errorText('phone')}
        </div>

        <fieldset>
          <legend className="font-semibold">Cédula</legend>
          <div className="flex gap-2">
            <select
              aria-label="Tipo de cédula"
              value={values.cedulaPrefix}
              onChange={(e) => update('cedulaPrefix', e.target.value === 'E' ? 'E' : 'V')}
              className={`${INPUT} w-20`}
            >
              <option value="V">V</option>
              <option value="E">E</option>
            </select>
            <input
              aria-label="Número de cédula"
              inputMode="numeric"
              placeholder="12345678"
              value={values.cedulaNumber}
              onChange={(e) => update('cedulaNumber', e.target.value)}
              className={`${INPUT} ${MONO}`}
              {...field('cedulaNumber')}
            />
          </div>
          {errorText('cedulaNumber')}
        </fieldset>

        <div>
          <label htmlFor="c2p-c2pKey" className="font-semibold">
            Clave C2P
          </label>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            placeholder="6 a 8 dígitos"
            value={values.c2pKey}
            onChange={(e) => update('c2pKey', e.target.value.replace(/\D/g, ''))}
            className={`${INPUT} ${MONO}`}
            {...field('c2pKey')}
          />
          {errorText('c2pKey')}
        </div>

        <button
          type="submit"
          disabled={sending}
          className="flex min-h-12 items-center justify-center rounded-[6px] bg-[#D62828] px-4 py-3 text-[18px] font-bold text-white hover:bg-[#B71F1F] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#14213D] disabled:cursor-wait disabled:bg-[#9B6B6B]"
        >
          {sending ? <Spinner label="Procesando pago simulado…" /> : `Pagar ${amount}`}
        </button>
        <p className="text-center text-[13px] text-[#5B6B85]">Pago simulado: no se debita ninguna cuenta.</p>
      </form>
    </PageShell>
  )
}

function Receipt({ reference, paidAt, amount, token }: { reference: string; paidAt: string; amount: string; token: string }) {
  return (
    <PageShell>
      <Card className="border-2 border-[#2D7D46]">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-[#22603A]">Pago aprobado · simulado</p>
        <h1 className="mt-1 text-[28px] font-bold leading-[1.15]">Comprobante</h1>
        <dl className="mt-4">
          <Row label="Referencia">
            <span className={`${MONO} text-[22px]`}>{reference}</span>
          </Row>
          <Row label="Monto">
            <span className={MONO}>{amount}</span>
          </Row>
          <Row label="Fecha">{formatDateTime(paidAt)}</Row>
          <Row label="Método">Pago Móvil C2P (simulado)</Row>
        </dl>
        <p className="mt-4 text-[13px] text-[#2B3A55]">Recibirá la confirmación por WhatsApp. Ningún banco procesó este pago: es una demostración.</p>
      </Card>
      <Link to={`/multa/${encodeURIComponent(token)}`} className="mt-4 inline-block font-semibold text-[#1F5FAD] underline">
        Volver a la multa
      </Link>
    </PageShell>
  )
}
