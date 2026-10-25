import { ChevronDown, KeyRound, LogOut, User } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { cambiarClave, type Sesion } from '@/lib/demo/api.ts'
import { formatCedula, formatTelefono } from '@/lib/format.ts'
import { Boton, Campo } from '@/components/ui/index.tsx'
import { cx, input } from '@/components/ui/estilos.ts'

const item = 'press flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm no-underline transition-colors duration-150 hover:bg-suave focus-visible:bg-suave'

/** Botón de usuario: abre los datos de la cuenta, el cambio de contraseña y la salida. Escape o un clic fuera lo cierran. */
export function MenuCuenta({ sesion, onSalir }: { sesion: Sesion; onSalir: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const [abrirClave, setAbrirClave] = useState(false)
  const [clave, setClave] = useState({ actual: '', nueva: '' })
  const [estadoClave, setEstadoClave] = useState<'ok' | 'mal' | 'enviando' | null>(null)
  const caja = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const panel = useId()

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAbierto(false); boton.current?.focus() } }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    caja.current?.querySelector<HTMLElement>('[role=dialog] button')?.focus()
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    if (clave.nueva.length < 8 || !clave.actual) { setEstadoClave('mal'); return }
    setEstadoClave('enviando')
    try {
      await cambiarClave(clave.actual, clave.nueva)
      setClave({ actual: '', nueva: '' })
      setEstadoClave('ok')
    } catch {
      setEstadoClave('mal')
    }
  }

  return (
    <div ref={caja} className="relative">
      <button
        ref={boton}
        type="button"
        aria-label="Su cuenta"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={panel}
        onClick={() => setAbierto(!abierto)}
        className={cx('press flex size-11 items-center justify-center rounded-full bg-brand text-[#0e1726] transition-shadow duration-150 ease-press hover:ring-4 hover:ring-brand/25', abierto && 'ring-4 ring-brand/25')}
      >
        <User size={20} strokeWidth={2.2} aria-hidden="true" />
      </button>

      {abierto && (
        <div id={panel} role="dialog" aria-label="Su cuenta" className="menu-entra absolute top-full right-0 z-30 mt-2 flex w-[min(300px,calc(100vw-24px))] flex-col rounded-2xl border border-borde bg-card shadow-card">
          <div className="flex items-center gap-3 p-4">
            <span aria-hidden="true" className="flex size-11 flex-none items-center justify-center rounded-full bg-brand text-[#0e1726]"><User size={20} strokeWidth={2.2} /></span>
            <span className="flex min-w-0 flex-col">
              <span className="text-caption text-texto-2">Cédula</span>
              <span className="font-mono text-base font-semibold text-tinta">{formatCedula(sesion.cedula)}</span>
            </span>
          </div>
          <dl className="flex flex-col border-t border-borde px-4 py-2 text-sm">
            <div className="flex min-h-9 items-center justify-between gap-3">
              <dt className="text-texto-2">Teléfono</dt>
              <dd className="font-mono font-medium text-tinta">{formatTelefono(sesion.telefono)}</dd>
            </div>
            {sesion.correo && (
              <div className="flex min-h-9 items-center justify-between gap-3">
                <dt className="text-texto-2">Correo</dt>
                <dd className="min-w-0 truncate text-tinta" title={sesion.correo}>{sesion.correo}</dd>
              </div>
            )}
          </dl>
          <div className="flex flex-col border-t border-borde p-1.5">
            <button type="button" onClick={() => { setAbrirClave(!abrirClave); setEstadoClave(null) }} aria-expanded={abrirClave} aria-controls={`${panel}-clave`} className={cx(item, 'text-tinta')}>
              <KeyRound size={17} strokeWidth={2} aria-hidden="true" className="text-texto-2" />
              <span className="flex-1">Cambiar contraseña</span>
              <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className={cx('text-texto-2 transition-transform duration-200 ease-sheet motion-reduce:transition-none', abrirClave && 'rotate-180')} />
            </button>
            {abrirClave && (
              <form id={`${panel}-clave`} onSubmit={guardar} noValidate className="flex flex-col gap-3 px-3 pt-1 pb-3">
                <Campo id={`${panel}-a`} label="Contraseña actual">
                  <input id={`${panel}-a`} type="password" autoComplete="current-password" value={clave.actual} onChange={(e) => setClave({ ...clave, actual: e.target.value })} className={input(estadoClave === 'mal' && !clave.actual)} />
                </Campo>
                <Campo id={`${panel}-n`} label="Nueva contraseña" error={estadoClave === 'mal' && 'Escriba su contraseña actual y una nueva de al menos 8 caracteres.'}>
                  <input id={`${panel}-n`} type="password" autoComplete="new-password" value={clave.nueva} onChange={(e) => setClave({ ...clave, nueva: e.target.value })} className={input(estadoClave === 'mal' && clave.nueva.length < 8)} />
                </Campo>
                {estadoClave === 'ok' && <span role="status" className="text-sm font-semibold text-verde-osc">Contraseña actualizada.</span>}
                <Boton type="submit" disabled={estadoClave === 'enviando'} aria-busy={estadoClave === 'enviando'}>{estadoClave === 'enviando' ? 'Guardando…' : 'Guardar'}</Boton>
              </form>
            )}
            <button type="button" onClick={onSalir} className={cx(item, 'font-semibold text-rojo-osc')}>
              <LogOut size={17} strokeWidth={2} aria-hidden="true" />Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
