import type { MouseEvent } from 'react'
import { CALLES_X, CALLES_Y, DURACION_ONDA_MS, MUNDO, type Incidente, type Nodo, type Punto } from '@/lib/choques/sim.ts'
import { cx } from '@/components/ui/estilos.ts'
import { COLOR, type EstadoNodo } from './estados.ts'

const CALLE = '#2A3446'
const MANZANA = '#151C28'
const LINEA = '#A9B4C4'
const LIMA = '#C6F24E'
const ROJO = '#FF5A4A'

const rad = (g: number) => (g * Math.PI) / 180

/** Cono de visión: del nodo hasta su alcance, `fov` grados centrado en su rumbo. */
function cono(n: Pick<Nodo, 'pos' | 'rumbo' | 'fov' | 'alcance'>) {
  const a = rad(n.rumbo - n.fov / 2)
  const b = rad(n.rumbo + n.fov / 2)
  const { x, y } = n.pos
  const r = n.alcance
  return `M${x} ${y} L${x + r * Math.cos(a)} ${y + r * Math.sin(a)} A${r} ${r} 0 0 1 ${x + r * Math.cos(b)} ${y + r * Math.sin(b)} Z`
}

/**
 * Mapa esquemático de la red: calles, teléfonos (dashcam), cámaras de semáforo y el choque con su radio de
 * alerta. Lo usan la simulación y la red en vivo; cada una dice el estado de cada nodo con `estadoDe`.
 * `onClic` recibe el punto en metros del mapa.
 */
export function Mapa({ nodos, incidente: inc, ahora, estadoDe, onClic, etiquetarTodos = false, etiqueta = 'Mapa de la red' }: {
  nodos: Nodo[]
  incidente: Incidente | null
  /** Mismo reloj que `incidente.servidorEn` (para la onda de alerta). */
  ahora: number
  estadoDe: (nodoId: string) => EstadoNodo
  onClic?: (p: Punto) => void
  etiquetarTodos?: boolean
  etiqueta?: string
}) {
  const enIncidente = new Set(inc?.capturas.map((c) => c.nodoId))
  const directos = new Set(inc?.capturas.filter((c) => c.enCuadro).map((c) => c.nodoId))

  const clic = (e: MouseEvent<SVGSVGElement>) => {
    const ctm = e.currentTarget.getScreenCTM()
    if (!ctm || !onClic) return
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    onClic({ x: p.x, y: p.y })
  }

  // Onda de alerta: sale del reportero al despachar y llega al radio en DURACION_ONDA_MS.
  const despachado = inc?.servidorEn != null && ahora >= inc.servidorEn
  const onda = inc?.servidorEn != null ? (ahora - inc.servidorEn) / DURACION_ONDA_MS : -1

  return (
    <svg
      viewBox={`0 0 ${MUNDO.ancho} ${MUNDO.alto}`}
      className={cx('block h-auto w-full select-none', onClic && 'cursor-crosshair')}
      role="img"
      aria-label={etiqueta}
      onClick={clic}
    >
      <rect width={MUNDO.ancho} height={MUNDO.alto} fill={MANZANA} />
      {CALLES_Y.map((y) => <line key={`y${y}`} x1={0} y1={y} x2={MUNDO.ancho} y2={y} stroke={CALLE} strokeWidth={20} />)}
      {CALLES_X.map((x) => <line key={`x${x}`} x1={x} y1={0} x2={x} y2={MUNDO.alto} stroke={CALLE} strokeWidth={20} />)}
      {CALLES_Y.map((y) => <line key={`dy${y}`} x1={0} y1={y} x2={MUNDO.ancho} y2={y} stroke={LINEA} strokeOpacity={0.25} strokeWidth={1} strokeDasharray="8 10" />)}
      {CALLES_X.map((x) => <line key={`dx${x}`} x1={x} y1={0} x2={x} y2={MUNDO.alto} stroke={LINEA} strokeOpacity={0.25} strokeWidth={1} strokeDasharray="8 10" />)}
      {CALLES_Y.map((y, i) => <text key={`ty${y}`} x={8} y={y - 14} fill={LINEA} fillOpacity={0.6} fontSize={11} fontFamily="Geist">Calle {i + 1}</text>)}
      {CALLES_X.map((x, i) => <text key={`tx${x}`} x={x + 14} y={MUNDO.alto - 10} fill={LINEA} fillOpacity={0.6} fontSize={11} fontFamily="Geist">Av. {i + 1}</text>)}

      {/* conos de visión */}
      {nodos.map((n) => {
        const s = estadoDe(n.id)
        const activo = directos.has(n.id) && s !== 'GRABANDO' && s !== 'PERDIDO'
        return <path key={`c${n.id}`} d={cono(n)} fill={activo ? COLOR[s] : LINEA} fillOpacity={activo ? 0.13 : n.propio ? 0.1 : 0.045} />
      })}

      {/* radio de alerta y onda */}
      {inc && despachado && (
        <circle cx={inc.centro.x} cy={inc.centro.y} r={inc.radioM} fill={LIMA} fillOpacity={0.04} stroke={LIMA} strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="6 6" />
      )}
      {inc && onda >= 0 && onda <= 1 && (
        <circle cx={inc.centro.x} cy={inc.centro.y} r={inc.radioM * onda} fill="none" stroke={LIMA} strokeWidth={3} strokeOpacity={1 - onda} />
      )}

      {/* líneas de captura: del nodo al choque, punteadas si no lo tiene en cuadro */}
      {inc?.capturas.map((c) => {
        const s = estadoDe(c.nodoId)
        const n = nodos.find((x) => x.id === c.nodoId)
        if (!n || (s !== 'CAPTURANDO' && s !== 'SUBIENDO' && s !== 'LISTO')) return null
        return <line key={`l${c.nodoId}`} x1={n.pos.x} y1={n.pos.y} x2={inc.pos.x} y2={inc.pos.y} stroke={COLOR[s]} strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray={c.enCuadro ? undefined : '3 4'} />
      })}

      {/* choque */}
      {inc && (
        <g transform={`translate(${inc.pos.x} ${inc.pos.y})`}>
          <circle r={14} fill={ROJO} fillOpacity={0.25}>
            <animate attributeName="r" values="10;26;10" dur="1.4s" repeatCount="indefinite" />
            <animate attributeName="fill-opacity" values=".35;0;.35" dur="1.4s" repeatCount="indefinite" />
          </circle>
          <polygon points="0,-12 3,-4 11,-6 6,1 12,7 3,5 0,12 -3,5 -12,7 -6,1 -11,-6 -3,-4" fill={ROJO} stroke="#FFFFFF" strokeWidth={1.2} />
        </g>
      )}

      {/* nodos */}
      {nodos.map((n) => {
        const s = estadoDe(n.id)
        return <NodoMapa key={n.id} n={n} s={s} etiqueta={etiquetarTodos || n.propio || enIncidente.has(n.id)} reportero={inc?.reportero === n.id} />
      })}
    </svg>
  )
}

