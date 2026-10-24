import type { FineStatus, LightState } from '@contracts'
import { ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatBs } from '@/lib/format.ts'
import { ESTADO, LUZ } from '@/lib/etiquetas.ts'
import { cx } from '@/components/ui/estilos.ts'
import { EST } from './estados.ts'

/** Franja discreta, siempre visible. */
export function DemoBanner() {
  return (
    <div role="note" className="flex h-7 flex-none items-center justify-center gap-2 border-b border-borde bg-suave text-caption text-texto-2">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-ambar" />
      Demo · datos ficticios · pagos simulados
    </div>
  )
}

/** Marca: escudo con check, lima sobre tinta (o tinta sobre lima). */
export function Logo({ claro = false }: { claro?: boolean }) {
  return (
    <span className="flex items-center gap-2.5 font-semibold">
      <span className={cx('flex size-8 items-center justify-center rounded-[10px]', claro ? 'bg-brand text-tinta' : 'tinta bg-tinta text-brand')}>
        <ShieldCheck size={18} strokeWidth={1.75} aria-hidden="true" />
      </span>
      SmartTraffic
    </span>
  )
}

export function EstadoBadge({ status, className }: { status: FineStatus; className?: string }) {
  const { cls, Icono } = EST[status]
  return (
    <span className={cx('inline-flex h-6 items-center gap-[5px] rounded-full px-[9px] text-xs font-semibold tracking-[.02em] whitespace-nowrap transition-colors duration-200', cls, className)}>
      <Icono size={12} strokeWidth={2.25} aria-hidden="true" />
      {ESTADO[status]}
    </span>
  )
}

/** Tile de 40 px tintado según el estado (listas). */
export function EstadoTile({ status }: { status: FineStatus }) {
  const { cls, Icono } = EST[status]
  return (
    <span className={cx('flex size-10 flex-none items-center justify-center rounded-control', cls)}>
      <Icono size={20} strokeWidth={1.75} aria-hidden="true" />
    </span>
  )
}

export function Monto({ cents, anulada, className }: { cents: number; anulada?: boolean; className?: string }) {
  return <span className={cx('num font-mono font-bold whitespace-nowrap', anulada && 'text-texto-2 line-through', className)}>{formatBs(cents)}</span>
}

/** Placa venezolana estilizada: borde tinta 2 px, "VENEZUELA" en 9 px, JetBrains Mono 700. Sin escudos. */
export function Placa({ value, size = 'md' }: { value: string; size?: 'sm' | 'md' | 'lg' }) {
  const t = { sm: 'text-[22px] leading-[26px] px-3', md: 'text-[26px] leading-[30px] px-3.5', lg: 'text-[30px] leading-[34px] px-4' }[size]
  return (
    <span aria-label={`Placa ${value}`} className={cx('inline-flex flex-none flex-col items-center rounded-placa border-2 border-tinta bg-card pt-1 pb-1.5', t)}>
      <span aria-hidden="true" className="text-[9px] leading-[10px] font-semibold tracking-[.24em]">VENEZUELA</span>
      <span aria-hidden="true" className="font-mono font-bold tracking-[.08em]">{value}</span>
    </span>
  )
}

/** Chip de placa para filas (22 px) o detalle (26 px). */
export function PlacaChip({ value, grande }: { value: string; grande?: boolean }) {
  return (
    <span className={cx('inline-flex items-center rounded-placa border-tinta font-mono font-bold tracking-[.04em] text-tinta', grande ? 'h-[26px] border-2 px-2' : 'h-[22px] border-[1.5px] px-1.5 text-xs')}>
      {value}
    </span>
  )
}

const LUZ_CLS: Record<LightState, [string, string]> = {
  RED: ['bg-rojo-bg text-rojo-osc', 'bg-rojo'],
  GREEN: ['bg-verde-bg text-verde-osc', 'bg-verde'],
  YELLOW: ['bg-ambar-bg text-ambar-osc', 'bg-ambar'],
  UNKNOWN: ['bg-gris-bg text-texto-2', 'bg-input'],
}

