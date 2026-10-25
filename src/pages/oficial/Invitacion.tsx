import { Eye, EyeOff, Link2Off } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { DemoError } from '@/lib/demo/api.ts'
import {
  CLAVE_OFICIAL_MIN, INVITACION_DEMO, USA_AUTH_REAL, aceptarInvitacion, telefonoValido, verificarInvitacion, type Invitacion,
} from '@/lib/oficial/api.ts'
import { formatFecha, formatHora } from '@/lib/format.ts'
import { useCarga } from '@/hooks/useCarga.ts'
import { Boton, BotonLink, Campo } from '@/components/ui/index.tsx'
import { cx, input } from '@/components/ui/estilos.ts'
import { ErrorCarga, display } from '@/components/cuenta/piezas.tsx'

export default function InvitacionOficial() {
  const token = useSearchParams()[0].get('token') ?? ''
  const { data, error, cargando, recargar } = useCarga(() => verificarInvitacion(token), [token])

  return (
    <>
      {/* El token va en la URL: que no salga como Referer hacia ningún lado. */}
      <meta name="referrer" content="no-referrer" />
      {cargando ? (
        <div aria-busy="true" aria-label="Revisando la invitación" className="flex flex-col gap-4">
          <span className="sk h-9 w-3/4 rounded-control" />
          <span className="sk h-5 w-1/2 rounded-control" />
          <span className="sk h-12 rounded-control" />
          <span className="sk h-12 rounded-control" />
          <span className="sk h-12 rounded-control" />
        </div>
      ) : error?.code === 'NO_ENCONTRADA' || !token ? (
        <Invalida />
      ) : error || !data ? (
        <ErrorCarga titulo="No pudimos revisar la invitación" texto="Revise su conexión e intente de nuevo." onReintentar={recargar} />
      ) : (
        <Formulario token={token} inv={data} />
      )}
    </>
  )
}

/** Igual para vencida, usada o revocada: el servidor tampoco las distingue. */
function Invalida() {
  return (
    <div role="alert" className="flex flex-col items-start gap-4">
      <span className="flex size-12 items-center justify-center rounded-control bg-rojo-bg text-rojo-osc">
        <Link2Off size={22} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <h1 className={display}>Esta invitación no es válida o ya venció</h1>
      <p className="text-texto-2">Pida al administrador una invitación nueva. Si ya creó su cuenta, entre con su correo.</p>
      <BotonLink to="/oficial/ingresar" variante="outline" className="w-full">Ir a Acceso policial</BotonLink>
      {!USA_AUTH_REAL && <span className="text-caption text-texto-3">Prototipo: abra /oficial/invitacion?token={INVITACION_DEMO}.</span>}
    </div>
  )
}

/** Medidor simple: largo y variedad de caracteres. */
function fuerza(c: string): 0 | 1 | 2 | 3 {
  if (c.length < CLAVE_OFICIAL_MIN) return c ? 1 : 0
  const variedad = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(c)).length
  return c.length >= 14 && variedad >= 3 ? 3 : variedad >= 2 ? 2 : 1
}
const FUERZA = ['', 'Débil', 'Aceptable', 'Fuerte'] as const
const COLOR = ['bg-borde', 'bg-rojo', 'bg-ambar', 'bg-verde'] as const

