import { WifiOff } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { DemoError, getCamaras, type Camara } from '@/lib/demo/api.ts'
import { formatHora, formatHoraSeg } from '@/lib/format.ts'
import { cx, tarjeta } from '@/components/ui/estilos.ts'
import { ErrorCarga, Titulo } from '@/components/cuenta/piezas.tsx'
import { Fotograma, PastillaTinta, SemaforoMini } from '@/components/vc/index.tsx'

const REFRESCO_MS = 4000
const POSES = ['translate(190,96) scale(.95)', 'translate(176,62) scale(.8)', 'translate(60,90) scale(.85)']
const COLORES = ['#9198A2', '#B9BEC6', '#6E7682']

// ≥1024 la cuadrícula ocupa el alto de <main>: 2 columnas hasta 4 cámaras, 3 si hay más; las filas se reparten el alto.
const cuadricula = 'grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))] lg:grid-rows-[repeat(var(--filas),minmax(0,1fr))]'
const medidas = (n: number) => { const cols = n > 4 ? 3 : 2; return { '--cols': cols, '--filas': Math.max(1, Math.ceil(n / cols)) } as CSSProperties }

/** Último fotograma de cada cámara pública, cada 4 s con fundido de 120 ms. No es video. Sin scroll en escritorio. */
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
    <div className="flex flex-col gap-4 px-4 pt-4 pb-6 lg:absolute lg:inset-0 lg:min-h-[480px] lg:overflow-x-clip lg:px-0 lg:pt-0 lg:pb-0">
      <Titulo despues="Último fotograma de cada cámara pública, cada 4 s. No es video.">Cámaras en vivo</Titulo>
      {error && error.code !== 'SESION' && !camaras && <ErrorCarga titulo="No pudimos conectar con las cámaras" texto="Revise su conexión e intente de nuevo." onReintentar={() => setVuelta((v) => v + 1)} />}
      {!camaras && !error && <div aria-busy="true" aria-label="Cargando cámaras" className={cuadricula} style={medidas(4)}>{[0, 1, 2, 3].map((i) => <span key={i} className="sk aspect-video rounded-card lg:aspect-auto" />)}</div>}
      {camaras && (
        <div className={cuadricula} style={medidas(camaras.length)}>
          {camaras.map((c, i) => (
            <article key={c.code} className={cx(tarjeta, 'entra flex min-h-0 flex-col overflow-hidden')} style={{ '--i': i } as CSSProperties}>
              <div className={cx('relative aspect-video lg:aspect-auto lg:min-h-0 lg:flex-1', c.light ? 'bg-[#8A929C]' : 'bg-tinta-2')}>
                {c.light ? (
                  <>
                    <Fotograma
                      key={c.frame}
                      className="animate-fundido absolute inset-0"
                      luz={c.light}
                      carro={POSES[c.frame % 3] ?? ''}
                      colorCarro={COLORES[c.frame % 3]}
                      alt={`Último fotograma de ${c.code} a las ${formatHoraSeg(c.capturedAt)}`}
                    />
                    <PastillaTinta className="left-2.5" punto="size-1.5 bg-brand">EN VIVO · <span className="font-mono">{formatHoraSeg(c.capturedAt)}</span></PastillaTinta>
                  </>
                ) : (
                  <div className="tinta absolute inset-0 flex flex-col items-center justify-center gap-2 text-card">
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
    </div>
  )
}
