import { CloudUpload, EyeOff, Radio, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, type CSSProperties } from 'react'
import type { ClipReal } from '@/lib/choques/grabadora.ts'
import { POST_MS, PRE_MS, estadoCaptura, formatM, formatT, rumboHacia, type Captura, type Incidente } from '@/lib/choques/sim.ts'
import { cx, tarjeta } from '@/components/ui/estilos.ts'
import { PastillaTinta } from '@/components/vc/index.tsx'
import { COLOR, ETIQUETA, orientacion } from './estados.ts'

const acotar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

function Carro({ x, color, giro = 0 }: { x: number; color: string; giro?: number }) {
  return (
    <g transform={`translate(${x} 0) rotate(${giro})`}>
      <rect x={-15} y={-12} width={30} height={16} rx={4} fill={color} />
      <rect x={-11} y={-19} width={22} height={9} rx={3} fill="#3E4652" />
      <rect x={-14} y={-8} width={5} height={3} rx={1} fill="#C8281C" />
      <rect x={9} y={-8} width={5} height={3} rx={1} fill="#C8281C" />
      <rect x={-13} y={4} width={6} height={4} rx={1.5} fill="#1E242C" />
      <rect x={7} y={4} width={6} height={4} rx={1.5} fill="#1E242C" />
    </g>
  )
}

/**
 * Lo que ve un nodo (marcador SVG, no es video): calle en perspectiva y el choque ubicado según su
 * ángulo y distancia. `tau` es el tiempo relativo al choque: antes de 0 los carros se acercan.
 */
export function VistaPov({ c, tau }: { c: Captura; tau: number }) {
  const elevada = c.tipo === 'SEMAFORO'
  const h = elevada ? 46 : 80
  const k = acotar(22 / Math.max(c.distanciaM, 1), 0.14, 1)
  const x = 160 + acotar(c.anguloRel / (c.fov / 2), -1.1, 1.1) * 150
  const y = h + (180 - h) * (0.12 + 0.62 * k)
  const s = 0.35 + 1.1 * k
  const sep = tau < 0 ? Math.min(70, (-tau / 1000) * 9) : 0
  const choco = tau >= 0
  const brillo = choco ? acotar(1 - tau / 2500, 0.35, 1) : 0
  return (
    <svg viewBox="0 0 320 180" className="block h-full w-full" aria-hidden="true">
      <rect width="320" height={h} fill="#1D2636" />
      {[[8, 34], [52, 22], [84, 40], [210, 30], [246, 46], [288, 26]].map(([bx = 0, bh = 0]) => (
        <rect key={bx} x={bx} y={h - bh} width={30} height={bh} fill="#273247" />
      ))}
      <rect y={h} width="320" height={180 - h} fill="#2B3340" />
      <polygon points={`${160 - (elevada ? 46 : 16)},${h} ${160 + (elevada ? 46 : 16)},${h} 330,180 -10,180`} fill="#4B525C" />
      <line x1="160" y1={h} x2="160" y2="180" stroke="#E8E6E0" strokeOpacity={0.6} strokeWidth="2" strokeDasharray="8 8" />
      {c.enCuadro && (
        <g transform={`translate(${x} ${y}) scale(${s})`}>
          {choco ? (
            <>
              <Carro x={-13} color="#9198A2" giro={-14} />
              <Carro x={13} color="#6E7682" giro={18} />
              <g opacity={brillo}>
                <polygon points="0,-34 7,-16 26,-22 13,-6 30,6 9,4 4,22 -4,6 -24,14 -12,-4 -28,-18 -7,-16" fill="#F5A524" />
                <polygon points="0,-20 4,-10 14,-12 7,-3 15,4 4,2 0,12 -4,2 -13,6 -7,-3 -15,-10 -4,-10" fill="#FF5A4A" />
              </g>
            </>
          ) : (
            <>
              <Carro x={-15 - sep} color="#9198A2" />
              <Carro x={15 + sep} color="#6E7682" />
            </>
          )}
        </g>
      )}
      {!elevada && <path d="M-4 180 L-4 166 Q160 146 324 166 L324 180 Z" fill="#0B111C" />}
    </svg>
  )
}

function VideoVivo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])
  return <video ref={ref} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-cover" />
}

