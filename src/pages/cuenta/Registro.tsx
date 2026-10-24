import { MessageSquare } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { DemoError, USA_API_REAL, getSesion, solicitarCodigo } from '@/lib/demo/api.ts'
import { TELEFONO_RE } from '@/lib/format.ts'
import { Boton, Campo, SelectCedula } from '@/components/ui/index.tsx'
import { enlace, input } from '@/components/ui/estilos.ts'
import { Pasos } from '@/components/cuenta/AuthLayout.tsx'
import { display } from '@/components/cuenta/piezas.tsx'

export default function Registro() {
  const navigate = useNavigate()
  const [f, setF] = useState({ tipo: 'V' as 'V' | 'E', ced: '', tel: '', correo: '', c1: '', c2: '' })
  const [intento, setIntento] = useState(false)
  const [yaRegistrada, setYaRegistrada] = useState(false)
  const [enviando, setEnviando] = useState(false)

  if (getSesion()) return <Navigate to="/inicio" replace />

  const set = (k: keyof typeof f, digitos?: number) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: digitos ? e.target.value.replace(/\D/g, '').slice(0, digitos) : e.target.value }))

  const cedMal = intento && !/^\d{6,9}$/.test(f.ced)
  const telMal = intento && !TELEFONO_RE.test(f.tel)
  const claveTexto = f.c1.length < 8 ? 'La contraseña debe tener al menos 8 caracteres.' : f.c1 !== f.c2 ? 'Las contraseñas no coinciden.' : ''
  const claveMal = intento && !!claveTexto

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setIntento(true)
    if (enviando || !/^\d{6,9}$/.test(f.ced) || !TELEFONO_RE.test(f.tel) || claveTexto) return
    setEnviando(true)
    try {
      await solicitarCodigo({ cedula: `${f.tipo}${f.ced}`, telefono: f.tel, correo: f.correo.trim() || null, clave: f.c1 })
      navigate('/registro/codigo')
    } catch (err) {
      setYaRegistrada(err instanceof DemoError && err.code === 'YA_REGISTRADA')
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
      <Pasos actual={1} />
      <div className="flex flex-col gap-1.5">
        <h1 className={display}>Crear cuenta</h1>
        <p className="text-texto-2">Vea y pague sus multas con su cédula.</p>
      </div>
      {yaRegistrada && (
        <div role="alert" className="flex flex-col gap-1 rounded-control bg-rojo-bg px-3.5 py-3 text-sm text-rojo-osc">
          <span className="font-semibold">Esta cédula ya tiene una cuenta.</span>
          <span>Entre con su contraseña o recupérela desde «¿Olvidó su contraseña?».</span>
          <Link to="/ingresar" className="inline-flex min-h-11 items-center self-start font-semibold underline">Ir a Entrar</Link>
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
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-2 gap-2">
          <Campo id="r-c1" label="Contraseña">
            <input id="r-c1" type="password" autoComplete="new-password" value={f.c1} onChange={set('c1')} aria-invalid={claveMal} aria-describedby="r-clave-err" className={input(claveMal)} />
          </Campo>
          <Campo id="r-c2" label="Confirmar">
            <input id="r-c2" type="password" autoComplete="new-password" value={f.c2} onChange={set('c2')} aria-invalid={claveMal} aria-describedby="r-clave-err" className={input(claveMal)} />
          </Campo>
        </div>
        {claveMal && <span id="r-clave-err" className="text-caption text-rojo-osc">{claveTexto}</span>}
      </div>
      <span className="flex gap-2 text-caption text-texto-2">
        <MessageSquare size={16} strokeWidth={1.75} aria-hidden="true" className="mt-px flex-none" />
        El código llega por WhatsApp al teléfono que el sistema tiene registrado para su cédula, para que nadie abra una cuenta a su nombre.
      </span>
      <Boton type="submit" disabled={enviando} aria-busy={enviando}>{enviando ? 'Enviando código…' : 'Enviar código por WhatsApp'}</Boton>
      <div className="flex items-center justify-center gap-1.5 text-sm text-texto-2">
        ¿Ya tiene cuenta?<Link to="/ingresar" className={enlace}>Entrar</Link>
      </div>
      {!USA_API_REAL && <span className="text-center text-caption text-texto-3">Prototipo: la cédula 12345678 ya tiene cuenta; una cédula distinta de 99000001 crea una cuenta sin vehículos.</span>}
    </form>
  )
}
