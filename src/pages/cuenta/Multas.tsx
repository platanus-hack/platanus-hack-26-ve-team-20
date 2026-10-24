import { useSearchParams } from 'react-router'
import { esPagable, getMultas, getVehiculos, type Multa } from '@/lib/demo/api.ts'
import { formatMes } from '@/lib/format.ts'
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

export default function Multas() {
  // Pestaña y filtro en la URL: "Ver sus multas" desde Vehículos llega ya filtrado.
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'pagadas' ? 'pagadas' : params.get('tab') === 'otras' ? 'otras' : 'por-pagar'
  const placa = params.get('placa')
  const { data, error, cargando, recargar } = useCarga(() => Promise.all([getMultas(), getVehiculos()]), [])
  const cambiar = (k: string, v: string | null) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    setParams(p, { replace: true })
  }

  const multas = data?.[0] ?? []
  const filtradas = multas.filter(FILTRO[tab]).filter((m) => !placa || m.plate === placa)
  const grupos = new Map<string, Multa[]>()
  for (const m of filtradas) grupos.set(formatMes(m.occurredAt), [...(grupos.get(formatMes(m.occurredAt)) ?? []), m])
  const placas = data ? [...new Set([...data[1].map((v) => v.plate), ...multas.map((m) => m.plate)])] : []

  return (
    <Pagina>
      <Titulo>Multas</Titulo>
      <Pestanas
        etiqueta="Estado"
        valor={tab}
        onCambio={(t) => cambiar('tab', t === 'por-pagar' ? null : t)}
        opciones={(['por-pagar', 'pagadas', 'otras'] as const).map((id) => ({ id, nombre: { 'por-pagar': 'Por pagar', pagadas: 'Pagadas', otras: 'Otras' }[id], n: multas.filter(FILTRO[id]).length }))}
      />
      {placas.length > 0 && (
        <div role="group" aria-label="Filtrar por vehículo" className="flex flex-wrap gap-2">
          {[null, ...placas].map((p) => (
            <button
              key={p ?? 'todos'}
              type="button"
              aria-pressed={placa === p}
              onClick={() => cambiar('placa', p)}
              className={cx(
                'press h-11 rounded-full border px-3.5',
                p ? 'font-mono text-[13px] font-bold' : 'text-sm font-semibold',
                placa === p ? 'border-tinta bg-tinta text-card' : 'border-input bg-card text-tinta',
              )}
            >
              {p ?? 'Todos'}
            </button>
          ))}
        </div>
      )}

      {cargando && (
        <div aria-busy="true" aria-label="Cargando sus multas" className="flex flex-col gap-2">
          <span className="sk h-5 w-[120px]" />
          <span className="sk h-16 rounded-card" />
          <span className="sk h-16 rounded-card" />
        </div>
      )}
      {error && error.code !== 'SESION' && (
        <ErrorCarga titulo="Sin conexión" texto="No pudimos traer sus multas. Revise su conexión e intente de nuevo." onReintentar={recargar} />
      )}
      {data && (grupos.size === 0 ? (
        <Vacio titulo={VACIO[tab][0]} texto={tab === 'por-pagar' ? `${VACIO[tab][1]}${placa ? ` para ${placa}` : ''}. Siga así.` : VACIO[tab][1]} />
      ) : (
        [...grupos].map(([mes, lista]) => (
          <section key={mes} aria-label={mes} className="flex flex-col">
            <h2 className="sticky top-0 z-10 bg-fondo px-1 py-2.5 text-caption font-semibold text-texto-2">{mes}</h2>
            <ListaMultas multas={lista} conPagar={tab === 'por-pagar'} desde="multas" />
          </section>
        ))
      ))}
    </Pagina>
  )
}