/** Un ángulo del incidente: su vista, estado de captura y de dónde vio el choque. */
export function TarjetaAngulo({ c, inc, ahora, tauRepro, clipReal, stream, i }: {
  c: Captura
  inc: Incidente
  ahora: number
  /** Reproducción sincronizada en curso (ms relativos al choque), o null. */
  tauRepro: number | null
  clipReal?: ClipReal
  stream?: MediaStream | null
  i: number
}) {
  const s = estadoCaptura(c, ahora)
  const enVivo = acotar(ahora - inc.t0, -PRE_MS, POST_MS)
  // Listo y sin reproducción: el fotograma clave, medio segundo después del impacto.
  const tau = s === 'LISTO' ? (tauRepro ?? 500) : enVivo
  const progreso = s === 'SUBIENDO' ? acotar((ahora - c.finCaptura) / (c.listoEn - c.finCaptura), 0, 1) : 0
  const tipo = c.propio ? 'Este dispositivo' : c.tipo === 'SEMAFORO' ? 'Cámara de semáforo' : 'Dashcam de conductor'

  return (
    <article className={cx(tarjeta, 'entra flex flex-col overflow-hidden')} style={{ '--i': i } as CSSProperties}>
      <div className="tinta relative aspect-video bg-tinta-2">
        {c.propio && s === 'LISTO' && clipReal ? (
          <video src={clipReal.url} controls muted playsInline loop autoPlay className="absolute inset-0 h-full w-full object-cover" />
        ) : c.propio && stream && s !== 'PERDIDO' ? (
          <VideoVivo stream={stream} />
        ) : (
          <VistaPov c={c} tau={tau} />
        )}

        {s === 'CAPTURANDO' && <PastillaTinta className="left-2.5" punto="size-2 bg-[#FF5A4A] animate-pulse">REC · guardando {formatT(-PRE_MS)} → {formatT(POST_MS)}</PastillaTinta>}
        {s === 'EN_CAMINO' && <PastillaTinta className="left-2.5" punto="size-1.5 bg-ambar">{c.reportero ? 'Analizando' : 'Alerta en cola · sin señal'}</PastillaTinta>}
        {s === 'SUBIENDO' && (
          <PastillaTinta className="left-2.5"><CloudUpload size={14} strokeWidth={2} aria-hidden="true" />Subiendo <span className="font-mono">{Math.round(progreso * 100)} %</span></PastillaTinta>
        )}
        {s === 'LISTO' && <PastillaTinta className="left-2.5" punto="size-1.5 bg-brand">{c.propio && clipReal ? `Clip real · ${Math.round(clipReal.duracionS)} s` : 'Clip listo · 15 s'}</PastillaTinta>}
        {c.reportero && <PastillaTinta className="right-2.5"><Radio size={13} strokeWidth={2} aria-hidden="true" />Reportó</PastillaTinta>}

        {!c.enCuadro && s !== 'PERDIDO' && !(c.propio && stream) && (
          <span className="absolute inset-x-0 bottom-9 mx-auto flex w-fit items-center gap-1.5 rounded-full bg-tinta/80 px-2.5 py-1 text-xs font-semibold text-card">
            <EyeOff size={13} strokeWidth={2} aria-hidden="true" />Sin vista directa · el choque quedó {orientacion(c.anguloRel)}
          </span>
        )}
        {s === 'PERDIDO' && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-tinta/85 px-4 text-center text-card">
            <TriangleAlert size={22} strokeWidth={1.75} aria-hidden="true" className="text-ambar" />
            <span className="font-semibold">Buffer sobrescrito</span>
            <span className="text-caption text-niebla">La alerta llegó en {formatT(c.alertaEn - inc.t0)}; el buffer guarda 30 s y ya no tenía {formatT(-PRE_MS)}.</span>
          </span>
        )}
        {s !== 'PERDIDO' && (
          <span className="absolute bottom-2 left-2.5 rounded bg-tinta/70 px-1.5 font-mono text-xs text-card">{c.nodoId} · {formatT(Math.round(tau / 100) * 100)}</span>
        )}
        {s === 'SUBIENDO' && <span className="absolute inset-x-0 bottom-0 h-1 origin-left bg-[#6F9BFF]" style={{ transform: `scaleX(${progreso})` }} />}
      </div>

      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold">{c.propio ? 'ESTE' : c.nodoId}</span>
          <span className="text-caption text-texto-2">{tipo}</span>
          <span className="ml-auto inline-flex h-6 items-center gap-1.5 rounded-full bg-tinta px-2.5 text-xs font-semibold text-card">
            <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: COLOR[s] }} />
            {ETIQUETA[s]}
          </span>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-caption">
          <div><dt className="text-texto-3">Distancia</dt><dd className="font-mono font-semibold">{formatM(c.distanciaM)}</dd></div>
          <div><dt className="text-texto-3">Choque</dt><dd className="font-semibold">{orientacion(c.anguloRel)} <span className="font-mono text-texto-2">{Math.round(c.anguloRel)}°</span></dd></div>
          <div><dt className="text-texto-3">Alerta</dt><dd className="font-mono font-semibold">{formatT(c.alertaEn - inc.t0)}</dd></div>
        </dl>
      </div>
    </article>
  )
}

/** Rosa de ángulos: desde dónde quedó grabado el choque (norte arriba). */
export function Cobertura({ inc, ahora }: { inc: Incidente; ahora: number }) {
  const listos = inc.capturas.filter((c) => estadoCaptura(c, ahora) === 'LISTO')
  return (
    <svg viewBox="-60 -60 120 120" className="size-[120px] flex-none" role="img" aria-label={`${listos.filter((c) => c.enCuadro).length} ángulos con vista directa`}>
      <circle r={50} fill="none" stroke="#2A3446" strokeWidth={1} />
      <circle r={30} fill="none" stroke="#2A3446" strokeWidth={1} />
      <text y={-52} textAnchor="middle" fontSize={9} fill="#A9B4C4" fontFamily="Geist">N</text>
      {listos.map((c) => {
        const a = (rumboHacia(inc.pos, c.pos) * Math.PI) / 180
        const x = 46 * Math.cos(a)
        const y = 46 * Math.sin(a)
        const color = c.enCuadro ? COLOR.LISTO : COLOR.GRABANDO
        return (
          <g key={c.nodoId}>
            <line x1={0} y1={0} x2={x} y2={y} stroke={color} strokeWidth={2} strokeDasharray={c.enCuadro ? undefined : '3 3'} />
            <circle cx={x} cy={y} r={4} fill={color} />
          </g>
        )
      })}
      <circle r={6} fill="#FF5A4A" stroke="#FFFFFF" strokeWidth={1.2} />
    </svg>
  )
}
