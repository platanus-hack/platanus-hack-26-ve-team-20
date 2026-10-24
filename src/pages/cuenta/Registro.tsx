import { ChevronLeft, MessageSquare } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { DemoError, USA_API_REAL, getSesion, solicitarCodigo } from '@/lib/demo/api.ts'
import { TELEFONO_RE } from '@/lib/format.ts'
import { Boton, Campo, SelectCedula } from '@/components/ui/index.tsx'
import { enlace, input } from '@/components/ui/estilos.ts'
import { Pasos } from '@/components/cuenta/AuthLayout.tsx'

export default function Registro() {
  const navigate = useNavigate()
  const [f, setF] = useState({ tipo: 'V' as 'V' | 'E', ced: '', tel: '', correo: '', c1: '', c2: '' })
  // La vista tiene dos pasos cortos (datos y contraseña) para que quepa sin scroll.
  const [paso, setPaso] = useState<'datos' | 'clave'>('datos')
  const [intento, setIntento] = useState(false)
  const [intentoClave, setIntentoClave] = useState(false)
  const [yaRegistrada, setYaRegistrada] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (getSesion()) return <Navigate to="/inicio" replace />

  const set = (k: keyof typeof f, digitos?: number) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: digitos ? e.target.value.replace(/\D/g, '').slice(0, digitos) : e.target.value }))

  const cedOk = /^\d{6,9}$/.test(f.ced)
  const telOk = TELEFONO_RE.test(f.tel)
  const cedMal = intento && !cedOk
  const telMal = intento && !telOk
  const claveTexto = f.c1.length < 8 ? 'La contraseña debe tener al menos 8 caracteres.' : f.c1 !== f.c2 ? 'Las contraseñas no coinciden.' : ''
  const claveMal = intentoClave && !!claveTexto

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setFallo(null)
    // Paso de datos: valida cédula y teléfono y pasa a la contraseña, sin salir de la vista.
    if (paso === 'datos') {
      setIntento(true)
      if (!cedOk || !telOk) return
      setYaRegistrada(false)
      setPaso('clave')
      return
    }
    setIntentoClave(true)
    if (enviando || claveTexto) return
    setEnviando(true)
    try {
      await solicitarCodigo({ cedula: `${f.tipo}${f.ced}`, telefono: f.tel, correo: f.correo.trim() || null, clave: f.c1 })
      navigate('/registro/codigo')
    } catch (err) {
      const ya = err instanceof DemoError && err.code === 'YA_REGISTRADA'
      setYaRegistrada(ya)
      // La cédula ya registrada se corrige en el paso de datos; cualquier otro fallo se muestra aquí.
      if (ya) setPaso('datos')
      setFallo(ya ? null : err instanceof Error && err.message ? err.message : 'No pudimos enviar el código. Intente de nuevo.')
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
      <Pasos actual={1} />
      {paso === 'datos' ? (
        <div key="datos" className="vista flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-h1-m font-bold tracking-[-0.02em] lg:text-h1">Crear cuenta</h1>
            <p className="text-texto-2">Vea y pague sus multas con su cédula.</p>
          </div>
          {yaRegistrada && (
            <div role="alert" className="flex flex-col gap-1 rounded-control bg-rojo-bg px-3.5 py-3 text-sm text-rojo-osc">
              <span className="font-semibold">Esta cédula ya tiene una cuenta.</span>
              <span>Entre con su contraseña o recupérela desde «¿Olvidó su contraseña?». <Link to="/ingresar" className="font-semibold underline">Ir a Entrar</Link></span>
            </div>
          )}
          <Campo id="r-ced" label="Cédula" error={cedMal && 'Escriba los 6 a 9 dígitos de su cédula.'}>
            <div className="flex gap-2">
              <SelectCedula value={f.tipo} onChange={(tipo) => setF((x) => ({ ...x, tipo }))} />
              <input id="r-ced" type="text" inputMode="numeric" autoComplete="username" placeholder="99000001" value={f.ced} onChange={set('ced', 9)} aria-invalid={cedMal || yaRegistrada} className={input(cedMal || yaRegistrada, true)} />
            </div>
          </Campo>
          <Campo id="r-tel" label="Teléfono" error={telMal && 'Use 0412, 0414, 0416, 0424 o 0426 y 7 dígitos.'}>
            <input id="r-tel" type="tel" inputMode="numeric" autoComplete="tel" placeholder="04120000001" value={f.tel} onChange={set('tel', 11)} aria-invalid={telMal} className={input(telMal, true)} />
          </Campo>
          <Campo id="r-mail" label={<>Correo <span className="font-normal text-texto-2">(opcional)</span></>}>
            <input id="r-mail" type="email" autoComplete="email" placeholder="usted@correo.com" value={f.correo} onChange={set('correo')} className={input()} />
          </Campo>
          <Boton type="submit">Continuar</Boton>
          <div className="flex items-center justify-center gap-1.5 text-sm text-texto-2">
            ¿Ya tiene cuenta?<Link to="/ingresar" className={enlace}>Entrar</Link>
          </div>
          {!USA_API_REAL && <span className="text-center text-caption text-texto-3">Prototipo: 12345678 ya tiene cuenta; otra cédula distinta de 99000001 crea una cuenta sin vehículos.</span>}
        </div>
      ) : (
        <div key="clave" className="vista flex flex-col gap-4">
          <button type="button" onClick={() => { setPaso('datos'); setFallo(null) }} className="-ml-1 flex min-h-11 items-center gap-1 self-start pr-2 text-sm font-semibold">
            <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />Datos
          </button>
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-h1-m font-bold tracking-[-0.02em] lg:text-h1">Cree su contraseña</h1>
            <p className="text-texto-2">
              Para la cédula <span className="font-mono font-semibold text-tinta">{f.tipo}-{f.ced}</span>.
            </p>
          </div>
          {fallo && <div role="alert" className="rounded-control bg-rojo-bg px-3.5 py-3 text-sm text-rojo-osc">{fallo}</div>}
          <Campo id="r-c1" label="Contraseña" ayuda={!claveMal && 'Al menos 8 caracteres.'}>
            <input id="r-c1" type="password" autoComplete="new-password" autoFocus value={f.c1} onChange={set('c1')} aria-invalid={claveMal} aria-describedby={claveMal ? 'r-clave-err' : 'r-c1-ayuda'} className={input(claveMal)} />
          </Campo>
          <Campo id="r-c2" label="Confirmar contraseña">
            <input id="r-c2" type="password" autoComplete="new-password" value={f.c2} onChange={set('c2')} aria-invalid={claveMal} aria-describedby="r-clave-err" className={input(claveMal)} />
          </Campo>
          {claveMal && <span id="r-clave-err" role="alert" className="-mt-2 text-caption text-rojo-osc">{claveTexto}</span>}
          <span className="flex gap-2 text-caption text-texto-2">
            <MessageSquare size={16} strokeWidth={1.75} aria-hidden="true" className="mt-px flex-none" />
            Le enviaremos un código por WhatsApp al teléfono registrado para su cédula, para que nadie abra una cuenta a su nombre.
          </span>
          <Boton type="submit" disabled={enviando} aria-busy={enviando}>{enviando ? 'Enviando código…' : 'Enviar código por WhatsApp'}</Boton>
        </div>
      )}
    </form>
  )
}
