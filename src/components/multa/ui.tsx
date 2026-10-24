// Piezas visuales de /multa y /pagar. Provisionales hasta que P4 publique src/components/vc
// (DemoBanner, EstadoBadge, Evidencia, Placa, Monto) y los tokens en src/index.css: los colores
// son los de docs/05 §2, escritos como valores de Tailwind para no tocar archivos de P4.
import { useState, type ReactNode } from 'react'
import type { FinePublicDTO, LightState } from '@contracts'
import { formatTime, type StatusTone } from './format.ts'
import type { Source } from './api.ts'

export const MONO = 'font-mono tabular-nums whitespace-nowrap'

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F4F1EA] text-[15px] leading-[1.45] text-[#14213D]">
      <DemoBanner />
      <header className="border-b border-[#D9D4C7] bg-[#14213D] text-white">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <span className="text-[18px] font-bold tracking-tight">VíaClara</span>
          <span className="text-[13px] text-white/75">Aviso de infracción de tránsito</span>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-16 pt-6">{children}</main>
    </div>
  )
}

/** Visible en toda pantalla de pago (AGENTS.md §2.2). */
export function DemoBanner() {
  return (
    <div role="note" className="border-b border-[#E09F1F] bg-[#FBEFD3] px-4 py-2 text-center text-[13px] font-semibold text-[#14213D]">
      Demo — pago simulado · datos ficticios · sin dinero real
    </div>
  )
}

export function SourceNote({ source }: { source: Source }) {
  if (source === 'api') return null
  return (
    <p className="mb-4 rounded-[6px] border border-dashed border-[#5B6B85] px-3 py-2 text-[13px] text-[#2B3A55]">
      Datos de ejemplo: el servidor todavía no responde, así que se muestra una multa ficticia.
    </p>
  )
}

const TONES: Record<StatusTone, string> = {
  red: 'border-[#D62828] bg-[#FBE7E7] text-[#A61B1B]',
  amber: 'border-[#E09F1F] bg-[#FBEFD3] text-[#7A5410]',
  green: 'border-[#2D7D46] bg-[#E3F1E7] text-[#22603A]',
  gray: 'border-[#5B6B85] bg-[#ECEEF2] text-[#2B3A55]',
  blue: 'border-[#1F5FAD] bg-[#E4EDF8] text-[#1F5FAD]',
}

export function StatusBadge({ text, tone }: { text: string; tone: StatusTone }) {
  return (
    <span className={`inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[13px] font-semibold uppercase tracking-wide ${TONES[tone]}`}>
      {text}
    </span>
  )
}

export function Plate({ value }: { value: string }) {
  return (
    <span
      aria-label={`Placa ${value.replace(/\*/g, ' oculto ')}`}
      className={`${MONO} inline-block rounded-[6px] border-2 border-[#14213D] bg-white px-3 py-1 text-[18px] font-bold tracking-[0.2em]`}
    >
      {value}
    </span>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[10px] border border-[#D9D4C7] bg-white p-4 shadow-[0_1px_0_rgba(20,33,61,.08)] ${className}`}>{children}</section>
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[#D9D4C7] py-2 last:border-b-0">
      <dt className="text-[13px] text-[#5B6B85]">{label}</dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  )
}

const LIGHT_LABEL: Record<LightState, { text: string; dot: string }> = {
  RED: { text: 'Luz roja', dot: 'bg-[#D62828]' },
  YELLOW: { text: 'Luz amarilla', dot: 'bg-[#E09F1F]' },
  GREEN: { text: 'Luz verde', dot: 'bg-[#2D7D46]' },
  UNKNOWN: { text: 'Luz desconocida', dot: 'bg-[#5B6B85]' },
}

const KIND_LABEL: Record<string, string> = {
  FRAME: 'Fotograma',
  PLATE_CROP: 'Recorte de placa',
  ANNOTATED: 'Fotograma anotado',
  CLIP: 'Video',
}

function EvidenceItem({ item, label }: { item: FinePublicDTO['evidence'][number]; label: string }) {
  const [broken, setBroken] = useState(false)
  const light = item.lightState ? LIGHT_LABEL[item.lightState] : null
  return (
    <figure className="overflow-hidden rounded-[6px] border border-[#D9D4C7] bg-[#14213D]">
      <div className="relative aspect-video">
        {item.url && !broken ? (
          <img src={item.url} alt={label} loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[repeating-linear-gradient(135deg,#2B3A55_0,#2B3A55_10px,#253350_10px,#253350_20px)] text-[13px] text-white/70">
            {item.url ? 'Imagen no disponible' : `${label} (ejemplo)`}
          </div>
        )}
        <span className={`${MONO} absolute left-2 top-2 rounded-[6px] bg-black/70 px-2 py-0.5 text-[13px] text-white`}>
          {formatTime(item.capturedAt)}
        </span>
        {light && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-[6px] bg-black/70 px-2 py-0.5 text-[13px] text-white">
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${light.dot}`} />
            {light.text}
          </span>
        )}
      </div>
      <figcaption className="bg-white px-3 py-1.5 text-[13px] text-[#2B3A55]">{label}</figcaption>
    </figure>
  )
}

export function Evidence({ items }: { items: FinePublicDTO['evidence'] }) {
  const visual = items.filter((e) => e.kind !== 'CLIP')
  if (visual.length === 0) return <p className="text-[13px] text-[#5B6B85]">Esta multa no tiene imágenes adjuntas.</p>
  // numeración por tipo: "Fotograma 1", "Fotograma 2", "Recorte de placa" (sin número si es único)
  const totals = new Map<string, number>()
  for (const item of visual) totals.set(item.kind, (totals.get(item.kind) ?? 0) + 1)
  const seen = new Map<string, number>()
  return (
    <div className="grid gap-3">
      {visual.map((item, i) => {
        const n = (seen.get(item.kind) ?? 0) + 1
        seen.set(item.kind, n)
        const name = KIND_LABEL[item.kind] ?? 'Evidencia'
        const label = (totals.get(item.kind) ?? 0) > 1 ? `${name} ${n}` : name
        return <EvidenceItem key={`${item.kind}-${item.capturedAt}-${i}`} item={item} label={label} />
      })}
    </div>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
      {label}
    </span>
  )
}

export function LoadingFine() {
  return (
    <div aria-busy="true" className="grid gap-4">
      <span className="sr-only">Cargando la multa…</span>
      {[40, 180, 120].map((h) => (
        <div key={h} style={{ height: h }} className="animate-pulse rounded-[10px] bg-[#E6E1D6]" />
      ))}
    </div>
  )
}

export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h1 className="text-[22px] font-bold leading-[1.15]">{title}</h1>
      <div className="mt-2 text-[#2B3A55]">{children}</div>
    </Card>
  )
}
