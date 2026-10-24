import { Outlet, useLocation } from 'react-router'
import { InterruptorTema } from '@/components/ui/index.tsx'
import { Logo } from '@/components/vc/index.tsx'

const LEMA = 'La multa llega con la prueba, y se paga en un minuto.'

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
        <div className="tinta m-4 hidden flex-1 flex-col overflow-hidden rounded-card bg-tinta text-card lg:flex">
          <div className="px-10 py-8"><Logo claro /></div>
          <div className="relative min-h-0 flex-1">
            <svg viewBox="0 0 640 520" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Ilustración: calle de Caracas al atardecer" className="absolute inset-0 block h-full w-full">
              <defs>
                <linearGradient id="atardecer" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#0E1726" />
                  <stop offset=".55" stopColor="#7A4300" />
                  <stop offset=".8" stopColor="#F5A524" />
                </linearGradient>
              </defs>
              <rect width="640" height="520" fill="url(#atardecer)" />
              <circle cx="420" cy="330" r="46" fill="#F5A524" opacity=".7" />
              <path d="M0 360 V250 H40 V210 H90 V280 H130 V190 H175 V300 H220 V240 H260 V320 H300 V360 Z" fill="#151C28" />
              <path d="M640 360 V220 H600 V170 H560 V260 H520 V200 H480 V300 H450 V250 H410 V330 H380 V360 Z" fill="#151C28" />
              <rect x="0" y="360" width="640" height="160" fill="#0E1726" />
              <polygon points="290,360 350,360 640,520 0,520" fill="#151C28" />
              <path d="M320 380 L320 520" stroke="#2A3446" strokeWidth="4" strokeDasharray="18 14" />
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
              <rect x="470" y="230" width="6" height="140" fill="#151C28" />
              <rect x="458" y="196" width="30" height="66" rx="8" fill="#0E1726" />
              <circle cx="473" cy="212" r="8" fill="#C8281C" />
              <circle cx="473" cy="232" r="8" fill="#2A3446" />
              <circle cx="473" cy="252" r="8" fill="#2A3446" />
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
