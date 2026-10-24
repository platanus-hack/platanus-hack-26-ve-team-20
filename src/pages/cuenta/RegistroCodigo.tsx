import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { DemoError, USA_API_REAL, getRegistroPendiente, reenviarCodigo, verificarCodigo, type Vehiculo } from '@/lib/demo/api.ts'
import { formatCedula, maskTelefono } from '@/lib/format.ts'
import { Boton } from '@/components/ui/index.tsx'
import { cx } from '@/components/ui/estilos.ts'
import { Pasos } from '@/components/cuenta/AuthLayout.tsx'
import { display } from '@/components/cuenta/piezas.tsx'

const ESPERA_S = 45

export default function RegistroCodigo() {
  const navigate = useNavigate()
  const [registro] = useState(getRegistroPendiente)
  const [cod, setCod] = useState('')
  const [error, setError] = useState<'invalido' | 'vencido' | null>(null)
  const [espera, setEspera] = useState(ESPERA_S)
  const [enviando, setEnviando] = useState(false)
  const [creada, setCreada] = useState<Vehiculo[] | null>(null)

  useEffect(() => {
    if (espera <= 0) return
    const t = setTimeout(() => setEspera((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [espera])

  if (!registro) return <Navigate to="/registro" replace />

  if (creada) {
    return (
      <div className="flex flex-col gap-5">
        <Pasos actual={3} />
        <span className="tinta flex size-[72px] items-center justify-center rounded-full bg-tinta">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#C6F24E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path className="check" d="M20 6 9 17l-5-5" /></svg>
        </span>
        <div className="flex flex-col gap-2">
          <h1 className={display}>Cuenta creada</h1>
          <p className="text-texto-2">
            {creada.length
              ? `Encontramos ${creada.length} vehículos a su nombre. Ya puede ver sus multas y pagarlas.`
              : 'No encontramos vehículos a su nombre. Su cuenta queda lista igual y le avisaremos si aparece alguno.'}
          </p>
        </div>
        {creada.length > 0 && (
          <div className="flex gap-2">
            {creada.map((v) => <span key={v.plate} className="inline-flex h-[30px] items-center rounded-placa border-2 border-tinta px-2 font-mono font-bold">{v.plate}</span>)}
          </div>
        )}
        <Boton onClick={() => navigate('/inicio', { replace: true })} autoFocus>Ir al inicio</Boton>
      </div>
    )
  }

  const verificar = async (e: FormEvent) => {
    e.preventDefault()
    if (enviando) return
    setEnviando(true)
    try {
      setCreada((await verificarCodigo(cod)).vehiculos)
    } catch (err) {
      setError(err instanceof DemoError && err.code === 'CODIGO_VENCIDO' ? 'vencido' : 'invalido')
      setEnviando(false)
    }
  }

  const reenviar = async () => {
    try { await reenviarCodigo() } catch { return }
    setEspera(ESPERA_S)
    setError(null)
    setCod('')
  }

  return (
    <form onSubmit={verificar} noValidate className="flex flex-col gap-5">
      <Pasos actual={2} />
      <div className="flex flex-col gap-1.5">
        <h1 className={display}>Revise su WhatsApp</h1>
        <p className="text-texto-2">
          Enviamos un código de 6 dígitos al <span className="font-mono font-bold whitespace-nowrap text-tinta">{maskTelefono(registro.telefono)}</span>, el teléfono registrado para{' '}
          <span className="font-mono font-bold whitespace-nowrap text-tinta">{formatCedula(registro.cedula)}</span>.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="r-cod" className="text-sm font-semibold">Código</label>
        <input
          id="r-cod"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          autoFocus
          value={cod}
          onChange={(e) => setCod(e.target.value.replace(/\D/g, '').slice(0, 6))}
          aria-invalid={!!error}
          aria-describedby={error ? 'r-cod-err' : undefined}
          className={cx('h-16 w-full rounded-control bg-card px-3.5 text-center font-mono text-[32px] font-bold tracking-[.45em] placeholder:text-borde', error ? 'border-[1.5px] border-rojo' : 'border border-input')}
        />
        {error && (
          <span id="r-cod-err" role="alert" className="text-caption text-rojo-osc">
            {error === 'vencido' ? 'El código venció. Pida uno nuevo con «Reenviar código».' : 'Código inválido. Revise el mensaje e intente de nuevo.'}
          </span>
        )}
      </div>
      <Boton type="submit" disabled={enviando || cod.length !== 6} aria-busy={enviando}>{enviando ? 'Verificando…' : 'Verificar'}</Boton>
      <div className="flex items-center justify-center gap-1.5 text-sm text-texto-2">
        ¿No le llegó?
        <button type="button" onClick={reenviar} disabled={espera > 0} className={cx('min-h-11 px-1 text-sm font-semibold', espera > 0 ? 'text-texto-3' : 'text-azul')}>
          {espera > 0 ? `Reenviar en 0:${String(espera).padStart(2, '0')}` : 'Reenviar código'}
        </button>
      </div>
      {!USA_API_REAL && <span className="text-center text-caption text-texto-3">Prototipo: 123456 es válido; 000000 simula un código vencido y cualquier otro, uno inválido.</span>}
    </form>
  )
}
