import { ChevronDown } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { cambiarClave, cerrarSesion, getPerfil } from '@/lib/demo/api.ts'
import { formatCedula, formatTelefono } from '@/lib/format.ts'
import { useCarga } from '@/hooks/useCarga.ts'
import { Boton, Campo, Interruptor, SelectorTema } from '@/components/ui/index.tsx'
import { cx, input, tarjeta } from '@/components/ui/estilos.ts'
import { ErrorCarga, Pagina, Titulo } from '@/components/cuenta/piezas.tsx'

const fila = 'flex min-h-14 items-center justify-between gap-3 px-4'

export default function Perfil() {
  const navigate = useNavigate()
  const { data, error, cargando, recargar } = useCarga(getPerfil, [])
  const [avisos, setAvisos] = useState(true)
  const [abrirClave, setAbrirClave] = useState(false)
  const [clave, setClave] = useState({ actual: '', nueva: '' })
  const [estadoClave, setEstadoClave] = useState<'ok' | 'mal' | 'enviando' | null>(null)

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
    <Pagina>
      <Titulo>Perfil</Titulo>
      {cargando && <span aria-busy="true" aria-label="Cargando perfil" className="sk h-72 max-w-[640px] rounded-card" />}
      {error && error.code !== 'SESION' && <ErrorCarga titulo="No pudimos cargar su perfil" texto="Revise su conexión e intente de nuevo." onReintentar={recargar} />}
      {data && (
        <div className="flex max-w-[640px] flex-col gap-3">
          <h2 className="px-1 text-caption font-semibold tracking-[.06em] text-texto-2 uppercase">Cuenta</h2>
          <div className={cx(tarjeta, 'flex flex-col')}>
            <div className={fila}><span className="text-texto-2">Cédula</span><span className="font-mono font-semibold">{formatCedula(data.cedula)}</span></div>
            <div className={cx(fila, 'border-t border-borde')}><span className="text-texto-2">Teléfono</span><span className="font-mono font-semibold">{formatTelefono(data.telefono)}</span></div>
            {data.correo && <div className={cx(fila, 'border-t border-borde')}><span className="text-texto-2">Correo</span><span>{data.correo}</span></div>}
            <button type="button" onClick={() => setAbrirClave(!abrirClave)} aria-expanded={abrirClave} aria-controls="p-clave-form" className={cx(fila, 'border-t border-borde text-left transition-colors duration-150 hover:bg-suave')}>
              <span className="flex-1">Cambiar contraseña</span>
              <ChevronDown size={18} strokeWidth={2} aria-hidden="true" className={cx('text-texto-2 transition-transform duration-[220ms] ease-sheet motion-reduce:transition-none', abrirClave && 'rotate-180')} />
            </button>
            {abrirClave && (
              <form id="p-clave-form" onSubmit={guardar} noValidate className="flex flex-col gap-3 px-4 pb-4">
                <Campo id="p-a" label="Contraseña actual">
                  <input id="p-a" type="password" autoComplete="current-password" value={clave.actual} onChange={(e) => setClave({ ...clave, actual: e.target.value })} className={input(estadoClave === 'mal' && !clave.actual)} />
                </Campo>
                <Campo id="p-n" label="Nueva contraseña" error={estadoClave === 'mal' && 'Escriba su contraseña actual y una nueva de al menos 8 caracteres.'}>
                  <input id="p-n" type="password" autoComplete="new-password" value={clave.nueva} onChange={(e) => setClave({ ...clave, nueva: e.target.value })} className={input(estadoClave === 'mal' && clave.nueva.length < 8)} />
                </Campo>
                {estadoClave === 'ok' && <span role="status" className="text-sm font-semibold text-verde-osc">Contraseña actualizada.</span>}
                <Boton type="submit" disabled={estadoClave === 'enviando'} className="self-start">{estadoClave === 'enviando' ? 'Guardando…' : 'Guardar'}</Boton>
              </form>
            )}
          </div>
          <h2 className="mt-3 px-1 text-caption font-semibold tracking-[.06em] text-texto-2 uppercase">Preferencias</h2>
          <div className={cx(tarjeta, 'flex flex-col')}>
            <div className={cx(fila, 'py-3')}>
              <span className="flex flex-col"><span>Avisos por WhatsApp</span><span className="text-caption text-texto-2">Le escribimos cuando llegue una multa.</span></span>
              <Interruptor activo={avisos} onCambio={setAvisos} etiqueta="Avisos por WhatsApp" />
            </div>
            <div className="flex flex-col gap-2.5 border-t border-borde px-4 py-3.5"><span>Apariencia</span><SelectorTema className="max-w-[360px]" /></div>
          </div>
        </div>
      )}
      <Boton variante="outline" className="mt-2 w-full max-w-[640px] text-rojo-osc!" onClick={() => { cerrarSesion(); navigate('/ingresar') }}>Cerrar sesión</Boton>
    </Pagina>
  )
}
