import { Outlet, useLocation } from 'react-router'
import { InterruptorTema } from '@/components/ui/index.tsx'
import { Logo } from '@/components/vc/index.tsx'
import { Isotipo } from '@/components/vc/Isotipo.tsx'

const LEMA = 'La multa llega con la prueba, y se paga en un minuto.'

// Edificios del dibujo como [x desde, x hasta, techo]; el suelo de todos es y = 360.
const EDIFICIOS: Array<[number, number, number]> = [
  [0, 40, 250], [40, 90, 210], [90, 130, 280], [130, 175, 190], [175, 220, 300], [220, 260, 240], [260, 300, 320],
  [380, 410, 330], [410, 450, 250], [450, 480, 300], [480, 520, 200], [520, 560, 260], [560, 600, 170], [600, 640, 220],
]

// Sol del dibujo: a la izquierda del centro, sobre el hueco de la avenida.
const SOL = { x: 300, y: 318 }

// Ventanas de 4×6 en rejilla de 10×14; unas dos de cada tres encendidas, con un patrón fijo para que no cambie en cada render.
const VENTANAS = EDIFICIOS.flatMap(([x0, x1, techo], e) => {
  const v: Array<{ x: number; y: number }> = []
  for (let y = techo + 12; y <= 344; y += 14) {
    for (let x = x0 + 7; x + 4 <= x1 - 5; x += 10) {
      if ((x * 7 + y * 13 + e * 31) % 3 !== 0) v.push({ x, y })
    }
  }
  return v
})

