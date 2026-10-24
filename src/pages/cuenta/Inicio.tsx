import { Car, CircleAlert, Clock, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { esPagable, getMultas, getSesion, getVehiculos } from '@/lib/demo/api.ts'
import { TIPO } from '@/lib/etiquetas.ts'
import { diasEntre, formatBs, formatCedula, formatFecha } from '@/lib/format.ts'
import { useCarga } from '@/hooks/useCarga.ts'
import { Boton } from '@/components/ui/index.tsx'
import { cx, enlace, tarjeta } from '@/components/ui/estilos.ts'
import { Celebra, ErrorCarga, ListaMultas, Pagina, SkeletonLista, Titulo, h2 } from '@/components/cuenta/piezas.tsx'

function saludo() {
  const h = Number(new Intl.DateTimeFormat('es-VE', { timeZone: 'America/Caracas', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  return h < 12 ? 'Buen día' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

function Tile({ label, valor, sub, Icono, rojo }: { label: string; valor: string; sub: string; Icono: LucideIcon; rojo?: boolean }) {
  return (
    <div className={cx(tarjeta, 'flex flex-col gap-1 p-4 lg:col-span-5')}>
      <span className={cx('flex size-9 items-center justify-center rounded-[10px]', rojo ? 'bg-rojo-bg text-rojo-osc' : 'bg-suave text-tinta')}>
        <Icono size={18} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="text-caption text-texto-2">{label}</span>
      <span className="num font-mono text-xl font-bold">{valor}</span>
      <span className="text-caption text-texto-2">{sub}</span>
    </div>
  )
}

export default function Inicio() {
  const navigate = useNavigate()
  const sesion = getSesion()
  const [hoy] = useState(() => new Date())
  const { data, error, cargando, recargar } = useCarga(() => Promise.all([getMultas(), getVehiculos()]), [])

  const multas = data?.[0] ?? []
  const pend = multas.filter(esPagable)
  const pagadas = multas.filter((m) => m.status === 'PAID')
  const total = pend.reduce((t, m) => t + m.amountCents, 0)
  const vencida = pend.find((m) => m.status === 'OVERDUE')
  const proxima = pend.find((m) => m.status === 'PENDING')

  return (
    <Pagina>
      <Titulo antes={<>{saludo()} · <span className="font-mono font-bold">{sesion && formatCedula(sesion.cedula)}</span></>}>Inicio</Titulo>

      {cargando && <SkeletonLista grande />}
      {error && error.code !== 'SESION' && (
        <ErrorCarga titulo="No pudimos cargar sus multas" texto="Revise su conexión a internet. Sus datos están a salvo." onReintentar={recargar} />
      )}

      {data && (
        <>
          {pend.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-12 lg:gap-4">
                <div className="tinta col-span-2 flex min-h-[200px] flex-col gap-2.5 rounded-card bg-tinta p-6 text-card lg:col-span-7 lg:row-span-2 lg:min-h-[220px]">
                  <span className="inline-flex h-[26px] items-center self-start rounded-full bg-brand px-2.5 text-caption font-semibold text-tinta">{pend.length} por pagar</span>
                  <span className="text-sm text-niebla">Total pendiente · monto de ejemplo</span>
                  <span className="num font-mono text-[40px] leading-[44px] font-bold">{formatBs(total)}</span>
                  <Boton variante="pay" className="mt-auto self-start px-6" onClick={() => navigate(pend.length > 1 ? '/pagar' : `/multas/${pend[0]?.id}/pagar`, { state: { desde: 'inicio' } })}>
                    {pend.length > 1 ? 'Pagar todo' : 'Pagar'}
                  </Boton>
                </div>
                {vencida && <Tile rojo Icono={CircleAlert} label="Vencida desde" valor={formatFecha(vencida.dueAt)} sub={`${vencida.plate} · ${TIPO[vencida.type]}`} />}
                {proxima && <Tile Icono={Clock} label="Próximo vencimiento" valor={formatFecha(proxima.dueAt)} sub={`${proxima.plate} · en ${diasEntre(hoy, proxima.dueAt)} días`} />}
                {!(vencida && proxima) && <Tile Icono={Car} label="Vehículos" valor={String(data[1].length)} sub="a su nombre" />}
              </div>
              <section aria-labelledby="pp-t" className="flex flex-col gap-3">
                <h2 id="pp-t" className={h2}>Por pagar</h2>
                <ListaMultas multas={pend} conPagar desde="inicio" />
              </section>
            </>
          ) : (
            <>
              <Celebra titulo="Está al día">
                <span className="text-niebla">No tiene multas por pagar. {pagadas.length > 0 && 'Gracias por ponerse al día.'}</span>
                {pagadas.length > 0 && (
                  <span className="mt-1.5 flex flex-wrap gap-2">
                    <span className="inline-flex h-7 items-center rounded-full bg-tinta-2 px-3 text-caption font-semibold text-card"><span className="mr-1.5 font-mono">{pagadas.length}</span>pagadas</span>
                    <span className="inline-flex h-7 items-center rounded-full bg-tinta-2 px-3 font-mono text-caption font-semibold text-card">{formatBs(pagadas.reduce((t, m) => t + m.amountCents, 0))} pagados</span>
                  </span>
                )}
              </Celebra>
              {pagadas.length > 0 && (
                <section aria-labelledby="up-t" className="flex flex-col gap-3">
                  <h2 id="up-t" className={h2}>Últimas pagadas</h2>
                  <ListaMultas multas={pagadas.slice(0, 3)} desde="inicio" />
                </section>
              )}
            </>
          )}

          <section aria-labelledby="rec-t" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 id="rec-t" className={h2}>Infracciones recientes</h2>
              <Link to="/multas" className={enlace}>Ver todas</Link>
            </div>
            {multas.length ? (
              <ListaMultas multas={multas.slice(0, 5)} desde="inicio" />
            ) : (
              <div className={cx(tarjeta, 'px-4 py-5 text-sm text-texto-2')}>Aún no hay infracciones registradas en su cuenta.</div>
            )}
          </section>
        </>
      )}
    </Pagina>
  )
}
