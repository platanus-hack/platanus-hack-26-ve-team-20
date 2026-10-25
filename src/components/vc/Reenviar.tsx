import { Send } from 'lucide-react'
import { useState } from 'react'
import { DemoError, type DemoErrorCode } from '@/lib/demo/api.ts'
import { Boton } from '@/components/ui/index.tsx'
import { cx, enlace } from '@/components/ui/estilos.ts'

/** Lo mínimo que devuelven los reenvíos del ciudadano y del oficial. */
export interface ResultadoReenvio { status: 'SENT' | 'DRY_RUN' | 'FAILED'; telefono: string }

const ERROR: Partial<Record<DemoErrorCode, string>> = {
  LIMITE: 'Ya se reenvió 3 veces en la última hora. Intente más tarde.',
  NO_REENVIABLE: 'Esta multa ya no admite reenvío.',
  SIN_TELEFONO: 'No hay un teléfono registrado para enviar la notificación.',
  SIN_TITULAR: 'El vehículo no tiene un titular registrado.',
  NO_ENCONTRADA: 'No encontramos esta multa.',
}

function mensajeReenvio(r: ResultadoReenvio): string {
  if (r.status === 'SENT') return `Notificación enviada por WhatsApp al ${r.telefono}.`
  if (r.status === 'DRY_RUN') return 'El envío está desactivado en este servidor (demo): quedó registrado pero no salió.'
  return `No se pudo entregar al ${r.telefono}. Intente de nuevo.`
}

/**
 * «Reenviar notificación»: manda por WhatsApp, al teléfono del titular, el mismo mensaje de la multa (tipo, lugar,
 * fecha, placa, monto y enlace con evidencia y pago). `compacto` es un enlace para filas de lista; si no, un botón.
 * Muestra el resultado debajo; un fallo de sesión lo avisa el Shell, no este componente.
 */
export function BotonReenviar<T extends ResultadoReenvio>({ enviar, onHecho, compacto, corto, descripcion, className }: {
  enviar: () => Promise<T>
  onHecho?: (r: T) => void
  compacto?: boolean
  /** Botón contorneado chico que solo dice «Reenviar» (franja del detalle de multa). */
  corto?: boolean
  /** Para lectores de pantalla en listas: qué multa se reenvía. */
  descripcion?: string
  className?: string
}) {
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<{ texto: string; error: boolean } | null>(null)

  const reenviar = async () => {
    if (enviando) return
    setEnviando(true)
    setAviso(null)
    try {
      const r = await enviar()
      setAviso({ texto: mensajeReenvio(r), error: r.status === 'FAILED' })
      onHecho?.(r)
    } catch (e) {
      if (e instanceof DemoError && e.code === 'SESION') return
      setAviso({ texto: (e instanceof DemoError && ERROR[e.code]) || 'No pudimos reenviar la notificación. Intente de nuevo.', error: true })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <span className={cx('flex flex-col items-start gap-1', className)}>
      {compacto ? (
        <button type="button" onClick={reenviar} disabled={enviando} aria-busy={enviando} aria-label={descripcion ? `Reenviar notificación: ${descripcion}` : undefined} className={enlace}>
          {enviando ? 'Enviando…' : 'Reenviar notificación'}
        </button>
      ) : corto ? (
        <button type="button" onClick={reenviar} disabled={enviando} aria-busy={enviando} aria-label="Reenviar notificación por WhatsApp" className="press flex min-h-11 items-center gap-2 rounded-control border border-borde px-4 text-sm font-semibold text-tinta transition-colors duration-150 hover:bg-suave">
          <Send size={16} strokeWidth={1.9} aria-hidden="true" />{enviando ? 'Enviando…' : 'Reenviar'}
        </button>
      ) : (
        <Boton variante="outline" onClick={reenviar} disabled={enviando} aria-busy={enviando}>
          <Send size={18} strokeWidth={1.75} aria-hidden="true" />{enviando ? 'Enviando…' : 'Reenviar notificación'}
        </Boton>
      )}
      {aviso && <span role={aviso.error ? 'alert' : 'status'} className={cx('text-caption', aviso.error ? 'text-rojo-osc' : 'text-texto-2')}>{aviso.texto}</span>}
    </span>
  )
}