function Formulario({ token, inv }: { token: string; inv: Invitacion }) {
  const navigate = useNavigate()
  const [f, setF] = useState({ nombre: inv.name, tel: '', c1: '', c2: '' })
  const [ver, setVer] = useState(false)
  const [intento, setIntento] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [invalida, setInvalida] = useState(false)
  const [fallo, setFallo] = useState<{ red: boolean; texto: string } | null>(null)

  if (invalida) return <Invalida />

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  const errores = {
    nombre: f.nombre.trim().length < 2 ? 'Escriba su nombre (al menos 2 letras).' : '',
    tel: telefonoValido(f.tel) ? '' : 'Use 0412, 0414, 0416, 0424 o 0426 y 7 dígitos.',
    c1: f.c1.length < CLAVE_OFICIAL_MIN ? `Use al menos ${CLAVE_OFICIAL_MIN} caracteres.` : '',
    c2: f.c1 !== f.c2 ? 'Las contraseñas no coinciden.' : '',
  }
  const mal = (k: keyof typeof errores) => intento && !!errores[k]
  const nivel = fuerza(f.c1)

  const enviar = async (e?: FormEvent) => {
    e?.preventDefault()
    setIntento(true)
    if (enviando || Object.values(errores).some(Boolean)) return
    setEnviando(true)
    setFallo(null)
    try {
      const s = await aceptarInvitacion({ token, name: f.nombre, phone: f.tel, password: f.c1 })
      // `replace`: el enlace con el token no queda en el historial.
      navigate('/oficial/multas', { replace: true, state: { bienvenida: s.badge } })
    } catch (err) {
      const code = err instanceof DemoError ? err.code : 'RED'
      if (code === 'NO_ENCONTRADA') return setInvalida(true)
      setFallo(
        code === 'VALIDACION' && err instanceof DemoError ? { red: false, texto: err.message }
          : code === 'LIMITE' ? { red: false, texto: 'Demasiados intentos, espere unos minutos.' }
            : { red: true, texto: 'No pudimos conectar. Revise su conexión e intente de nuevo.' },
      )
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className={display}>Invitación para {inv.name}</h1>
        <p className="text-texto-2">
          Cree su cuenta de policía. La invitación vence el {formatFecha(inv.expiresAt)} a las {formatHora(inv.expiresAt)} (hora de Caracas).
        </p>
      </div>
      {fallo && (
        <div role="alert" className="flex flex-col gap-2 rounded-control bg-rojo-bg px-3.5 py-3 text-sm text-rojo-osc">
          <span>{fallo.texto}</span>
          {fallo.red && <Boton type="submit" variante="outline" disabled={enviando} className="self-start">Reintentar</Boton>}
        </div>
      )}
      <Campo id="i-correo" label="Correo">
        <input id="i-correo" type="email" autoComplete="username" value={inv.email} readOnly aria-readonly="true" className={cx(input(), 'bg-suave text-texto-2')} />
      </Campo>
      <Campo id="i-nombre" label="Nombre" error={mal('nombre') && errores.nombre}>
        <input id="i-nombre" type="text" autoComplete="name" value={f.nombre} onChange={set('nombre')} maxLength={120} aria-invalid={mal('nombre')} aria-describedby={mal('nombre') ? 'i-nombre-err' : undefined} className={input(mal('nombre'))} />
      </Campo>
      <Campo id="i-tel" label="Teléfono" error={mal('tel') && errores.tel}>
        <input id="i-tel" type="tel" inputMode="tel" autoComplete="tel" placeholder="0412-123 4567" value={f.tel} onChange={set('tel')} maxLength={20} aria-invalid={mal('tel')} aria-describedby={mal('tel') ? 'i-tel-err' : undefined} className={input(mal('tel'), true)} />
      </Campo>
      <Campo id="i-c1" label="Contraseña" error={mal('c1') && errores.c1}>
        <div className="relative">
          <input id="i-c1" type={ver ? 'text' : 'password'} autoComplete="new-password" value={f.c1} onChange={set('c1')} aria-invalid={mal('c1')} aria-describedby={cx('i-c1-fuerza', mal('c1') && 'i-c1-err')} className={cx(input(mal('c1')), 'pr-12')} />
          <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={ver} className="absolute top-0 right-0 flex size-12 items-center justify-center text-texto-2 hover:text-tinta">
            {ver ? <EyeOff size={20} strokeWidth={1.75} aria-hidden="true" /> : <Eye size={20} strokeWidth={1.75} aria-hidden="true" />}
          </button>
        </div>
        <div id="i-c1-fuerza" className="flex items-center gap-2 text-caption text-texto-2" aria-live="polite">
          <span aria-hidden="true" className="grid flex-1 grid-cols-3 gap-1">
            {[1, 2, 3].map((n) => <span key={n} className={cx('h-1 rounded-sm', nivel >= n ? COLOR[nivel] : 'bg-borde')} />)}
          </span>
          <span className="w-20 text-right">{nivel ? FUERZA[nivel] : `Mín. ${CLAVE_OFICIAL_MIN}`}</span>
        </div>
      </Campo>
      <Campo id="i-c2" label="Confirmar contraseña" error={mal('c2') && errores.c2}>
        <input id="i-c2" type={ver ? 'text' : 'password'} autoComplete="new-password" value={f.c2} onChange={set('c2')} aria-invalid={mal('c2')} aria-describedby={mal('c2') ? 'i-c2-err' : undefined} className={input(mal('c2'))} />
      </Campo>
      <Boton type="submit" disabled={enviando} aria-busy={enviando}>{enviando ? 'Creando su cuenta…' : 'Crear mi cuenta'}</Boton>
      {!USA_AUTH_REAL && <span className="text-center text-caption text-texto-3">Prototipo: no se crea ninguna cuenta real.</span>}
    </form>
  )
}
