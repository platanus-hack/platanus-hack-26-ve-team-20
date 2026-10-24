import { normalizeCedula, normalizePlate } from '@contracts'
import { CircleCheck, Download, SearchX } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { DemoError } from '@/lib/demo/api.ts'
import { accionesPermitidas, listarMultas, listarTodas, type MultaOficial } from '@/lib/oficial/api.ts'
import { descargarCsv } from '@/lib/oficial/csv.ts'
import { TIPO } from '@/lib/etiquetas.ts'
import { formatFecha, formatHora } from '@/lib/format.ts'
import { useCarga } from '@/hooks/useCarga.ts'
import { Boton, Campo, SelectCedula } from '@/components/ui/index.tsx'
import { cx, enlace, input, tarjeta } from '@/components/ui/estilos.ts'
import { ErrorCarga, Pagina, Titulo, Vacio } from '@/components/cuenta/piezas.tsx'
import { CambioEstado } from '@/components/oficial/CambioEstado.tsx'
import { EstadoBadge, Monto, Placa } from '@/components/vc/index.tsx'

export default function MultasOficial() {
  // Los filtros viven en la URL (?cedula=&placa=): se pueden compartir y sobreviven a "volver".
  const [params, setParams] = useSearchParams()
  const cedula = params.get('cedula') ?? ''
  const placa = params.get('placa') ?? ''
  const clave = `${cedula}|${placa}`
  const aplicar = (c: string, p: string) => setParams(new URLSearchParams([...(c ? [['cedula', c]] : []), ...(p ? [['placa', p]] : [])]))
  // Viene de aceptar la invitación (estado de la navegación, no de la URL).
  const bienvenida = (useLocation().state as { bienvenida?: string } | null)?.bienvenida

  return (
    <Pagina>
      {bienvenida && (
        <div role="status" className="flex gap-2.5 rounded-control bg-verde-bg px-3.5 py-3 text-sm text-verde-osc">
          <CircleCheck size={18} strokeWidth={1.75} aria-hidden="true" className="mt-px flex-none" />
          Su cuenta está lista. Su placa es {bienvenida}.
        </div>
      )}
      <Titulo despues="La más reciente primero. Cédulas enmascaradas.">Historial de multas</Titulo>
      <Filtros key={`f${clave}`} cedula={cedula} placa={placa} onAplicar={aplicar} />
      <Resultado key={`r${clave}`} cedula={cedula} placa={placa} />
    </Pagina>
  )
}

function Filtros({ cedula, placa, onAplicar }: { cedula: string; placa: string; onAplicar: (c: string, p: string) => void }) {
  const [tipo, setTipo] = useState<'V' | 'E'>(cedula.startsWith('E') ? 'E' : 'V')
  const [num, setNum] = useState(cedula.replace(/\D/g, ''))
  const [pla, setPla] = useState(placa)
  const malCedula = num !== '' && !/^\d{6,9}$/.test(num)
  const [intento, setIntento] = useState(false)

  const buscar = (e: FormEvent) => {
    e.preventDefault()
    setIntento(true)
    if (!malCedula) onAplicar(num ? normalizeCedula(`${tipo}${num}`) : '', normalizePlate(pla))
  }

  return (
    <form role="search" aria-label="Filtrar multas" onSubmit={buscar} noValidate className={cx(tarjeta, 'grid grid-cols-1 gap-4 p-4 md:grid-cols-[1fr_1fr_auto] md:items-start')}>
      <Campo id="f-ced" label="Cédula del titular" error={intento && malCedula && 'Entre 6 y 9 dígitos.'}>
        <div className="flex gap-2">
          <SelectCedula value={tipo} onChange={setTipo} />
          <input
            id="f-ced" type="text" inputMode="numeric" autoComplete="off" placeholder="12345678"
            value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, '').slice(0, 9))}
            aria-invalid={intento && malCedula} aria-describedby={intento && malCedula ? 'f-ced-err' : undefined}
            className={input(intento && malCedula, true)}
          />
        </div>
      </Campo>
      <Campo id="f-pla" label="Placa" ayuda="Puede escribir solo el comienzo.">
        <input
          id="f-pla" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="AB123CD"
          value={pla} onChange={(e) => setPla(e.target.value.toUpperCase().slice(0, 10))} aria-describedby="f-pla-ayuda"
          className={input(false, true)}
        />
      </Campo>
      <div className="flex gap-2 md:mt-[26px]">
        <Boton type="submit" className="flex-1 md:flex-none">Buscar</Boton>
        <Boton variante="outline" className="flex-1 md:flex-none" onClick={() => onAplicar('', '')}>Limpiar</Boton>
      </div>
    </form>
  )
}

