import { WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DemoError, getCamaras, type Camara } from '@/lib/demo/api.ts'
import { formatHora, formatHoraSeg } from '@/lib/format.ts'
import { cx, tarjeta } from '@/components/ui/estilos.ts'
import { ErrorCarga, Pagina, Titulo } from '@/components/cuenta/piezas.tsx'
import { Fotograma, PastillaTinta, SemaforoMini } from '@/components/vc/index.tsx'

const REFRESCO_MS = 4000
const POSES = ['translate(190,96) scale(.95)', 'translate(176,62) scale(.8)', 'translate(60,90) scale(.85)']
const COLORES = ['#9198A2', '#B9BEC6', '#6E7682']

/** Último fotograma de cada cámara pública, cada 4 s con fundido de 120 ms. No es video. */
export default function EnVivo() {
  const [camaras, setCamaras] = useState<Camara[] | null>(null)
  const [error, setError] = useState<DemoError | null>(null)
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    let vivo = true
    const traer = () => {
      if (document.hidden) return
      getCamaras().then(
        (c) => { if (vivo) { setCamaras(c); setError(null) } },
        (e: unknown) => { if (vivo) setError(e instanceof DemoError ? e : new DemoError('RED')) },
      )
    }
    traer()
    const t = setInterval(traer, REFRESCO_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [vuelta])

  return (
    <Pagina>
      <Titulo despues="Último fotograma de cada cámara pública, cada 4 s. No es video.">Cámaras en vivo</Titulo>
      {error && error.code !== 'SESION' && !camaras && <ErrorCarga titulo="No pudimos conectar con las cámaras" texto="Revise su conexión e intente de nuevo." onReintentar={() => setVuelta((v) => v + 1)} />}
      {!camaras && !error && <div aria-busy="true" aria-label="Cargando cámaras" className="grid grid-cols-1 gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <span key={i} className="sk aspect-video rounded-card" />)}</div>}
      {camaras && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {camaras.map((c) => (
            <article key={c.code} className={cx(tarjeta, 'flex flex-col overflow-hidden')}>
              <div className="relative aspect-video bg-tinta-2">
                {c.light ? (
                  <>
                    <Fotograma
                      key={c.frame}
                      className="animate-fundido"
                      luz={c.light}
                      carro={POSES[c.frame % 3] ?? ''}
                      colorCarro={COLORES[c.frame % 3]}
                      alt={`Último fotograma de ${c.code} a las ${formatHoraSeg(c.capturedAt)}`}
                    />
                    <PastillaTinta className="left-2.5" punto="size-1.5 bg-brand">EN VIVO · <span className="font-mono">{formatHoraSeg(c.capturedAt)}</span></PastillaTinta>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#F2F5F9]">
                    <WifiOff size={28} strokeWidth={1.75} aria-hidden="true" />
                    <span className="font-semibold">Sin señal</span>
                    <span className="text-caption text-niebla">Último fotograma a las <span className="font-mono">{formatHora(c.capturedAt)}</span></span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="flex min-w-0 flex-1 flex-col"><span className="font-mono font-bold">{c.code}</span><span className="text-caption text-texto-2">{c.intersection}</span></span>
                <SemaforoMini luz={c.light} />
                <span className="flex flex-col items-end leading-[18px]">
                  <span className="font-mono font-bold">{c.detectionsToday ?? '—'}</span>
                  <span className="text-xs text-texto-2">hoy</span>
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </Pagina>
  )
}