function NodoMapa({ n, s, etiqueta, reportero }: { n: Nodo; s: EstadoNodo; etiqueta: boolean; reportero: boolean }) {
  const color = COLOR[s]
  return (
    <g>
      <g transform={`translate(${n.pos.x} ${n.pos.y}) rotate(${n.rumbo})`}>
        {n.tipo === 'TELEFONO' ? (
          <>
            <rect x={-9} y={-5} width={18} height={10} rx={2.5} fill={color} stroke={n.propio ? LIMA : '#0E1726'} strokeWidth={n.propio ? 2 : 1} />
            <rect x={2.5} y={-3.5} width={4} height={7} rx={1} fill="#0E1726" fillOpacity={0.6} />
          </>
        ) : (
          <>
            <rect x={-6} y={-6} width={12} height={12} rx={3} fill={color} stroke="#0E1726" strokeWidth={1} />
            <polygon points="6,-3 11,-5 11,5 6,3" fill={color} />
          </>
        )}
      </g>
      {n.senal === 'SIN' && <circle cx={n.pos.x} cy={n.pos.y} r={13} fill="none" stroke="#667085" strokeWidth={1.5} strokeDasharray="3 3" />}
      {s === 'CAPTURANDO' && (
        <circle cx={n.pos.x} cy={n.pos.y} r={13} fill="none" stroke={color} strokeWidth={2}>
          <animate attributeName="stroke-opacity" values="1;.2;1" dur=".8s" repeatCount="indefinite" />
        </circle>
      )}
      {etiqueta && (
        <text x={n.pos.x + 12} y={n.pos.y - 10} fill={n.propio ? LIMA : '#F2F5F9'} fontSize={11} fontWeight={700} fontFamily="JetBrains Mono" paintOrder="stroke" stroke="#0E1726" strokeWidth={3}>
          {n.propio ? (n.nombre ? `${n.nombre} (TÚ)` : 'ESTE DISPOSITIVO') : (n.nombre ?? n.id)}{reportero ? ' · REPORTÓ' : ''}
        </text>
      )}
    </g>
  )
}
