import { useState, type FormEvent } from 'react'
import { DemoError } from '@/lib/demo/api.ts'
import { MOTIVO_MIN, accionesPermitidas, cambiarEstado, type Accion, type MultaDetalle, type MultaOficial } from '@/lib/oficial/api.ts'
import { ACCION, TIPO } from '@/lib/etiquetas.ts'
import { Boton, Hoja } from '@/components/ui/index.tsx'
import { cx } from '@/components/ui/estilos.ts'
import { EstadoBadge, PlacaChip } from '@/components/vc/index.tsx'

const EFECTO: Record<Accion, string> = {
  VOID: 'La multa quedará ANULADA y no se podrá cobrar. Es un estado final.',
  APPEAL_ACCEPT: 'La multa quedará ANULADA. Es un estado final.',
  APPEAL_REJECT: 'La multa vuelve a PENDIENTE (o VENCIDA si ya pasó su plazo) y el cobro se reanuda.',
}

/**
 * Diálogo de cambio de estado. El padre lo monta al abrir y lo desmonta en `onCerrar`, así cada apertura empieza limpia.
 * Solo ofrece las acciones que el estado actual permite; el motivo es obligatorio y queda en la auditoría.
 */
export function CambioEstado({ multa, inicial, onCerrar, onHecho }: {
  multa: MultaOficial
  inicial?: Accion
  onCerrar: () => void
  onHecho: (m: MultaDetalle) => void
}) {
  const opciones = accionesPermitidas(multa.status)
  const [accion, setAccion] = useState<Accion | undefined>(inicial && opciones.includes(inicial) ? inicial : opciones[0])
  const [motivo, setMotivo] = useState('')
  const [intento, setIntento] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<MultaDetalle | null>(null)

  // Cerrar con `close()` nativo (no desmontando): el navegador devuelve el foco al botón que abrió el diálogo.
  const [abierta, setAbierta] = useState(true)
  const corto = motivo.trim().length < MOTIVO_MIN
  const cerrar = () => { if (!enviando) setAbierta(false) }

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setIntento(true)
    if (enviando || !accion || corto) return
    setEnviando(true)
    setError(null)
    try {
      const m = await cambiarEstado(multa.id, accion, motivo)
      setHecho(m)
      onHecho(m)
    } catch (err) {
      const code = err instanceof DemoError ? err.code : 'RED'
      if (code === 'SESION') return onCerrar() // el Shell muestra "Su sesión venció"
      setError(code === 'TRANSICION'
        ? 'Esta multa cambió de estado mientras usted la revisaba. Cierre y vuelva a abrirla.'
        : code === 'VALIDACION' ? `Escriba un motivo de al menos ${MOTIVO_MIN} caracteres.` : 'No pudimos guardar el cambio. Revise su conexión e intente de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Hoja abierta={abierta} modo="modal" etiqueta={hecho ? 'Cambio guardado' : accion ? ACCION[accion] : 'Cambiar estado'} onCerrar={onCerrar} bloqueada={enviando}>
      {hecho ? (
        <>
          <h2 className="text-h2 font-semibold">Cambio guardado</h2>
          <p role="status" className="text-texto-2">La multa ahora está <EstadoBadge status={hecho.status} />. El motivo quedó en la auditoría.</p>
          <Boton autoFocus onClick={cerrar}>Cerrar</Boton>
        </>
      ) : (
      <form onSubmit={enviar} noValidate className="flex flex-col gap-3.5">
        <h2 className="text-h2 font-semibold">{opciones.length > 1 ? 'Resolver apelación' : accion && ACCION[accion]}</h2>
        <span className="flex flex-wrap items-center gap-2 text-sm text-texto-2">
          <PlacaChip value={multa.plate} /> {TIPO[multa.type]} · <EstadoBadge status={multa.status} />
        </span>
        {opciones.length > 1 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-semibold">Decisión</legend>
            {opciones.map((a) => (
              <label key={a} className={cx('flex min-h-11 cursor-pointer items-center gap-3 rounded-control border px-3.5', accion === a ? 'border-tinta bg-suave' : 'border-borde')}>
                <input type="radio" name="accion" value={a} checked={accion === a} onChange={() => setAccion(a)} className="size-5 accent-tinta" />
                <span className="font-semibold">{ACCION[a]}</span>
              </label>
            ))}
          </fieldset>
        )}
        {accion && <p className="text-sm text-texto-2">{EFECTO[accion]}</p>}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ce-motivo" className="text-sm font-semibold">Motivo (obligatorio)</label>
          <textarea
            id="ce-motivo"
            rows={3}
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            aria-invalid={intento && corto}
            aria-describedby="ce-ayuda"
            className={cx('w-full rounded-control bg-card px-3.5 py-3 text-base text-tinta', intento && corto ? 'border-[1.5px] border-rojo' : 'border border-input')}
          />
          <span id="ce-ayuda" className={cx('text-caption', intento && corto ? 'text-rojo-osc' : 'text-texto-2')}>
            {intento && corto ? `Escriba al menos ${MOTIVO_MIN} caracteres.` : `Mínimo ${MOTIVO_MIN} caracteres. Quedará en la auditoría con su nombre.`}
          </span>
        </div>
        {error && <p role="alert" className="rounded-control bg-rojo-bg px-3.5 py-3 text-sm font-semibold text-rojo-osc">{error}</p>}
        <Boton type="submit" variante={accion === 'APPEAL_REJECT' ? 'primary' : 'pay'} disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Guardando…' : `Confirmar: ${accion ? ACCION[accion].toLowerCase() : ''}`}
        </Boton>
        <Boton variante="outline" disabled={enviando} onClick={cerrar}>Cancelar</Boton>
      </form>
      )}
    </Hoja>
  )
}