function Resultado({ cedula, placa }: { cedula: string; placa: string }) {
  const { search } = useLocation()
  const { data, error, cargando, recargar } = useCarga(() => listarMultas({ cedula, placa }), [])
  const [mas, setMas] = useState<MultaOficial[]>([])
  const [cursor, setCursor] = useState<string | null>()
  const [cargandoMas, setCargandoMas] = useState(false)
  const [errorMas, setErrorMas] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [errorCsv, setErrorCsv] = useState(false)
  const [cambios, setCambios] = useState<Record<string, MultaOficial>>({})
  const [objetivo, setObjetivo] = useState<MultaOficial | null>(null)

  const siguiente = cursor === undefined ? data?.nextCursor ?? null : cursor
  const items = [...(data?.items ?? []), ...mas].map((m) => cambios[m.id] ?? m)
  const filtrado = Boolean(cedula || placa)
  const volver = { volver: `/oficial/multas${search}` }
  const sesion = (e: unknown) => e instanceof DemoError && e.code === 'SESION' // el Shell muestra el aviso

  const cargarMas = async () => {
    if (!siguiente || cargandoMas) return
    setCargandoMas(true)
    setErrorMas(false)
    try {
      const p = await listarMultas({ cedula, placa, cursor: siguiente })
      setMas((m) => [...m, ...p.items])
      setCursor(p.nextCursor)
    } catch (e) {
      if (!sesion(e)) setErrorMas(true)
    } finally {
      setCargandoMas(false)
    }
  }

  const exportar = async () => {
    if (exportando) return
    setExportando(true)
    setErrorCsv(false)
    try {
      descargarCsv(await listarTodas({ cedula, placa }))
    } catch (e) {
      if (!sesion(e)) setErrorCsv(true)
    } finally {
      setExportando(false)
    }
  }

  if (cargando) {
    return (
      <div aria-busy="true" aria-label="Cargando el historial" className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => <span key={i} className="sk h-16 rounded-card" />)}
      </div>
    )
  }
  if (error) return sesion(error) ? null : <ErrorCarga titulo="No pudimos cargar el historial" texto="Revise su conexión e intente de nuevo." onReintentar={recargar} />
  if (!items.length) {
    return (
      <Vacio
        titulo={filtrado ? 'No hay multas con esos filtros' : 'Aún no hay multas'}
        texto={filtrado ? 'Revise la cédula o la placa, o use Limpiar para ver todas.' : 'Cuando el sistema emita multas, aparecerán aquí.'}
        icono={<span className="flex size-12 items-center justify-center rounded-control bg-suave text-texto-2"><SearchX size={22} strokeWidth={1.75} aria-hidden="true" /></span>}
      />
    )
  }

  const cambiar = (m: MultaOficial) => accionesPermitidas(m.status).length > 0 && (
    <button type="button" onClick={() => setObjetivo(m)} aria-haspopup="dialog" aria-label={`Cambiar estado de la multa de ${m.plate} del ${formatFecha(m.occurredAt)}`} className={enlace}>
      Cambiar estado
    </button>
  )

  return (
    <section aria-label="Resultado" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span role="status" className="text-sm text-texto-2">
          {siguiente ? `Mostrando las ${items.length} más recientes` : `${items.length} ${items.length === 1 ? 'multa' : 'multas'}`}
        </span>
        <Boton variante="outline" className="ml-auto h-11 text-sm" disabled={exportando} aria-busy={exportando} onClick={exportar}>
          <Download size={18} strokeWidth={1.75} aria-hidden="true" />{exportando ? 'Preparando…' : 'Exportar CSV'}
        </Boton>
      </div>
      {errorCsv && <p role="alert" className="text-sm text-rojo-osc">No pudimos preparar el archivo. Intente de nuevo.</p>}

      {/* ≥1024: tabla. Debajo: tarjetas. */}
      <div className={cx(tarjeta, 'hidden overflow-x-auto lg:block')}>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Multas, la más reciente primero</caption>
          <thead className="text-caption text-texto-2">
            <tr>{['Fecha y hora', 'Tipo', 'Placa', 'Cédula', 'Intersección', 'Monto', 'Estado', 'Acciones'].map((h) => <th key={h} scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="border-t border-borde">
                <td className="px-4 py-2 font-mono font-bold whitespace-nowrap">{formatFecha(m.occurredAt)}<span className="block font-medium text-texto-2">{formatHora(m.occurredAt)}</span></td>
                <td className="px-4 py-2 font-semibold whitespace-nowrap">{TIPO[m.type]}</td>
                <td className="px-4 py-2"><Placa value={m.plate} size="sm" /></td>
                <td className="px-4 py-2 font-mono whitespace-nowrap">{m.cedulaMasked ?? '—'}</td>
                <td className="min-w-[180px] px-4 py-2 text-texto-2">{m.intersection}</td>
                <td className="px-4 py-2"><Monto cents={m.amountCents} anulada={m.status === 'VOID'} /></td>
                <td className="px-4 py-2"><EstadoBadge status={m.status} /></td>
                <td className="px-4 py-2">
                  <span className="flex flex-col items-start">
                    <Link to={`/oficial/multas/${m.id}`} state={volver} aria-label={`Ver detalle de la multa de ${m.plate} del ${formatFecha(m.occurredAt)}`} className={enlace}>Ver detalle</Link>
                    {cambiar(m)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 lg:hidden">
        {items.map((m) => (
          <li key={m.id} className={cx(tarjeta, 'flex flex-col')}>
            <Link to={`/oficial/multas/${m.id}`} state={volver} className="press flex flex-col gap-2 p-4">
              <span className="flex items-start justify-between gap-2">
                <Placa value={m.plate} size="sm" />
                <EstadoBadge status={m.status} />
              </span>
              <span className="font-semibold">{TIPO[m.type]}</span>
              <span className="text-caption text-texto-2"><span className="font-mono font-bold text-tinta">{formatFecha(m.occurredAt)} · {formatHora(m.occurredAt)}</span> · {m.intersection}</span>
              <span className="flex items-center justify-between gap-2 text-sm">
                <span>Cédula <span className="font-mono font-bold">{m.cedulaMasked ?? '—'}</span></span>
                <Monto cents={m.amountCents} anulada={m.status === 'VOID'} />
              </span>
            </Link>
            {accionesPermitidas(m.status).length > 0 && (
              <div className="border-t border-borde px-3">{cambiar(m)}</div>
            )}
          </li>
        ))}
      </ul>

      {siguiente && (
        <Boton variante="outline" className="self-center" disabled={cargandoMas} aria-busy={cargandoMas} onClick={cargarMas}>
          {cargandoMas ? 'Cargando…' : 'Cargar más'}
        </Boton>
      )}
      {errorMas && <p role="alert" className="self-center text-sm text-rojo-osc">No pudimos cargar más multas. Intente de nuevo.</p>}

      {objetivo && <CambioEstado multa={objetivo} onCerrar={() => setObjetivo(null)} onHecho={(m) => setCambios((c) => ({ ...c, [m.id]: m }))} />}
    </section>
  )
}
