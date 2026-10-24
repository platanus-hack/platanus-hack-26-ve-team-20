import { Clock, Eye, EyeOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { DemoError, USA_API_REAL, getSesion, iniciarSesion } from '@/lib/demo/api.ts'
import { Boton, Campo, SelectCedula } from '@/components/ui/index.tsx'
import { enlace, input } from '@/components/ui/estilos.ts'
import { display } from '@/components/cuenta/piezas.tsx'

const INTENTOS = 3

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const st = location.state as { vencida?: boolean; desde?: string } | null
  const [tipo, setTipo] = useState<'V' | 'E'>('V')
  const [ced, setCed] = useState(USA_API_REAL ? '' : '99000001')
  const [clave, setClave] = useState('')
  const [ver, setVer] = useState(false)
  const [fallos, setFallos] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [olvido, setOlvido] = useState(false)
  const [fallaServidor, setFallaServidor] = useState<string | null>(null)

  if (getSesion() && !enviando) return <Navigate to="/inicio" replace />

  const entrar = async (e: FormEvent) => {
    e.preventDefault()
    if (enviando) return
    setEnviando(true)
    setFallaServidor(null)
    try {
      await iniciarSesion(`${tipo}${ced}`, clave)
      navigate(st?.desde ?? '/inicio', { replace: true })
    } catch (err) {
      if (err instanceof DemoError && err.code === 'CREDENCIALES') setFallos((f) => f + 1)
      else setFallaServidor(err instanceof DemoError && err.code === 'RED'
        ? 'No pudimos conectar con el servidor. Revise su conexión e intente de nuevo.'
        : 'No pudimos iniciar sesión en este momento. Intente de nuevo en unos minutos.')
      setEnviando(false)
    }
  }

  const quedan = INTENTOS - fallos
  const error = fallos > 0 && (quedan > 0
    ? `Cédula o contraseña incorrectas. Le ${quedan === 1 ? 'queda 1 intento' : `quedan ${quedan} intentos`}.`
    : 'Cédula o contraseña incorrectas. Por seguridad, espere unos minutos o recupere su contraseña.')

  return (
    <form onSubmit={entrar} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className={display}>Entrar</h1>
        <p className="text-texto-2">Use su cédula y su contraseña.</p>
      </div>
      {st?.vencida && (
        <div role="status" className="flex gap-2.5 rounded-control bg-azul-bg px-3.5 py-3 text-sm text-azul-osc">
          <Clock size={18} strokeWidth={1.75} aria-hidden="true" className="mt-px flex-none" />
          Su sesión venció por seguridad. Entre de nuevo para continuar.
        </div>
      )}
      <Campo id="l-ced" label="Cédula">
        <div className="flex gap-2">
          <SelectCedula value={tipo} onChange={setTipo} />
          <input id="l-ced" type="text" inputMode="numeric" autoComplete="username" value={ced} onChange={(e) => setCed(e.target.value.replace(/\D/g, '').slice(0, 9))} className={input(false, true)} />
        </div>
      </Campo>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="l-clave" className="text-sm font-semibold">Contraseña</label>
        <div className="relative">
          <input
            id="l-clave"
            type={ver ? 'text' : 'password'}
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            aria-invalid={fallos > 0}
            aria-describedby={error ? 'l-err' : undefined}
            className={`${input(fallos > 0)} pr-[52px]`}
          />
          <button type="button" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar contraseña' : 'Ver contraseña'} className="absolute top-0.5 right-0.5 flex size-11 items-center justify-center text-texto-2">
            {ver ? <EyeOff size={20} strokeWidth={1.75} aria-hidden="true" /> : <Eye size={20} strokeWidth={1.75} aria-hidden="true" />}
          </button>
        </div>
        {error && <span id="l-err" role="alert" className="text-caption text-rojo-osc">{error}</span>}
        <button type="button" onClick={() => setOlvido(true)} aria-expanded={olvido} className={`${enlace} self-start px-0`}>¿Olvidó su contraseña?</button>
        {olvido && (
          <span role="status" className="text-caption text-texto-2">
            Le enviaremos un código por WhatsApp al teléfono registrado para su cédula. En esta demo no se envía nada.
          </span>
        )}
      </div>
      {fallaServidor && <p role="alert" className="text-sm text-rojo-osc">{fallaServidor}</p>}
      <Boton type="submit" variante="acceso" disabled={enviando} aria-busy={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</Boton>
      <div className="flex items-center justify-center gap-1.5 text-sm text-texto-2">
        ¿No tiene cuenta?<Link to="/registro" className={enlace}>Crear cuenta</Link>
      </div>
      {!USA_API_REAL && <span className="text-center text-caption text-texto-3">Prototipo: V-99000001 con cualquier contraseña de 6 o más caracteres; «clave-mal» simula una clave incorrecta.</span>}
    </form>
  )
}
