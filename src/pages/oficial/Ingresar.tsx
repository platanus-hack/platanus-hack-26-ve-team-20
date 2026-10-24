import { Clock } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { DemoError } from '@/lib/demo/api.ts'
import { getSesionOficial, iniciarSesionOficial } from '@/lib/oficial/api.ts'
import { Boton, Campo } from '@/components/ui/index.tsx'
import { input } from '@/components/ui/estilos.ts'
import { display } from '@/components/cuenta/piezas.tsx'

const INICIO = '/oficial/multas'

export default function Ingresar() {
  const navigate = useNavigate()
  const st = useLocation().state as { vencida?: boolean; desde?: string } | null
  const [correo, setCorreo] = useState('oficial.a@example.com')
  const [clave, setClave] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (getSesionOficial() && !enviando) return <Navigate to={INICIO} replace />

  const entrar = async (e: FormEvent) => {
    e.preventDefault()
    if (enviando) return
    setEnviando(true)
    setError(null)
    try {
      await iniciarSesionOficial(correo, clave)
      // Solo rutas del oficial: no se reenvía a una ruta ajena que venga en el estado.
      navigate(st?.desde?.startsWith('/oficial/') ? st.desde : INICIO, { replace: true })
    } catch (err) {
      setError(err instanceof DemoError && err.code === 'CREDENCIALES' ? 'Correo o contraseña incorrectos.' : 'No pudimos conectar. Intente de nuevo.')
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={entrar} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className={display}>Acceso policial</h1>
        <p className="text-texto-2">Historial de multas. Use el correo con el que lo invitaron.</p>
      </div>
      {st?.vencida && (
        <div role="status" className="flex gap-2.5 rounded-control bg-azul-bg px-3.5 py-3 text-sm text-azul-osc">
          <Clock size={18} strokeWidth={1.75} aria-hidden="true" className="mt-px flex-none" />
          Su sesión venció por seguridad. Entre de nuevo para continuar.
        </div>
      )}
      <Campo id="o-correo" label="Correo">
        <input id="o-correo" type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} className={input()} />
      </Campo>
      <Campo id="o-clave" label="Contraseña">
        <input
          id="o-clave"
          type="password"
          autoComplete="current-password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? 'o-clave-err' : undefined}
          className={input(!!error)}
        />
        {error && <span id="o-clave-err" role="alert" className="text-caption text-rojo-osc">{error}</span>}
      </Campo>
      <Boton type="submit" disabled={enviando} aria-busy={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</Boton>
      <span className="text-center text-caption text-texto-3">Prototipo: oficial.a@example.com con la contraseña «demo1234»; «clave-mal» simula una clave incorrecta.</span>
    </form>
  )
}
