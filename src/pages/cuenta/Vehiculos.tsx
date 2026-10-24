import { Car } from 'lucide-react'
import type { CSSProperties } from 'react'
import { esPagable, getMultas, getVehiculos } from '@/lib/demo/api.ts'
import { useCarga } from '@/hooks/useCarga.ts'
import { BotonLink } from '@/components/ui/index.tsx'
import { cx } from '@/components/ui/estilos.ts'
import { ErrorCarga, Pagina, Titulo, Vacio } from '@/components/cuenta/piezas.tsx'
import { Placa } from '@/components/vc/index.tsx'

export default function Vehiculos() {
  const { data, error, cargando, recargar } = useCarga(() => Promise.all([getVehiculos(), getMultas()]), [])

  return (
    <Pagina>
      <Titulo despues="A su nombre según el registro (ejemplo).">Vehículos</Titulo>
      {cargando && <div aria-busy="true" aria-label="Cargando vehículos" className="grid grid-cols-1 gap-4 lg:grid-cols-2"><span className="sk h-52 rounded-card" /><span className="sk h-52 rounded-card" /></div>}
      {error && error.code !== 'SESION' && <ErrorCarga titulo="No pudimos cargar sus vehículos" texto="Revise su conexión e intente de nuevo." onReintentar={recargar} />}
      {data && (data[0].length === 0 ? (
        <Vacio
          titulo="No hay vehículos a su nombre"
          texto="Su cuenta funciona igual. Si compró un vehículo hace poco, puede tardar unos días en aparecer."
          icono={<span className="flex size-12 items-center justify-center rounded-control bg-suave"><Car size={22} strokeWidth={1.75} aria-hidden="true" /></span>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data[0].map((v, i) => {
            const suyas = data[1].filter((m) => m.plate === v.plate)
            const pp = suyas.filter(esPagable).length
            return (
              <article key={v.plate} className="entra rounded-card bg-suave p-1.5" style={{ '--i': i } as CSSProperties}>
                <div className="flex flex-col gap-4 rounded-control bg-card p-5 shadow-[0_1px_2px_rgba(14,23,38,.06)]">
                  <div className="flex items-start justify-between gap-3">
                    <Placa value={v.plate} size="lg" />
                    <span className={cx('inline-flex h-[26px] items-center rounded-full px-2.5 text-xs font-semibold', pp ? 'bg-rojo-bg text-rojo-osc' : 'bg-verde-bg text-verde-osc')}>
                      {pp ? `${pp} por pagar` : 'Al día'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <h2 className="text-h3 font-semibold">{v.brand} {v.model} {v.year}</h2>
                    <span className="text-sm text-texto-2">{v.color} · ejemplo</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-borde pt-3">
                    <span className="text-sm text-texto-2"><span className="font-mono font-bold text-tinta">{suyas.length}</span> multas registradas</span>
                    <BotonLink variante="outline" to={`/multas?placa=${v.plate}${pp ? '' : '&tab=pagadas'}`} className="h-11 px-4 text-sm">Ver sus multas</BotonLink>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ))}
    </Pagina>
  )
}