/** Acceso: formulario de 400 px máx. En desktop, panel tinta con la calle al atardecer. */
export default function AuthLayout() {
  const { pathname } = useLocation()
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col lg:flex-row">
        <div className="relative flex flex-1 flex-col items-center px-4 pt-4 pb-6 lg:justify-center lg:p-12">
          {/* Tema arriba a la izquierda; en móvil el logo queda a la derecha. */}
          <div className="flex w-full items-center justify-between pb-4 lg:absolute lg:top-4 lg:left-6 lg:w-auto lg:pb-0">
            <InterruptorTema />
            <span className="lg:hidden"><Logo /></span>
          </div>
          <div key={pathname} className="vista flex w-full max-w-[400px] flex-col gap-5">
            <Outlet />
          </div>
        </div>
        <div className="tinta @container m-4 hidden flex-1 flex-col overflow-hidden rounded-card bg-tinta text-card lg:flex">
          {/* Franja de 88 px (la misma de antes): el nombre crece con el ancho del panel hasta el alto que permite la franja. */}
          <div className="flex h-[88px] flex-none items-center px-10">
            <span className="entra flex items-center gap-[0.26em] font-display text-[clamp(1.5rem,calc((100cqw-80px)/7.4),3.5rem)] leading-none font-bold tracking-[-0.035em] whitespace-nowrap">
              <Isotipo size={96} className="h-[0.8em] w-auto flex-none" />
              SmartTraffic
            </span>
          </div>
          <div className="relative min-h-0 flex-1">
            <svg viewBox="0 0 640 520" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Ilustración: calle de Caracas al atardecer" className="absolute inset-0 block h-full w-full">
              <defs>
                <linearGradient id="atardecer" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#0E1726" />
                  <stop offset=".36" stopColor="#2A1A2C" />
                  <stop offset=".56" stopColor="#7C2D12" />
                  <stop offset=".72" stopColor="#C2410C" />
                  <stop offset=".86" stopColor="#F97316" />
                  <stop offset="1" stopColor="#FDBA74" />
                </linearGradient>
                <radialGradient id="sol" cx=".42" cy=".38" r=".62">
                  <stop offset="0" stopColor="#FFF4D1" />
                  <stop offset=".45" stopColor="#FDBA4D" />
                  <stop offset=".82" stopColor="#F97316" />
                  <stop offset="1" stopColor="#EA580C" />
                </radialGradient>
                <radialGradient id="halo">
                  <stop offset="0" stopColor="#FDBA4D" stopOpacity=".55" />
                  <stop offset=".45" stopColor="#F97316" stopOpacity=".22" />
                  <stop offset="1" stopColor="#F97316" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="edificio" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#1C2231" />
                  <stop offset="1" stopColor="#0C1018" />
                </linearGradient>
                <linearGradient id="bruma" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#F97316" stopOpacity="0" />
                  <stop offset="1" stopColor="#F97316" stopOpacity=".16" />
                </linearGradient>
                <linearGradient id="asfalto" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#5A5B5F" />
                  <stop offset="1" stopColor="#34363A" />
                </linearGradient>
                {/* Grano muy suave para que el cielo no se vea plano. */}
                <filter id="grano" x="0" y="0" width="100%" height="100%">
                  <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch" />
                  <feColorMatrix values="0 0 0 0 1  0 0 0 0 .9  0 0 0 0 .8  0 0 0 .55 0" />
                </filter>
              </defs>
              <rect width="640" height="520" fill="url(#atardecer)" />
              <rect width="640" height="360" filter="url(#grano)" opacity=".07" />
              {/* Sol a la izquierda del centro, con halo y dos vetas de nubes encendidas. */}
              <circle cx={SOL.x} cy={SOL.y} r="150" fill="url(#halo)" />
              <circle cx={SOL.x} cy={SOL.y} r="50" fill="url(#sol)" />
              <ellipse cx="230" cy="262" rx="130" ry="2" fill="#FDBA74" opacity=".22" />
              <ellipse cx="400" cy="240" rx="90" ry="1.5" fill="#F97316" opacity=".2" />
              <path d="M0 360 V250 H40 V210 H90 V280 H130 V190 H175 V300 H220 V240 H260 V320 H300 V360 Z" fill="url(#edificio)" />
              <path d="M640 360 V220 H600 V170 H560 V260 H520 V200 H480 V300 H450 V250 H410 V330 H380 V360 Z" fill="url(#edificio)" />
              {/* Luz del sol en el canto de cada edificio que lo mira; el otro lado queda en sombra. */}
              <g fill="#F97316" opacity=".4">
                {EDIFICIOS.map(([x0, x1, techo]) => <rect key={x0} x={x1 <= SOL.x ? x1 - 3 : x0} y={techo} width="3" height={360 - techo} />)}
              </g>
              <g fill="#05070B" opacity=".35">
                {EDIFICIOS.map(([x0, x1, techo]) => <rect key={x0} x={x1 <= SOL.x ? x0 : x1 - 8} y={techo} width="8" height={360 - techo} />)}
              </g>
              <rect y="280" width="640" height="80" fill="url(#bruma)" />
              <g fill="#F4F1E6" opacity=".8">
                {VENTANAS.map((w) => <rect key={`${w.x}-${w.y}`} x={w.x} y={w.y} width="4" height="6" rx=".6" />)}
              </g>
              <rect x="0" y="360" width="640" height="160" fill="#14161A" />
              {/* Asfalto gris, un poco más claro hacia el horizonte; marcas viales blancas. */}
              <polygon points="290,360 350,360 640,520 0,520" fill="url(#asfalto)" />
              <ellipse cx="318" cy="364" rx="34" ry="4" fill="#FDBA74" opacity=".35" />
              <path d="M320 380 L320 520" stroke="#E4E1D8" strokeWidth="4" strokeDasharray="18 14" opacity=".75" />
              <path d="M40 470 C200 430 300 400 330 372" stroke="#C6F24E" strokeWidth="3" fill="none" opacity=".75" />
              <path d="M600 500 C450 450 360 410 335 372" stroke="#C8281C" strokeWidth="3" fill="none" opacity=".8" />
              {/* Dos carros: uno se aleja por el carril derecho (luces traseras) y otro viene por el izquierdo (faros). Origen = centro de las ruedas. */}
              <g className="carro-se-aleja">
                <rect x="-46" y="-40" width="92" height="34" rx="9" fill="#0B0F17" />
                <path d="M-34 -40 L-24 -58 H24 L34 -40 Z" fill="#0B0F17" />
                <path d="M-27 -42 L-20 -54 H20 L27 -42 Z" fill="#1E2736" />
                <rect x="-42" y="-30" width="18" height="7" rx="3" fill="#E5483B" />
                <rect x="24" y="-30" width="18" height="7" rx="3" fill="#E5483B" />
                <rect x="-14" y="-24" width="28" height="9" rx="1.5" fill="#E8E6E0" opacity=".85" />
                <rect x="-40" y="-8" width="14" height="8" rx="2" fill="#05070B" />
                <rect x="26" y="-8" width="14" height="8" rx="2" fill="#05070B" />
              </g>
              <g className="carro-se-acerca">
                <ellipse cx="0" cy="10" rx="78" ry="16" fill="#F5E9B8" opacity=".12" />
                <rect x="-46" y="-40" width="92" height="34" rx="9" fill="#0B0F17" />
                <path d="M-34 -40 L-24 -58 H24 L34 -40 Z" fill="#0B0F17" />
                <path d="M-27 -42 L-20 -54 H20 L27 -42 Z" fill="#2A3446" />
                <ellipse cx="-31" cy="-24" rx="10" ry="5" fill="#FFF4CC" />
                <ellipse cx="31" cy="-24" rx="10" ry="5" fill="#FFF4CC" />
                <rect x="-18" y="-20" width="36" height="6" rx="2" fill="#151C28" />
                <rect x="-40" y="-8" width="14" height="8" rx="2" fill="#05070B" />
                <rect x="26" y="-8" width="14" height="8" rx="2" fill="#05070B" />
              </g>
              {/* Semáforo en gris metálico con filo claro, para que se separe de los edificios. */}
              <rect x="470" y="230" width="6" height="140" fill="#4B5059" />
              <rect x="458" y="196" width="30" height="66" rx="8" fill="#3A3F47" stroke="#6B717C" strokeWidth="1.5" />
              {/* Semáforo: focos apagados y encima cada luz encendida, que se turna verde → amarillo → rojo (9,2 s). */}
              <circle cx="473" cy="209" r="8" fill="#1A1D22" />
              <circle cx="473" cy="229" r="8" fill="#1A1D22" />
              <circle cx="473" cy="249" r="8" fill="#1A1D22" />
              <circle className="luz-roja" cx="473" cy="209" r="8" fill="#E5483B" />
              <circle className="luz-ambar" cx="473" cy="229" r="8" fill="#F5A524" />
              <circle className="luz-verde" cx="473" cy="249" r="8" fill="#3DD68C" />
            </svg>
          </div>
          <div className="px-10 pt-8 pb-10">
            <span className="font-display text-display font-bold tracking-[-0.02em]">{LEMA}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Pasos del registro: barra superior de 3 px, tinta hasta el paso actual. */
export function Pasos({ actual }: { actual: 1 | 2 | 3 }) {
  return (
    <ol aria-label="Pasos" className="grid grid-cols-3 gap-1.5 text-caption font-semibold">
      {['Datos', 'Código', 'Listo'].map((p, i) => (
        <li key={p} aria-current={i + 1 === actual ? 'step' : undefined} className={i < actual ? 'border-t-[3px] border-tinta pt-2' : 'border-t-[3px] border-borde pt-2 text-texto-2'}>
          {i + 1} · {p}
        </li>
      ))}
    </ol>
  )
}
