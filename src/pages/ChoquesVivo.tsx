import { CRASH, type CrashAlertDTO, type CrashNetworkDTO } from '@contracts'
import { Pause, Play, Siren, Smartphone, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { conReloj, reportar, verRed } from '@/lib/choques/api.ts'
import { DURACION_ONDA_MS, MUNDO, ajustarACalle, formatM, lugar, type Punto } from '@/lib/choques/sim.ts'
import { Boton, Pestanas } from '@/components/ui/index.tsx'
import { cx, tarjeta } from '@/components/ui/estilos.ts'
import { Logo, PastillaTinta } from '@/components/vc/index.tsx'
import { Pagina, Titulo, h2 } from '@/components/cuenta/piezas.tsx'
import { Cobertura } from '@/components/choques/Angulo.tsx'
import { Mapa } from '@/components/choques/Mapa.tsx'
import { adelantar, fijarDuracion, planSincronizado } from '@/components/choques/sincronizar.ts'
import { COLOR, ETIQUETA, orientacion } from '@/components/choques/estados.ts'
import { ESTADO_ALERTA, capturaDeAlerta, estadoEnVivo, incidenteDeRed, nodoDeRed } from '@/components/choques/vivo.ts'

const REFRESCO_MS = 1000
type Radio = '150' | '500' | '1000'
const RADIOS: Array<{ id: Radio; nombre: string }> = [
  { id: '150', nombre: '150 m' },
  { id: '500', nombre: '500 m' },
  { id: '1000', nombre: 'Todo el mapa' },
]

/** `Date.now()` en el reloj del servidor, refrescado cada cuadro mientras `activo` (la onda de alerta). */
function useAhora(offsetMs: number, activo: boolean) {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => {
    if (!activo) return
    let id = requestAnimationFrame(function tick() {
      setT(Date.now())
      id = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(id)
  }, [activo])
  return t + offsetMs
}

/**
 * /choques/vivo: la pantalla grande de la demo con teléfonos reales. Muestra los que tienen /choques/nodo
 * abierto, dispara choques (clic en el mapa o al azar delante de un teléfono) y junta los clips que suben.
 */
export default function ChoquesVivo() {
  const [red, setRed] = useState<CrashNetworkDTO | null>(null)
  const [offset, setOffset] = useState(0)
  const [errorRed, setErrorRed] = useState(false)
  const [radio, setRadio] = useState<Radio>(String(CRASH.DEFAULT_RADIUS_M) as Radio)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sincro, setSincro] = useState<number | null>(null)
  const [preparando, setPreparando] = useState(false)
  const videos = useRef(new Map<string, HTMLVideoElement>())
  const timers = useRef<number[]>([])
  const turno = useRef(0)

  useEffect(() => {
    let vivo = true
    const traer = () => {
      conReloj(verRed).then(
        ({ data, offsetMs }) => { if (vivo) { setRed(data); setOffset(offsetMs); setErrorRed(false) } },
        () => { if (vivo) setErrorRed(true) },
      )
    }
    traer()
    const t = setInterval(traer, REFRESCO_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [])
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), [])

  const dto = red?.incident ?? null
  const reciente = dto != null && red != null && Date.parse(red.serverNow) - Date.parse(dto.occurredAt) < DURACION_ONDA_MS + 1500
  const ahora = useAhora(offset, reciente)
  const inc = dto ? incidenteDeRed(dto) : null
  const nodos = (red?.nodes ?? []).map((n) => nodoDeRed(n, null))
  const grabando = (red?.nodes ?? []).filter((n) => n.recording)
  const link = `${window.location.origin}/choques/nodo`

  const disparar = async (p: Punto) => {
    setError(null)
    setEnviando(true)
    try {
      const punto = ajustarACalle(p)
      const r = await reportar({ x: punto.x, y: punto.y, radiusM: Number(radio) })
      setRed((prev) => (prev ? { ...prev, incident: r.incident } : prev))
      setSincro(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el choque.')
    } finally {
      setEnviando(false)
    }
  }

  /** Choque 18 m delante de un teléfono que graba, para que al menos ese lo tenga de frente. */
  const alAzar = () => {
    const n = grabando[Math.floor(Math.random() * grabando.length)]
    if (!n) return
    const a = (n.heading * Math.PI) / 180
    void disparar({ x: Math.min(MUNDO.ancho, Math.max(0, n.x + 18 * Math.cos(a))), y: Math.min(MUNDO.alto, Math.max(0, n.y + 18 * Math.sin(a))) })
  }

  const listas = (dto?.alerts ?? []).filter((a) => a.status === 'UPLOADED' && a.clipT0S != null)

  const detener = () => {
    timers.current.forEach((t) => clearTimeout(t))
    timers.current = []
    videos.current.forEach((v) => v.pause())
    setSincro(null)
  }

  /**
   * Adelanta cada clip al mismo instante antes del choque (lo que todos tienen en común, hasta T−10 s) y los arranca
   * juntos. Si algún video no se deja adelantar, cae al plan B: todos desde el inicio, cada uno con el retraso que
   * alinea su choque con el de los demás.
   */
  const reproducirSincronizado = async () => {
    detener()
    setPreparando(true)
    const clips = listas.flatMap((a) => {
      const v = videos.current.get(a.id)
      return v ? [{ v, t0: a.clipT0S ?? 0 }] : []
    })
    const { previoS, iniciosS } = planSincronizado(clips.map((c) => c.t0), CRASH.PRE_MS / 1000)
    const adelantados = await Promise.all(clips.map((c, i) => adelantar(c.v, iniciosS[i] ?? 0)))
    const inicio = ++turno.current
    if (adelantados.every(Boolean)) {
      clips.forEach((c) => { void c.v.play().catch(() => undefined) })
    } else {
      const m = Math.max(...clips.map((c) => c.t0))
      for (const c of clips) {
        c.v.currentTime = 0
        timers.current.push(window.setTimeout(() => { void c.v.play().catch(() => undefined) }, (m - c.t0) * 1000))
      }
    }
    setPreparando(false)
    setSincro(inicio)
    const finS = adelantados.every(Boolean) ? previoS : Math.max(...clips.map((c) => c.t0))
    timers.current.push(window.setTimeout(() => setSincro((s) => (s === inicio ? null : s)), (finS + CRASH.POST_MS / 1000 + 1) * 1000))
  }

  const cuenta = (s: CrashAlertDTO['status']) => (dto?.alerts ?? []).filter((a) => a.status === s).length

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="tinta flex h-14 flex-none items-center gap-3 bg-tinta px-4 text-card lg:px-12">
        <Logo claro />
        <span className="hidden text-niebla sm:inline">/ Red de choques</span>
        <span className="ml-auto inline-flex h-[26px] items-center gap-1.5 rounded-full bg-tinta-3 px-2.5 text-xs font-semibold">
          <span aria-hidden="true" className={cx('size-1.5 rounded-full', errorRed ? 'bg-ambar' : 'bg-brand')} />{errorRed ? 'Reconectando' : 'En vivo'}
        </span>
      </header>

      <Pagina>
        <Titulo despues="Teléfonos reales grabando en buffer. Ante un choque, los que están en el radio suben lo que grabaron de ese momento.">
          Red de choques en vivo
        </Titulo>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
          <section aria-label="Mapa de la red" className="tinta flex flex-col self-start overflow-hidden rounded-card bg-tinta">
            <Mapa
              nodos={nodos}
              incidente={inc}
              ahora={ahora}
              estadoDe={(id) => estadoEnVivo(dto, id)}
              onClic={(p) => void disparar(p)}
              etiquetarTodos
              etiqueta="Mapa de la red en vivo: haga clic en una calle para provocar un choque ahí"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-xs text-niebla">
              {(['GRABANDO', 'EN_CAMINO', 'CAPTURANDO', 'LISTO', 'PERDIDO'] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full" style={{ background: COLOR[s] }} />{ETIQUETA[s]}</span>
              ))}
              <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-full border border-dashed border-texto-3" />Sin cámara</span>
              <span className="ml-auto hidden sm:inline">Clic en una calle = choque ahí</span>
            </div>
          </section>

          <aside className="flex flex-col gap-4 self-start">
            <div className="tinta flex flex-col gap-2 rounded-card bg-tinta p-4 text-card">
              <span className="flex items-center gap-2 text-sm font-semibold"><Smartphone size={16} strokeWidth={2} aria-hidden="true" />Únase desde su celular</span>
              <span className="font-mono text-[15px] font-bold break-all text-brand">{link.replace(/^https?:\/\//, '')}</span>
              <span className="text-caption text-niebla">Active la cámara, apunte a la calle y elija su punto en el mapa.</span>
            </div>

            <div className={cx(tarjeta, 'flex flex-col gap-4 p-4')}>
              <Boton variante="pay" onClick={alAzar} disabled={enviando || grabando.length === 0}>
                <Siren size={18} strokeWidth={2} aria-hidden="true" />Simular choque
              </Boton>
              <p className="-mt-2 text-caption text-texto-2">
                {grabando.length === 0 ? 'Espere a que al menos un teléfono esté grabando.' : 'Ocurre delante de un teléfono al azar. También puede hacer clic en el mapa.'}
              </p>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Radio de alerta</span>
                <Pestanas etiqueta="Radio de alerta" opciones={RADIOS} valor={radio} onCambio={setRadio} />
              </div>
              {error && <p role="alert" className="text-caption text-rojo-osc">{error}</p>}
            </div>

            <div className={cx(tarjeta, 'flex flex-col gap-2 p-4')}>
              <span className="text-sm font-semibold">Teléfonos en la red <span className="font-mono text-texto-2">{red?.nodes.length ?? 0}</span></span>
              {(red?.nodes.length ?? 0) === 0 ? (
                <p className="text-caption text-texto-2">Nadie todavía. Abra el enlace en uno o más celulares.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {red?.nodes.map((n) => {
                    const s = n.recording ? estadoEnVivo(dto, n.id) : null
                    return (
                      <li key={n.id} className="flex items-center gap-2 text-sm">
                        <span aria-hidden="true" className="size-2 flex-none rounded-full" style={{ background: s ? COLOR[s] : '#667085' }} />
                        <span className="min-w-0 flex-1 truncate font-semibold">{n.name}</span>
                        <span className="text-caption text-texto-2">{s ? ETIQUETA[s] : 'Sin cámara'}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </aside>
        </div>

        {dto && inc && (
          <section aria-label={`Ángulos del incidente ${inc.id}`} className="flex flex-col gap-4">
            <div className="tinta flex flex-col gap-4 rounded-card bg-tinta p-5 text-card sm:flex-row sm:items-center">
              <Cobertura pos={inc.pos} listos={listas.map((a) => capturaDeAlerta(a, inc.pos, dto.reporterId))} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-mono text-sm text-niebla">{inc.id} · {lugar(inc.pos)}</span>
                <h2 className={h2}>
                  {dto.alerts.length === 0
                    ? 'Ningún teléfono grabando en el radio'
                    : `${listas.length} de ${dto.alerts.length} ${dto.alerts.length === 1 ? 'clip' : 'clips'} recibidos`}
                </h2>
                <span className="text-sm text-niebla">
                  {cuenta('PENDING')} en camino · {cuenta('CAPTURING')} capturando · {cuenta('UPLOADED')} listos · {cuenta('MISSED')} perdidos
                </span>
              </div>
              <button
                type="button"
                className="press inline-flex h-12 flex-none items-center justify-center gap-2 rounded-control bg-brand px-5 font-semibold text-tinta disabled:opacity-40"
                disabled={listas.length === 0 || preparando}
                onClick={sincro == null ? () => void reproducirSincronizado() : detener}
              >
                {sincro == null ? <Play size={16} strokeWidth={2} aria-hidden="true" /> : <Pause size={16} strokeWidth={2} aria-hidden="true" />}
                {preparando ? 'Preparando…' : sincro == null ? 'Ver todos sincronizados' : 'Detener'}
              </button>
            </div>

            {dto.alerts.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {dto.alerts.map((a, i) => (
                  <ClipCard
                    key={a.id}
                    a={a}
                    i={i}
                    reportero={a.nodeId === dto.reporterId}
                    anguloRel={capturaDeAlerta(a, inc.pos, dto.reporterId).anguloRel}
                    enCuadro={capturaDeAlerta(a, inc.pos, dto.reporterId).enCuadro}
                    registrar={(v) => { if (v) videos.current.set(a.id, v); else videos.current.delete(a.id) }}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </Pagina>
    </div>
  )
}

function ClipCard({ a, i, reportero, anguloRel, enCuadro, registrar }: {
  a: CrashAlertDTO
  i: number
  reportero: boolean
  anguloRel: number
  enCuadro: boolean
  registrar: (v: HTMLVideoElement | null) => void
}) {
  const s = ESTADO_ALERTA[a.status]
  return (
    <article className={cx(tarjeta, 'entra flex flex-col overflow-hidden')} style={{ '--i': i } as CSSProperties}>
      <div className="tinta relative aspect-video bg-tinta-2">
        {a.clipUrl ? (
          <video ref={registrar} src={a.clipUrl} controls muted playsInline preload="auto" onLoadedMetadata={(e) => fijarDuracion(e.currentTarget)} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center text-card">
            {s === 'PERDIDO' ? <TriangleAlert size={22} strokeWidth={1.75} aria-hidden="true" className="text-ambar" /> : <span aria-hidden="true" className="size-3 animate-pulse rounded-full" style={{ background: COLOR[s] }} />}
            <span className="font-semibold">{s === 'EN_CAMINO' ? 'Esperando al teléfono…' : s === 'CAPTURANDO' ? 'Guardando T−10 s → T+5 s' : 'No llegó a tiempo'}</span>
            <span className="text-caption text-niebla">{s === 'PERDIDO' ? 'La alerta llegó tarde o el clip no se pudo subir.' : 'El clip aparece aquí al terminar de subir.'}</span>
          </span>
        )}
        {a.clipUrl && a.clipT0S != null && (
          <PastillaTinta className="left-2.5" punto="size-1.5 bg-brand">Choque en el s. {a.clipT0S.toFixed(1).replace('.', ',')}</PastillaTinta>
        )}
        {reportero && <PastillaTinta className="right-2.5">Reportó</PastillaTinta>}
      </div>
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate font-semibold">{a.nodeName}</span>
          <span className="ml-auto inline-flex h-6 flex-none items-center gap-1.5 rounded-full bg-tinta px-2.5 text-xs font-semibold text-card">
            <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: COLOR[s] }} />{ETIQUETA[s]}
          </span>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-caption">
          <div><dt className="text-texto-3">Distancia</dt><dd className="font-mono font-semibold">{formatM(a.distanceM)}</dd></div>
          <div><dt className="text-texto-3">Choque</dt><dd className="font-semibold">{enCuadro ? orientacion(anguloRel) : 'fuera de cuadro'}</dd></div>
          <div><dt className="text-texto-3">Clip</dt><dd className="font-mono font-semibold">{a.clipDurationS != null ? `${Math.round(a.clipDurationS)} s` : '—'}</dd></div>
        </dl>
      </div>
    </article>
  )
}
