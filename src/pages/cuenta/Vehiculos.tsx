import { Car, ChevronRight } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { esPagable, getMultas, getVehiculos } from '@/lib/demo/api.ts'
import { useCarga } from '@/hooks/useCarga.ts'
import { cx, tarjeta } from '@/components/ui/estilos.ts'
import { ErrorCarga, Pagina, Titulo, Vacio } from '@/components/cuenta/piezas.tsx'
import { Placa } from '@/components/vc/index.tsx'

export default function Vehiculos() {
  const { data, error, cargando, recargar } = useCarga(() => Promise.all([getVehiculos(), getMultas()]), [])

  return (
    <Pagina>
      <Titulo despues="A su nombre según el registro (ejemplo).">Vehículos</Titulo>
      {cargando && <div aria-busy="true" aria-label="Cargando vehículos" className="grid grid-cols-1 gap-3 lg:grid-cols-2"><span className="sk h-24 rounded-card" /><span className="sk h-24 rounded-card" /></div>}
      {error && error.code !== 'SESION' && <ErrorCarga titulo="No pudimos cargar sus vehículos" texto="Revise su conexión e intente de nuevo." onReintentar={recargar} />}
      {data && (data[0].length === 0 ? (
        <Vacio
          titulo="No hay vehículos a su nombre"
          texto="Su cuenta funciona igual. Si compró un vehículo hace poco, puede tardar unos días en aparecer."
          icono={<span className="flex size-12 items-center justify-center rounded-control bg-suave"><Car size={22} strokeWidth={1.75} aria-hidden="true" /></span>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {data[0].map((v, i) => {
            const suyas = data[1].filter((m) => m.plate === v.plate)
            const pp = suyas.filter(esPagable).length
            return (
              <Link
                key={v.plate}
                to={`/multas?placa=${v.plate}${pp ? '' : '&tab=pagadas'}`}
                aria-label={`${v.brand} ${v.model} ${v.year}, placa ${v.plate}, ${pp ? `${pp} por pagar` : 'al día'}. Ver sus multas`}
                className={cx(tarjeta, 'entra group flex items-center gap-4 p-4 transition-[transform,box-shadow,background-color] duration-200 ease-press hover:-translate-y-0.5 hover:shadow-sheet motion-reduce:hover:translate-y-0 lg:p-5')}
                style={{ '--i': i } as CSSProperties}
              >
                <Placa value={v.plate} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-semibold">{v.brand} {v.model} {v.year}</span>
                  <span className="text-caption text-texto-2">{v.color} · ejemplo · {suyas.length} {suyas.length === 1 ? 'multa' : 'multas'}</span>
                  <span className={cx('text-caption font-semibold', pp ? 'text-rojo-osc' : 'text-verde-osc')}>{pp ? `${pp} por pagar` : 'Al día'}</span>
                </span>
                <ChevronRight size={18} strokeWidth={2} aria-hidden="true" className="flex-none text-texto-3 transition-transform duration-150 group-hover:translate-x-0.5" />
              </Link>
            )
          })}
        </div>
      ))}
    </Pagina>
  )
}