/** Estado del semáforo en pastilla: punto de color + texto. */
export function SemaforoMini({ luz }: { luz: LightState | null }) {
  const [cls, punto] = LUZ_CLS[luz ?? 'UNKNOWN']
  return (
    <span className={cx('inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap', cls)}>
      <span aria-hidden="true" className={cx('size-2 rounded-full', punto)} />
      {luz ? LUZ[luz] : 'SIN SEÑAL'}
    </span>
  )
}

const FOCO: Record<LightState, [string, string, string]> = {
  RED: ['#C8281C', '#2A3446', '#2A3446'],
  YELLOW: ['#2A3446', '#F5A524', '#2A3446'],
  GREEN: ['#2A3446', '#2A3446', '#12723A'],
  UNKNOWN: ['#2A3446', '#2A3446', '#2A3446'],
}

/**
 * Marcador SVG de un fotograma de cruce (no es foto real). `carro` es el transform del vehículo;
 * con `placa` dibuja la placa y el recuadro de detección, con `lineaPare` la línea de pare en rojo.
 */
export function Fotograma({ luz, carro, colorCarro = '#9198A2', placa, lineaPare, alt, className }: {
  luz: LightState
  carro: string
  colorCarro?: string
  placa?: string
  lineaPare?: boolean
  alt: string
  className?: string
}) {
  const [l1, l2, l3] = FOCO[luz]
  return (
    <svg viewBox="0 0 320 180" className={cx('block h-full w-full', className)} role="img" aria-label={alt}>
      <rect width="320" height="180" fill="#8A929C" />
      <rect x="0" y="12" width="74" height="46" fill="#7A828D" />
      <rect x="226" y="4" width="94" height="54" fill="#747C87" />
      <polygon points="0,58 122,58 0,180" fill="#ABA69C" />
      <polygon points="198,58 320,58 320,180" fill="#ABA69C" />
      <polygon points="122,58 198,58 320,180 0,180" fill="#4B525C" />
      <line x1="160" y1="60" x2="160" y2="180" stroke="#E8E6E0" strokeWidth="2" strokeDasharray="10 9" />
      <polygon points="66,116 254,116 262,124 58,124" fill="#ECEAE4" />
      {lineaPare && <line x1="40" y1="120" x2="280" y2="120" stroke="#C8281C" strokeWidth="2.5" strokeDasharray="8 5" />}
      <rect x="282" y="10" width="3" height="56" fill="#2B3A55" />
      <rect x="287" y="8" width="16" height="40" rx="3" fill="#0E1726" />
      <circle cx="295" cy="16" r="4.5" fill={l1} />
      <circle cx="295" cy="28" r="4.5" fill={l2} />
      <circle cx="295" cy="40" r="4.5" fill={l3} />
      <g transform={carro}>
        <rect x="0" y="22" width="84" height="34" rx="6" fill={colorCarro} />
        <path d="M12 22 L20 4 H64 L72 22 Z" fill="#7D848F" />
        <path d="M19 20 L24.5 8 H59.5 L65 20 Z" fill="#3E4652" />
        {placa && (
          <>
            <rect x="4" y="30" width="15" height="6" rx="1.5" fill="#A8323A" />
            <rect x="65" y="30" width="15" height="6" rx="1.5" fill="#A8323A" />
            <rect x="26" y="38" width="32" height="12" rx="1.5" fill="#FFFFFF" stroke="#0E1726" strokeWidth=".8" />
            <text x="42" y="47" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="7" fontWeight="700" fill="#0E1726">{placa}</text>
            <rect x="-4" y="0" width="92" height="64" fill="none" stroke="#FFFFFF" strokeWidth="1.2" strokeDasharray="3 2" />
          </>
        )}
        <rect x="6" y="55" width="14" height="6" rx="2" fill="#1E242C" />
        <rect x="64" y="55" width="14" height="6" rx="2" fill="#1E242C" />
      </g>
    </svg>
  )
}

/** Pastilla tinta sobre fotos (EN VIVO, ROJO · hora, código de cámara). */
export function PastillaTinta({ children, punto, className }: { children: ReactNode; punto?: string; className?: string }) {
  return (
    <span className={cx('tinta absolute top-2.5 inline-flex h-[26px] items-center gap-1.5 rounded-full bg-tinta px-2.5 text-xs font-semibold text-card', className)}>
      {punto && <span aria-hidden="true" className={cx('rounded-full', punto)} />}
      {children}
    </span>
  )
}
