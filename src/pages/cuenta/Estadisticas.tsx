import { Award, CalendarDays, CircleCheck, Clock, CreditCard, type LucideIcon } from 'lucide-react'
import { calcularEstadisticas, getMultas } from '@/lib/demo/api.ts'
import { TIPO } from '@/lib/etiquetas.ts'
import { formatBs, formatFecha, formatMesCorto } from '@/lib/format.ts'
import { useCarga } from '@/hooks/useCarga.ts'
import { cx, tarjeta } from '@/components/ui/estilos.ts'
import { Celebra, ErrorCarga, Pagina, Titulo } from '@/components/cuenta/piezas.tsx'

function Tile({ label, valor, Icono, cls, className }: { label: string; valor: string; Icono: LucideIcon; cls: string; className?: string }) {
  return (
    <div className={cx(tarjeta, 'flex flex-col gap-1 p-4', className)}>
      <span className={cx('flex size-9 items-center justify-center rounded-[10px]', cls)}><Icono size={18} strokeWidth={1.75} aria-hidden="true" /></span>
      <span className="text-caption text-texto-2">{label}</span>
      <span className="num font-mono text-[22px] leading-7 font-bold">{valor}</span>
    </div>
  )
}

function Barra({ nombre, n, max, mono, tinta }: { nombre: string; n: number; max: number; mono?: boolean; tinta?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm"><span className={mono ? 'font-mono font-bold' : undefined}>{nombre}</span><span className="font-mono font-bold">{n}</span></div>
      <span className="block h-2 overflow-hidden rounded-full bg-suave">
        <span className={cx('block h-full rounded-full', tinta ? 'bg-tinta' : 'bg-input')} style={{ width: `${Math.round((n / max) * 100)}%` }} />
      </span>
    </div>
  )
}

export default function Estadisticas() {
  const { data, error, cargando, recargar } = useCarga(getMultas, [])
  const st = data && calcularEstadisticas(data)
  const maxMes = Math.max(1, ...(st?.porMes.map((m) => m.n) ?? []))
  const maxTipo = Math.max(1, ...(st?.porTipo.map((t) => t.n) ?? []))
  const maxVeh = Math.max(1, ...(st?.porVehiculo.map((v) => v.n) ?? []))

  return (
    <Pagina>
      <Titulo>Estadísticas</Titulo>
      {cargando && <div aria-busy="true" aria-label="Cargando estadísticas" className="grid grid-cols-2 gap-3 lg:grid-cols-4"><span className="sk col-span-2 h-40 rounded-card lg:row-span-2 lg:h-auto" /><span className="sk h-28 rounded-card" /><span className="sk h-28 rounded-card" /><span className="sk h-28 rounded-card" /><span className="sk h-28 rounded-card" /></div>}
      {error && error.code !== 'SESION' && <ErrorCarga titulo="No pudimos cargar sus estadísticas" texto="Revise su conexión e intente de nuevo." onReintentar={recargar} />}

      {st && st.total === 0 && (
        <>
          <Celebra titulo="Ninguna infracción" icono={<Award size={34} strokeWidth={2} aria-hidden="true" />}>
            <span className="text-niebla">Su historial está limpio. Cuando haya actividad, aquí verá sus tendencias por mes, tipo y vehículo.</span>
          </Celebra>
          <div className="grid grid-cols-2 gap-3">
            <div className={cx(tarjeta, 'flex flex-col gap-1 p-4')}><span className="text-caption text-texto-2">Días sin infracciones</span><span className="font-mono text-[22px] font-bold">Desde el registro</span></div>
            <div className={cx(tarjeta, 'flex flex-col gap-1 p-4')}><span className="text-caption text-texto-2">Por pagar</span><span className="num font-mono text-[22px] font-bold">{formatBs(0)}</span></div>
          </div>
        </>
      )}

      {st && st.total > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-12 lg:gap-4">
            <div className="tinta col-span-2 flex flex-col gap-2 rounded-card bg-tinta p-6 lg:col-span-4 lg:row-span-2">
              <span className="text-sm text-niebla">Infracciones totales</span>
              <span className="num font-mono text-[56px] leading-[60px] font-bold text-card">{st.total}</span>
              {st.desde && <span className="inline-flex h-[26px] items-center self-start rounded-full bg-brand px-2.5 text-caption font-semibold text-tinta">desde {formatFecha(st.desde)}</span>}
            </div>
            <Tile className="lg:col-span-4" label="Por pagar" valor={String(st.porPagar)} Icono={Clock} cls="bg-rojo-bg text-rojo-osc" />
            <Tile className="lg:col-span-4" label="Pagadas" valor={String(st.pagadas)} Icono={CircleCheck} cls="bg-verde-bg text-verde-osc" />
            <Tile className="lg:col-span-4" label="Monto pagado" valor={formatBs(st.montoPagadoCents)} Icono={CreditCard} cls="bg-suave text-tinta" />
            <Tile className="lg:col-span-4" label="Días sin infracciones" valor={String(st.diasSinInfracciones ?? 0)} Icono={CalendarDays} cls="bg-suave text-tinta" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <section aria-labelledby="mes-t" className={cx(tarjeta, 'flex flex-col gap-3 p-5')}>
              <h2 id="mes-t" className="text-h3 font-semibold">Infracciones por mes</h2>
              <div role="img" aria-label={`Infracciones por mes: ${st.porMes.map((m) => `${formatMesCorto(m.mes)} ${m.n}`).join(', ')}`} className="grid h-40 grid-cols-8 items-end gap-2.5">
                {st.porMes.map((m, i) => (
                  <span
                    key={m.mes}
                    className={cx('block', m.n ? 'rounded-t-lg rounded-b-[3px]' : 'h-1 rounded-sm bg-borde', m.n > 0 && (i === 7 ? 'bg-tinta' : 'bg-input'))}
                    style={m.n ? { height: `${Math.round((m.n / maxMes) * 90)}%` } : undefined}
                  />
                ))}
              </div>
              <div aria-hidden="true" className="grid grid-cols-8 gap-2.5 text-center text-caption">
                {st.porMes.map((m, i) => <span key={m.mes} className={i === 7 ? 'font-semibold text-tinta' : 'text-texto-2'}>{formatMesCorto(m.mes)}</span>)}
              </div>
            </section>
            <section aria-label="Distribución" className={cx(tarjeta, 'flex flex-col gap-3 p-5')}>
              <h2 className="text-h3 font-semibold">Por tipo</h2>
              {st.porTipo.map((t) => <Barra key={t.type} nombre={TIPO[t.type]} n={t.n} max={maxTipo} tinta />)}
              <h2 className="mt-2 text-h3 font-semibold">Por vehículo</h2>
              {st.porVehiculo.map((v) => <Barra key={v.plate} nombre={v.plate} n={v.n} max={maxVeh} mono />)}
            </section>
          </div>
        </>
      )}
    </Pagina>
  )
}
