import { ChevronLeft } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { DemoError, esPagable, getMultas, getSesion, pagarMultas } from '@/lib/demo/api.ts'
import { BANCOS_DEMO } from '@/lib/demo/datos.ts'
import { TIPO } from '@/lib/etiquetas.ts'
import { TELEFONO_RE, formatBs } from '@/lib/format.ts'
import { useCarga } from '@/hooks/useCarga.ts'
import { BotonLink, Campo, SelectCedula } from '@/components/ui/index.tsx'
import { cx, input } from '@/components/ui/estilos.ts'
import { ErrorCarga, Pagina, Vacio } from '@/components/cuenta/piezas.tsx'

const RECHAZO = {
  CLAVE_C2P: ['Clave C2P inválida', 'Su banco rechazó la clave. Genere una nueva e intente otra vez; no se cobró nada.'],
  FONDOS: ['Fondos insuficientes', 'Su cuenta no tiene saldo suficiente. No se cobró nada.'],
  OTRO: ['No pudimos procesar el pago', 'Revise su conexión e intente otra vez; no se cobró nada.'],
} as const

export default function Pago() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { state } = location
  const desde = (state as { desde?: string } | null)?.desde
  const sesion = getSesion()
  const { data, error, cargando, recargar } = useCarga(getMultas, [])
  const [f, setF] = useState({ banco: '0102', tel: sesion?.telefono ?? '', tipo: (sesion?.cedula.charAt(0) === 'E' ? 'E' : 'V') as 'V' | 'E', ced: sesion?.cedula.slice(1) ?? '', clave: '' })
  const [intento, setIntento] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [rechazo, setRechazo] = useState<keyof typeof RECHAZO | null>(null)

  // Una multa (/multas/:id/pagar), varias (?multas=a,b) o todas las pendientes (/pagar, "Pagar todo").
  const pedidas = id ? [id] : params.get('multas')?.split(',').filter(Boolean)
  const multas = (data ?? []).filter((m) => esPagable(m) && (!pedidas || pedidas.includes(m.id)))
  const total = multas.reduce((t, m) => t + m.amountCents, 0)

  const telOk = TELEFONO_RE.test(f.tel)
  const cedOk = /^\d{6,9}$/.test(f.ced)
  const claveOk = /^\d{6,8}$/.test(f.clave)
  const telMal = intento && !telOk
  const cedMal = intento && !cedOk
  const claveMal = intento && !claveOk

  // key 'default' = se entró directo a esta URL: navigate(-1) sacaría de la app.
  const volver = () => (location.key !== 'default' ? navigate(-1) : navigate(id ? `/multas/${id}` : '/inicio'))

  const pagar = async (e: FormEvent) => {
    e.preventDefault()
    if (enviando) return
    setIntento(true)
    if (!telOk || !cedOk || !claveOk) return
    setEnviando(true)
    setRechazo(null)
    try {
      const ids = multas.map((m) => m.id)
      await pagarMultas(ids, { banco: f.banco, telefono: f.tel, cedula: `${f.tipo}${f.ced}`, clave: f.clave })
      const destino = ids.length === 1 ? `/multas/${ids[0]}/comprobante` : `/comprobante?multas=${ids.join(',')}`
      navigate(destino, { replace: true, state: { recien: true, telefono: f.tel, desde } })
    } catch (err) {
      const code = err instanceof DemoError ? err.code : null
      if (code === 'SESION') return
      setRechazo(code === 'CLAVE_C2P' || code === 'FONDOS' ? code : 'OTRO')
      setF((x) => ({ ...x, clave: '' }))
      setIntento(false)
      setEnviando(false)
    }
  }

  const botonPagar = (extra?: string) => (
    <button
      type="submit"
      form="pago-c2p"
      disabled={enviando}
      aria-busy={enviando}
      className={cx('relative h-12 w-full overflow-hidden rounded-control bg-primario text-base font-semibold text-sobre-primario transition-opacity duration-150', enviando ? 'cursor-progress' : 'press hover:opacity-90', extra)}
    >
      {/* Mientras el banco responde, un velo claro recorre el botón (1,2 s). */}
      {enviando && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-full origin-left animate-[llenar_1200ms_linear_both] bg-white/30 motion-reduce:animate-none" />}
      <span className="relative">{enviando ? 'Procesando pago…' : `Pagar ${formatBs(total)}`}</span>
    </button>
  )

  const atras = (
    <button type="button" onClick={volver} className="flex min-h-11 items-center gap-1.5 self-start pr-2 text-sm font-semibold">
      <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />Volver
    </button>
  )

  if (cargando) return <Pagina>{atras}<div aria-busy="true" aria-label="Cargando el pago" className="flex flex-col gap-3"><span className="sk h-40 rounded-card" /><span className="sk h-80 rounded-card" /></div></Pagina>
  if (error) return <Pagina>{atras}{error.code !== 'SESION' && <ErrorCarga titulo="No pudimos preparar el pago" texto="Revise su conexión e intente de nuevo." onReintentar={recargar} />}</Pagina>
  if (!multas.length) {
    return (
      <Pagina>
        {atras}
        <Vacio titulo="No hay nada por pagar" texto="Esta multa ya está pagada, apelada o anulada." />
        <BotonLink to="/inicio" className="self-start">Volver al inicio</BotonLink>
      </Pagina>
    )
  }

  return (
    <>
      <Pagina className="flex-1">
        {atras}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
          <div className="tinta flex flex-col gap-1 self-start rounded-card bg-tinta p-6 shadow-card lg:col-span-5 lg:col-start-8 lg:row-start-1">
            <span className="text-sm text-niebla">Total a pagar</span>
            <span className="num font-mono text-[40px] leading-[44px] font-bold text-card">{formatBs(total)}</span>
            <div className="mt-3 flex flex-col gap-2 border-t border-tinta-3 pt-3.5">
              {multas.map((m) => (
                <span key={m.id} className="flex justify-between gap-3 text-sm text-niebla">
                  <span>{TIPO[m.type]} · <span className="font-mono font-semibold">{m.plate}</span></span>
                  <span className="num font-mono">{formatBs(m.amountCents)}</span>
                </span>
              ))}
            </div>
          </div>

          <form id="pago-c2p" onSubmit={pagar} noValidate aria-labelledby="c2p-t" className="flex flex-col gap-4 lg:col-span-7 lg:col-start-1 lg:row-start-1">
            <div className="flex flex-col gap-0.5">
              <h2 id="c2p-t" className="text-h3 font-semibold">Pago Móvil C2P</h2>
              <p className="text-sm text-texto-2">Pago simulado: no se mueve dinero real.</p>
            </div>
            {rechazo && !enviando && (
              <div role="alert" className="flex flex-col gap-0.5 rounded-control bg-rojo-bg px-3.5 py-3 text-sm text-rojo-osc">
                <span className="font-semibold">{RECHAZO[rechazo][0]}</span>
                <span>{RECHAZO[rechazo][1]}</span>
              </div>
            )}
            <Campo id="p-banco" label="Banco">
              <select id="p-banco" value={f.banco} onChange={(e) => setF({ ...f, banco: e.target.value })} className={input()}>
                {BANCOS_DEMO.map((b) => <option key={b.code} value={b.code}>{b.code} · {b.name}</option>)}
              </select>
            </Campo>
            <Campo id="p-tel" label="Teléfono" error={telMal && 'Use 0412, 0414, 0416, 0424 o 0426 y 7 dígitos.'}>
              <input id="p-tel" type="tel" inputMode="numeric" autoComplete="tel" value={f.tel} onChange={(e) => setF({ ...f, tel: e.target.value.replace(/\D/g, '').slice(0, 11) })} aria-invalid={telMal} className={input(telMal, true)} />
            </Campo>
            <Campo id="p-ced" label="Cédula del titular" error={cedMal && 'Escriba los 6 a 9 dígitos de la cédula.'}>
              <div className="flex gap-2">
                <SelectCedula value={f.tipo} onChange={(tipo) => setF({ ...f, tipo })} />
                <input id="p-ced" type="text" inputMode="numeric" value={f.ced} onChange={(e) => setF({ ...f, ced: e.target.value.replace(/\D/g, '').slice(0, 9) })} aria-invalid={cedMal} className={input(cedMal, true)} />
              </div>
            </Campo>
            <Campo id="p-clave" label="Clave C2P" error={claveMal && 'La clave C2P tiene entre 6 y 8 dígitos.'} ayuda="Genere su clave C2P en la app de su banco.">
              <input
                id="p-clave"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                placeholder="6 a 8 dígitos"
                value={f.clave}
                onChange={(e) => setF({ ...f, clave: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                aria-invalid={claveMal}
                aria-describedby="p-clave-ayuda"
                className={cx(input(claveMal, true), 'tracking-[.3em] placeholder:tracking-normal')}
              />
            </Campo>
            {botonPagar('hidden lg:block')}
            <span className="text-caption text-texto-3">Prototipo: 000000 = clave inválida · 111111 = fondos insuficientes.</span>
          </form>
        </div>
      </Pagina>
      <div className="sticky bottom-0 border-t border-borde bg-card px-4 pt-3 pb-4 lg:hidden">{botonPagar()}</div>
    </>
  )
}
