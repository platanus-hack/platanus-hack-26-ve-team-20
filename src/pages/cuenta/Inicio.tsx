import { Check } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { esPagable, getMultas, getSesion } from '@/lib/demo/api.ts'
import { formatBs, formatCedula } from '@/lib/format.ts'
import { useCarga } from '@/hooks/useCarga.ts'
import { Boton } from '@/components/ui/index.tsx'
import { cx, enlace, tarjeta } from '@/components/ui/estilos.ts'
import { ErrorCarga, ListaMultas, Pagina, SkeletonLista, Titulo } from '@/components/cuenta/piezas.tsx'

function saludo() {
  const h = Number(new Intl.DateTimeFormat('es-VE', { timeZone: 'America/Caracas', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  return h < 12 ? 'Buen día' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

/** Inicio: cuánto debe y qué multas lo componen. El historial vive en Multas. */
export default function Inicio() {
  const navigate = useNavigate()
  const sesion = getSesion()
  const { data: multas, error, cargando, recargar } = useCarga(() => getMultas(), [])

  const pend = (multas ?? []).filter(esPagable)
  const pagadas = (multas ?? []).filter((m) => m.status === 'PAID')
  const total = pend.reduce((t, m) => t + m.amountCents, 0)
  const vencidas = pend.filter((m) => m.status === 'OVERDUE').length

  return (
    <Pagina>
      <Titulo despues={<>Cédula <span className="font-mono font-semibold">{sesion && formatCedula(sesion.cedula)}</span></>}>{saludo()}</Titulo>

      {cargando && <SkeletonLista grande />}
      {error && error.code !== 'SESION' && (
        <ErrorCarga titulo="No pudimos cargar sus multas" texto="Revise su conexión a internet. Sus datos están a salvo." onReintentar={recargar} />
      )}

      {multas && (
        <div className="grid gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
          {pend.length > 0 ? (
            <section aria-label="Por pagar" className="tinta flex flex-col gap-6 rounded-card bg-tinta p-6 text-card shadow-card lg:col-span-5 lg:p-7">
              <div className="flex flex-col gap-1">
                <span className="text-sm text-niebla">Por pagar</span>
                <span className="num font-mono text-[40px] leading-[44px] font-bold">{formatBs(total)}</span>
                <span className="flex flex-wrap items-center gap-2 text-sm text-niebla">
                  {pend.length} {pend.length === 1 ? 'multa' : 'multas'}
                  {vencidas > 0 && (
                    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-tinta-2 px-2.5 text-caption font-semibold text-card">
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-rojo" />
                      {vencidas === 1 ? '1 vencida' : `${vencidas} vencidas`}
                    </span>
                  )}
                </span>
              </div>
              <Boton variante="lima" className="w-full" onClick={() => navigate(pend.length > 1 ? '/pagar' : `/multas/${pend[0]?.id}/pagar`, { state: { desde: 'inicio' } })}>
                {pend.length > 1 ? 'Pagar todo' : 'Pagar'}
              </Boton>
            </section>
          ) : (
            <section aria-label="Está al día" className="tinta flex items-center gap-4 rounded-card bg-tinta p-6 text-card shadow-card lg:col-span-5">
              <span className="flex size-12 flex-none items-center justify-center rounded-full bg-brand text-[#0e1726]">
                <Check size={26} strokeWidth={2.5} aria-hidden="true" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-h2-m font-semibold">Está al día</span>
                <span className="text-sm text-niebla">No tiene multas por pagar.</span>
              </span>
            </section>
          )}

          <section aria-labelledby="lista-t" className="flex flex-col gap-3 lg:col-span-7">
            <div className="flex items-center justify-between">
              <h2 id="lista-t" className="text-h3 font-semibold">{pend.length ? 'Pendientes' : 'Historial'}</h2>
              <Link to="/multas" className={enlace}>Ver todas</Link>
            </div>
            {pend.length ? (
              <ListaMultas multas={pend} desde="inicio" />
            ) : pagadas.length ? (
              <ListaMultas multas={pagadas.slice(0, 3)} desde="inicio" />
            ) : (
              <div className={cx(tarjeta, 'px-4 py-5 text-sm text-texto-2')}>Aún no hay infracciones registradas en su cuenta.</div>
            )}
          </section>
        </div>
      )}
    </Pagina>
  )
}
