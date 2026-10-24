import { CalendarDays, CircleCheck, Clock, CreditCard, Car, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { calcularEstadisticas, esPagable, getMultas, getVehiculos, type Multa } from '@/lib/demo/api.ts'
import { diaCaracas, formatBs, formatFecha, formatMes } from '@/lib/format.ts'
import { useCarga } from '@/hooks/useCarga.ts'
import { Pestanas } from '@/components/ui/index.tsx'
import { RangoFechas } from '@/components/ui/RangoFechas.tsx'
import { Selector } from '@/components/ui/Selector.tsx'
import { esDia } from '@/components/ui/calendario.ts'
import { cx } from '@/components/ui/estilos.ts'
import { ErrorCarga, ListaMultas, Vacio } from '@/components/cuenta/piezas.tsx'

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

const tarjeta = 'rounded-[18px] bg-card shadow-card'

/** Cifra: ícono sobrio, etiqueta y valor; el mismo lenguaje de tarjetas que el resumen. */
function Cifra({ label, valor, Icono, icono, grande }: { label: string; valor: string; Icono: LucideIcon; icono: string; grande?: boolean }) {
  return (
    <div className={cx(tarjeta, 'entra flex min-w-0 flex-col justify-between gap-3 p-4 lg:p-5')}>
      <span className={cx('flex size-9 items-center justify-center rounded-[10px]', icono)}><Icono size={18} strokeWidth={1.9} aria-hidden="true" /></span>
      <span className="flex flex-col gap-0.5">
        <span className="text-base text-texto-2">{label}</span>
        <span className={cx('num font-mono leading-tight font-bold whitespace-nowrap', grande ? 'text-[clamp(20px,2vw,28px)]' : 'text-[clamp(26px,2.6vw,38px)]')}>{valor}</span>
      </span>
    </div>
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
    const p = new URLSearchParams(params)
    if (d === inicioAnio) p.delete('desde')
    else p.set('desde', d)
    if (h === hoy) p.delete('hasta')
    else p.set('hasta', h)
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
  const placas = data ? [...new Set([...data[1].map((v) => v.plate), ...multas.map((m) => m.plate)])].sort() : []
  // Primer día elegible: tres años atrás o la multa más antigua, lo que llegue antes.
  const minimo = [`${Number(hoy.slice(0, 4)) - 3}-01-01`, ...multas.map((m) => diaCaracas(m.occurredAt))].sort()[0]!
  const vacioPorRango = rangoPropio && multas.some(FILTRO[tab])

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-6 lg:px-0 lg:pt-1 lg:pb-4">
      <h1 className="text-[26px] font-semibold tracking-[-0.01em] lg:text-[36px]">Multas</h1>

      {cargando && (
        <div aria-busy="true" aria-label="Cargando sus multas" className="grid grid-cols-2 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <span className="sk col-span-2 h-40 rounded-[18px] lg:col-span-1 lg:h-72" />
          <span className="sk col-span-2 h-60 rounded-[18px] lg:col-span-1 lg:h-72" />
        </div>
      )}
      {error && error.code !== 'SESION' && (
        <ErrorCarga titulo="Sin conexión" texto="No pudimos traer sus multas. Revise su conexión e intente de nuevo." onReintentar={recargar} />
      )}

      {st && (
        <section aria-label="Resumen de infracciones" className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className={cx(tarjeta, 'entra flex min-h-[170px] flex-col justify-between gap-4 p-5 lg:p-7')}>
            <span className="text-base text-texto-2">Infracciones totales</span>
            <span className="num font-mono text-[64px] leading-none font-bold lg:text-[clamp(64px,6vw,96px)]">{st.total}</span>
            {st.desde && <span className="self-start rounded-full bg-suave px-3 py-1 font-mono text-xs font-semibold text-texto-2">desde {formatFecha(st.desde)}</span>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Cifra label="Por pagar" valor={String(st.porPagar)} Icono={Clock} icono="bg-rojo-bg text-rojo-osc" />
            <Cifra label="Pagadas" valor={String(st.pagadas)} Icono={CircleCheck} icono="bg-verde-bg text-verde-osc" />
            <Cifra label="Monto pagado" valor={formatBs(st.montoPagadoCents)} Icono={CreditCard} icono="bg-suave text-tinta" grande />
            <Cifra label="Días sin infracciones" valor={st.diasSinInfracciones == null ? '—' : String(st.diasSinInfracciones)} Icono={CalendarDays} icono="bg-suave text-tinta" />
          </div>
        </section>
      )}

      {data && (
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="w-full lg:w-[400px]">
            <Pestanas
              etiqueta="Estado"
              valor={tab}
              onCambio={(t) => cambiar('tab', t === 'por-pagar' ? null : t)}
              opciones={(['por-pagar', 'pagadas', 'otras'] as const).map((id) => ({ id, nombre: { 'por-pagar': 'Por pagar', pagadas: 'Pagadas', otras: 'Otras' }[id], n: enRango.filter(FILTRO[id]).length }))}
            />
          </div>
          <RangoFechas className="w-full lg:w-[330px]" desde={desde} hasta={hasta} min={minimo} max={hoy} onCambio={cambiarRango} />
          {placas.length > 0 && (
            <Selector
              className="w-full lg:w-[230px]"
              etiqueta="Placa"
              Icono={Car}
              valor={placa ?? ''}
              onCambio={(v) => cambiar('placa', v || null)}
              opciones={[{ valor: '', etiqueta: 'Todas las placas' }, ...placas.map((p) => ({ valor: p, etiqueta: p, mono: true }))]}
            />
          )}
        </div>
      )}

      {data && (grupos.size === 0 ? (
        <Vacio
          icono={vacioPorRango ? <span className="flex size-12 items-center justify-center rounded-control bg-suave text-texto-2"><CalendarDays size={22} strokeWidth={1.75} aria-hidden="true" /></span> : undefined}
          titulo={vacioPorRango ? 'Nada en este rango' : VACIO[tab][0]}
          texto={vacioPorRango ? 'Pruebe con otras fechas o con «Todo» en el selector de fechas.' : tab === 'por-pagar' ? `${VACIO[tab][1]}${placa ? ` para ${placa}` : ''}. Siga así.` : VACIO[tab][1]}
        />
      ) : (
        [...grupos].map(([mes, lista]) => (
          <section key={mes} aria-label={mes} className="flex flex-col gap-2">
            <h2 className="sticky top-0 z-10 bg-fondo px-1 py-2 text-caption font-semibold text-texto-2">{mes}</h2>
            <ListaMultas multas={lista} desde="multas" />
          </section>
        ))
      ))}
    </div>
  )
}
