import { CalendarDays, CircleCheck, Clock, CreditCard, X, type LucideIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { calcularEstadisticas, esPagable, getMultas, getVehiculos, type Multa } from '@/lib/demo/api.ts'
import { diaCaracas, formatBs, formatFecha, formatMes } from '@/lib/format.ts'
import { useCarga } from '@/hooks/useCarga.ts'
import { Pestanas } from '@/components/ui/index.tsx'
import { cx } from '@/components/ui/estilos.ts'
import { ErrorCarga, ListaMultas, Pagina, Titulo, Vacio } from '@/components/cuenta/piezas.tsx'

type Tab = 'por-pagar' | 'pagadas' | 'otras'
const FILTRO: Record<Tab, (m: Multa) => boolean> = {
  'por-pagar': esPagable,
  pagadas: (m) => m.status === 'PAID',
  otras: (m) => m.status === 'APPEALED' || m.status === 'VOID',
}
const VACIO: Record<Tab, [string, string]> = {
  'por-pagar': ['Está al día', 'No tiene multas por pagar'],
  pagadas: ['Aún no hay pagos', 'Cuando pague una multa, su comprobante aparecerá aquí.'],
  otras: ['Nada por aquí', 'No tiene multas apeladas ni anuladas.'],
}

const FECHA_CORTA = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
/** `2026-01-01` → `1 Ene 2026`. */
function fechaCorta(dia: string) {
  const [d = '', m = '', ...resto] = FECHA_CORTA.format(new Date(`${dia}T12:00:00Z`)).replace(/\./g, '').split(' ')
  return [d, m.charAt(0).toUpperCase() + m.slice(1), ...resto.filter((x) => x !== 'de')].join(' ')
}
const esDia = (v: string | null): v is string => v != null && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Tarjeta de cifra: ícono, etiqueta y valor sobre un degradado sutil del color de su significado. */
function Cifra({ label, valor, Icono, fondo, icono, grande }: { label: string; valor: string; Icono: LucideIcon; fondo: string; icono: string; grande?: boolean }) {
  return (
    <div className={cx('relative flex min-w-0 flex-col justify-between gap-3 overflow-hidden rounded-[18px] border border-borde bg-gradient-to-br from-card p-4 shadow-card lg:col-span-4 lg:p-5', fondo)}>
      <span className={cx('flex size-9 items-center justify-center rounded-[10px]', icono)}><Icono size={18} strokeWidth={1.9} aria-hidden="true" /></span>
      <span className="flex flex-col gap-0.5">
        <span className="text-caption text-texto-2">{label}</span>
        <span className={cx('num font-mono leading-tight font-bold', grande ? 'text-[19px] lg:text-[24px]' : 'text-[26px] lg:text-[30px]')}>{valor}</span>
      </span>
    </div>
  )
}

/** Un extremo del rango: botón con la fecha legible que abre el selector nativo (el `input` va oculto, no `display:none`). */
function Fecha({ dia, etiqueta, min, max, onCambio }: { dia: string; etiqueta: string; min?: string; max?: string; onCambio: (d: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <span className="relative inline-flex">
      <button type="button" aria-label={`${etiqueta}: ${fechaCorta(dia)}. Cambiar`} onClick={() => { try { ref.current?.showPicker() } catch { ref.current?.focus() } }} className="press min-h-10 rounded-full px-2 font-semibold whitespace-nowrap hover:text-tinta">
        {fechaCorta(dia)}
      </button>
      <input
        ref={ref}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={dia}
        min={min}
        max={max}
        onChange={(e) => esDia(e.target.value) && onCambio(e.target.value)}
        className="pointer-events-none absolute inset-0 size-full opacity-0"
      />
    </span>
  )
}

export default function Multas() {
  // Pestaña, rango de fechas y placa en la URL: "Ver sus multas" desde Vehículos llega ya filtrado.
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'pagadas' ? 'pagadas' : params.get('tab') === 'otras' ? 'otras' : 'por-pagar'
  const placa = params.get('placa')
  const [hoy] = useState(() => diaCaracas(new Date()))
  const inicioAnio = `${hoy.slice(0, 4)}-01-01`
  const desdeP = params.get('desde')
  const hastaP = params.get('hasta')
  const desde = esDia(desdeP) ? desdeP : inicioAnio
  const hasta = esDia(hastaP) ? hastaP : hoy
  const rangoPropio = desde !== inicioAnio || hasta !== hoy

  const { data, error, cargando, recargar } = useCarga(() => Promise.all([getMultas(), getVehiculos()]), [])
  const cambiar = (k: string, v: string | null) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    setParams(p, { replace: true })
  }
  const cambiarRango = (d: string, h: string) => {
    const [a, b] = d <= h ? [d, h] : [h, d] // si cruzan los extremos, se ordenan
    const p = new URLSearchParams(params)
    if (a === inicioAnio) p.delete('desde')
    else p.set('desde', a)
    if (b === hoy) p.delete('hasta')
    else p.set('hasta', b)
    setParams(p, { replace: true })
  }

  const multas = data?.[0] ?? []
  const st = data && calcularEstadisticas(multas)
  // Lo que pasa los filtros de fecha y placa; las pestañas cuentan sobre esto para que los números coincidan con la lista.
  const enRango = multas.filter((m) => {
    const dia = diaCaracas(m.occurredAt)
    return dia >= desde && dia <= hasta && (!placa || m.plate === placa)
  })
  const filtradas = enRango.filter(FILTRO[tab])
  const grupos = new Map<string, Multa[]>()
  for (const m of filtradas) grupos.set(formatMes(m.occurredAt), [...(grupos.get(formatMes(m.occurredAt)) ?? []), m])
  const placas = data ? [...new Set([...data[1].map((v) => v.plate), ...multas.map((m) => m.plate)])] : []

  return (
    <Pagina>
      <Titulo>Multas</Titulo>

      {cargando && (
        <div aria-busy="true" aria-label="Cargando sus multas" className="grid grid-cols-2 gap-3 lg:grid-cols-12 lg:gap-4">
          <span className="sk col-span-2 h-40 rounded-[18px] lg:col-span-4 lg:row-span-2 lg:h-auto" />
          {[0, 1, 2, 3].map((i) => <span key={i} className="sk h-28 rounded-[18px] lg:col-span-4" />)}
        </div>
      )}
      {error && error.code !== 'SESION' && (
        <ErrorCarga titulo="Sin conexión" texto="No pudimos traer sus multas. Revise su conexión e intente de nuevo." onReintentar={recargar} />
      )}

      {st && (
        <section aria-label="Resumen de infracciones" className="grid grid-cols-2 gap-3 lg:grid-cols-12 lg:gap-4">
          <div className="relative col-span-2 flex flex-col justify-between gap-4 overflow-hidden rounded-[22px] border border-brand/70 bg-gradient-to-br from-card to-card p-5 shadow-[0_0_36px_-8px_rgba(198,242,78,0.45)] lg:col-span-4 lg:row-span-2 lg:p-7">
            <span aria-hidden="true" className="pointer-events-none absolute -top-16 -left-10 size-48 rounded-full bg-brand/15 blur-3xl" />
            <span className="relative text-sm text-texto-2 lg:text-base">Infracciones totales</span>
            <span className="num relative font-mono text-[64px] leading-none font-bold lg:text-[88px]">{st.total}</span>
            {st.desde && <span className="relative self-start rounded-full bg-brand px-3 py-1 font-mono text-xs font-bold text-[#0e1726]">desde {formatFecha(st.desde)}</span>}
          </div>
          <Cifra label="Por pagar" valor={String(st.porPagar)} Icono={Clock} fondo="to-rojo-bg" icono="bg-rojo-bg text-rojo-osc" />
          <Cifra label="Pagadas" valor={String(st.pagadas)} Icono={CircleCheck} fondo="to-verde-bg" icono="bg-verde-bg text-verde-osc" />
          <Cifra label="Monto pagado" valor={formatBs(st.montoPagadoCents)} Icono={CreditCard} fondo="to-suave" icono="bg-suave text-tinta" grande />
          <Cifra label="Días sin infracciones" valor={st.diasSinInfracciones == null ? '—' : String(st.diasSinInfracciones)} Icono={CalendarDays} fondo="to-verde-bg" icono="bg-verde-bg text-verde-osc" />
        </section>
      )}

      {data && (
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-4">
          <div className="w-full lg:w-[400px]">
          <Pestanas
            etiqueta="Estado"
            valor={tab}
            onCambio={(t) => cambiar('tab', t === 'por-pagar' ? null : t)}
            opciones={(['por-pagar', 'pagadas', 'otras'] as const).map((id) => ({ id, nombre: { 'por-pagar': 'Por pagar', pagadas: 'Pagadas', otras: 'Otras' }[id], n: enRango.filter(FILTRO[id]).length }))}
          />
          </div>

          <div role="group" aria-label="Rango de fechas" className="flex h-12 w-fit items-center gap-1 rounded-full border border-borde bg-suave pr-2 pl-4 text-sm text-texto-2">
            <CalendarDays size={18} strokeWidth={1.9} aria-hidden="true" className="mr-1 flex-none" />
            <Fecha dia={desde} etiqueta="Desde" max={hasta} onCambio={(d) => cambiarRango(d, hasta)} />
            <span aria-hidden="true">–</span>
            <Fecha dia={hasta} etiqueta="Hasta" min={desde} max={hoy} onCambio={(h) => cambiarRango(desde, h)} />
            {rangoPropio && (
              <button type="button" onClick={() => cambiarRango(inicioAnio, hoy)} aria-label="Restablecer el rango de fechas" className="press flex size-8 flex-none items-center justify-center rounded-full hover:bg-borde hover:text-tinta">
                <X size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>

          {placas.length > 0 && (
            <div role="group" aria-label="Filtrar por vehículo" className="flex flex-wrap gap-2 lg:border-l lg:border-borde lg:pl-4">
              {[null, ...placas].map((p) => (
                <button
                  key={p ?? 'todos'}
                  type="button"
                  aria-pressed={placa === p}
                  onClick={() => cambiar('placa', p)}
                  className={cx(
                    'press h-10 rounded-full border px-3.5 transition-colors duration-150',
                    p ? 'font-mono text-[13px] font-bold' : 'text-sm font-semibold',
                    placa === p ? 'border-tinta bg-card text-tinta' : 'border-borde bg-suave text-texto-2 hover:text-tinta',
                  )}
                >
                  {p ?? 'Todos'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {data && (grupos.size === 0 ? (
        <Vacio
          titulo={rangoPropio && multas.some(FILTRO[tab]) ? 'Nada en este rango' : VACIO[tab][0]}
          texto={rangoPropio && multas.some(FILTRO[tab]) ? 'Pruebe con otras fechas o restablezca el rango.' : tab === 'por-pagar' ? `${VACIO[tab][1]}${placa ? ` para ${placa}` : ''}. Siga así.` : VACIO[tab][1]}
        />
      ) : (
        [...grupos].map(([mes, lista]) => (
          <section key={mes} aria-label={mes} className="flex flex-col gap-2">
            <h2 className="sticky top-0 z-10 bg-fondo px-1 py-2 text-caption font-semibold text-texto-2">{mes}</h2>
            <ListaMultas multas={lista} desde="multas" />
          </section>
        ))
      ))}
    </Pagina>
  )
}
