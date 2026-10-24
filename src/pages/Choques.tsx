import { ArrowRight, Pause, Play, RotateCcw, Siren, Smartphone, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Grabadora, type ClipReal } from '@/lib/choques/grabadora.ts'
import {
  BUFFER_MS, POST_MS, PRE_MS, avanzar, bitacora, choqueAlAzar, conPropio, crearRed, estadoCaptura, formatT,
  lugar, resumen, simularChoque, type Captura, type Estado, type EstadoCaptura, type Punto,
} from '@/lib/choques/sim.ts'
import { Boton, Interruptor, Pestanas } from '@/components/ui/index.tsx'
import { cx, tarjeta } from '@/components/ui/estilos.ts'
import { DemoBanner, Logo } from '@/components/vc/index.tsx'
import { Pagina, Titulo, h2 } from '@/components/cuenta/piezas.tsx'
import { Cobertura, TarjetaAngulo } from '@/components/choques/Angulo.tsx'
import { Mapa } from '@/components/choques/Mapa.tsx'
import { COLOR, ETIQUETA, estadoNodo, type EstadoNodo } from '@/components/choques/estados.ts'

type Radio = '150' | '300' | '500'
const RADIOS: Array<{ id: Radio; nombre: string }> = [
  { id: '150', nombre: '150 m' },
  { id: '300', nombre: '300 m' },
  { id: '500', nombre: '500 m' },
]
const LEYENDA: EstadoNodo[] = ['GRABANDO', 'EN_CAMINO', 'CAPTURANDO', 'SUBIENDO', 'LISTO', 'PERDIDO']
const TONO = { neutro: 'bg-niebla', alerta: 'bg-[#FF5A4A]', ok: 'bg-verde', mal: 'bg-ambar' } as const
/** Reproducción sincronizada a velocidad real: de T−10 s a T+5 s. */
const REPRO_MS = PRE_MS + POST_MS

/** Orden de la galería: quien reportó, luego vista directa por distancia, sin vista y perdidos. */
const peso = (c: Captura) => (c.reportero ? 0 : c.perdida ? 3 : c.enCuadro ? 1 : 2)

/** Un `performance.now()` que se refresca cada cuadro desde `inicio` y durante `duracion` ms. */
function useReloj(inicio: number | null, duracion: number) {
  const [t, setT] = useState(() => performance.now())
  useEffect(() => {
    if (inicio == null) return
    let id = requestAnimationFrame(function tick(x) {
      setT(x)
      if (x - inicio <= duracion) id = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(id)
  }, [inicio, duracion])
  return t
}

/**
 * Red de choques (simulación). Cada teléfono en la calle es la dashcam de un conductor y graba en un
 * buffer circular de 30 s, igual que las cámaras de semáforo. Cuando uno detecta un choque, el servidor
 * alerta a los que están en el radio y cada uno sube su ventana T−10 s → T+5 s: el mismo choque desde
 * varios ángulos. Con "Usar la cámara de este dispositivo" el navegador entra a la red con video real.
 */
export default function Choques() {
  const [estado, setEstado] = useState<Estado>(() => crearRed())
  const [radio, setRadio] = useState<Radio>('150')
  const [pausa, setPausa] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [errorCam, setErrorCam] = useState<string | null>(null)
  const [clips, setClips] = useState<Record<string, ClipReal>>({})
  const [repro, setRepro] = useState<number | null>(null)
  const grabadora = useRef<Grabadora | null>(null)
  const pedido = useRef<string | null>(null)
  const urls = useRef<string[]>([])

  // Reloj de la simulación: avanza con cada cuadro. dt acotado a 1 s: al volver de una pestaña oculta no salta.
  useEffect(() => {
    if (pausa) return
    let antes = performance.now()
    let id = requestAnimationFrame(function tick(t) {
      const dt = Math.min(1000, t - antes)
      antes = t
      setEstado((e) => avanzar(e, dt))
      id = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(id)
  }, [pausa])

  // Si este dispositivo está en el radio, al llegarle la alerta guarda su buffer real.
  const inc = estado.incidente
  const propia = inc?.capturas.find((c) => c.propio)
  const capturandoPropia = propia != null && estadoCaptura(propia, estado.ahora) === 'CAPTURANDO'
  useEffect(() => {
    if (!inc || !propia || !capturandoPropia || pedido.current === inc.id || !grabadora.current?.activa) return
    pedido.current = inc.id
    const id = inc.id
    // T0 en el reloj del dispositivo: la simulación corre a velocidad real.
    grabadora.current.capturar(Date.now() - (estado.ahora - inc.t0), propia.finCaptura - estado.ahora).then(
      (clip) => { urls.current.push(clip.url); setClips((m) => ({ ...m, [id]: clip })) },
      () => {},
    )
  }, [capturandoPropia]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    grabadora.current?.detener()
    urls.current.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  const reloj = useReloj(repro, REPRO_MS)
  // Termina sola al pasar T+5 s; `repro` queda viejo hasta el próximo clic.
  const tauRepro = repro != null && reloj >= repro && reloj - repro <= REPRO_MS ? -PRE_MS + (reloj - repro) : null

  const nuevoIncidente = (siguiente: Estado) => {
    setRepro(null)
    setEstado(siguiente)
  }
  const alAzar = () => nuevoIncidente(choqueAlAzar(estado, Number(radio)))
  const enPunto = (p: Punto) => nuevoIncidente(simularChoque(estado, p, Number(radio)))
  const reiniciar = () => {
    setRepro(null)
    setEstado((e) => conPropio(crearRed({ semilla: Math.floor(Math.random() * 1e9) }), e.nodos.some((n) => n.propio)))
  }

  const camara = async (activa: boolean) => {
    setErrorCam(null)
    if (!activa) {
      grabadora.current?.detener()
      setStream(null)
      setEstado((e) => conPropio(e, false))
      return
    }
    try {
      grabadora.current ??= new Grabadora()
      setStream(await grabadora.current.iniciar())
      setEstado((e) => conPropio(e, true))
    } catch (e) {
      setErrorCam(e instanceof Error && e.name === 'NotAllowedError' ? 'Permiso de cámara denegado.' : 'No se pudo abrir la cámara de este dispositivo.')
    }
  }

  const res = inc ? resumen(inc, estado.ahora) : null
  const eventos = inc ? bitacora(inc, estado.ahora).reverse() : []
  const telefonos = estado.nodos.filter((n) => n.tipo === 'TELEFONO').length
  const semaforos = estado.nodos.length - telefonos
  const sinSenal = estado.nodos.filter((n) => n.senal === 'SIN').length
  const capturas = inc ? [...inc.capturas].sort((a, b) => peso(a) - peso(b) || a.distanciaM - b.distanciaM) : []
  const listosDirectos = res?.directos ?? 0

  return (
    <div className="flex min-h-dvh flex-col">
      <DemoBanner />
      <header className="tinta flex h-14 flex-none items-center gap-3 bg-tinta px-4 text-card lg:px-12">
        <Logo claro />
        <span className="hidden text-niebla sm:inline">/ Red de choques</span>
        <span className="ml-auto inline-flex h-[26px] items-center gap-1.5 rounded-full bg-tinta-3 px-2.5 text-xs font-semibold">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-ambar" />Simulación
        </span>
      </header>

      <Pagina>
        <Titulo despues="Cada teléfono graba en un buffer de 30 s. Si uno detecta un choque, los que están cerca guardan ese momento y el choque queda grabado desde varios ángulos.">
          Choques desde varios ángulos
        </Titulo>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] lg:gap-x-6 lg:gap-y-4">
          <section aria-label="Mapa de la red" className="tinta flex flex-col self-start overflow-hidden rounded-card bg-tinta lg:col-start-1 lg:row-start-1">
            <Mapa
              nodos={estado.nodos}
              incidente={inc}
              ahora={estado.ahora}
              estadoDe={(id) => estadoNodo(inc, id, estado.ahora)}
              onClic={enPunto}
              etiqueta="Mapa de la red: haga clic en una calle para provocar un choque ahí"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-xs text-niebla">
              {LEYENDA.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full" style={{ background: COLOR[s] }} />{ETIQUETA[s]}</span>
              ))}
              <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-full border border-dashed border-texto-3" />Sin señal</span>
              <span className="ml-auto hidden text-niebla/80 sm:inline">Clic en una calle = choque ahí</span>
            </div>
          </section>

          <aside className="flex flex-col gap-4 self-start lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className={cx(tarjeta, 'flex flex-col gap-4 p-4')}>
              <Boton variante="pay" onClick={alAzar}><Siren size={18} strokeWidth={2} aria-hidden="true" />Simular choque</Boton>
              <p className="-mt-2 text-caption text-texto-2">Ocurre frente a un conductor con la app. También puede hacer clic en cualquier calle del mapa.</p>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Radio de alerta</span>
                <Pestanas etiqueta="Radio de alerta" opciones={RADIOS} valor={radio} onCambio={setRadio} />
              </div>
              <div className="flex items-center gap-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold">Usar la cámara de este dispositivo</span>
                  <span className="text-caption text-texto-2">Entra a la red estacionado en la Calle 2. Su clip será video real.</span>
                </span>
                <Interruptor etiqueta="Usar la cámara de este dispositivo" activo={stream != null} onCambio={camara} />
              </div>
              {errorCam && <p role="alert" className="text-caption text-rojo-osc">{errorCam}</p>}
              <div className="grid grid-cols-2 gap-2">
                <Boton variante="outline" onClick={() => setPausa((p) => !p)}>
                  {pausa ? <Play size={16} strokeWidth={2} aria-hidden="true" /> : <Pause size={16} strokeWidth={2} aria-hidden="true" />}
                  {pausa ? 'Seguir' : 'Pausar'}
                </Boton>
                <Boton variante="outline" onClick={reiniciar}><RotateCcw size={16} strokeWidth={2} aria-hidden="true" />Nueva red</Boton>
              </div>
            </div>

            <Link to="/choques/vivo" className="tinta press flex items-center gap-3 rounded-card bg-tinta p-4 text-card">
              <Smartphone size={20} strokeWidth={1.75} aria-hidden="true" className="flex-none text-brand" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold">Probar con celulares reales</span>
                <span className="text-caption text-niebla">Red en vivo: cada celular graba y sube su clip</span>
              </span>
              <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
            </Link>

            <div className={cx(tarjeta, 'flex flex-col gap-2 p-4')}>
              <span className="flex items-center gap-2 text-sm font-semibold"><Users size={16} strokeWidth={2} aria-hidden="true" />La red ahora</span>
              <dl className="grid grid-cols-3 gap-2">
                <div><dt className="text-caption text-texto-2">Teléfonos</dt><dd className="font-mono text-h3 font-bold">{telefonos}</dd></div>
                <div><dt className="text-caption text-texto-2">Semáforos</dt><dd className="font-mono text-h3 font-bold">{semaforos}</dd></div>
                <div><dt className="text-caption text-texto-2">Sin señal</dt><dd className="font-mono text-h3 font-bold">{sinSenal}</dd></div>
              </dl>
              <p className="text-caption text-texto-2">
                Todos graban sin parar, pero solo guardan los últimos {BUFFER_MS / 1000} s. Ante una alerta comparten {formatT(-PRE_MS)} → {formatT(POST_MS)}; el resto nunca sale del teléfono.
              </p>
            </div>
          </aside>

          <div className={cx(tarjeta, 'flex min-h-0 flex-col gap-2 self-start p-4 lg:col-start-1 lg:row-start-2')}>
            <span className="text-sm font-semibold">Bitácora{inc && <span className="font-mono font-normal text-texto-2"> · {inc.id} · {formatT(Math.round((estado.ahora - inc.t0) / 100) * 100)}</span>}</span>
            {eventos.length === 0 ? (
              <p className="text-caption text-texto-2">Sin incidentes. Simule un choque para ver la alerta propagarse.</p>
            ) : (
              <ol className="flex max-h-[220px] flex-col gap-2 overflow-y-auto pr-1" aria-live="polite">
                {eventos.map((ev) => (
                  <li key={`${ev.t}-${ev.texto}`} className="flex gap-2.5 text-caption">
                    <span aria-hidden="true" className={cx('mt-1.5 size-1.5 flex-none rounded-full', TONO[ev.tono])} />
                    <span className="w-14 flex-none font-mono text-texto-2">{inc && formatT(Math.round((ev.t - inc.t0) / 100) * 100)}</span>
                    <span className="min-w-0 flex-1">{ev.texto}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {inc && res && (
          <section aria-label={`Ángulos del incidente ${inc.id}`} className="flex flex-col gap-4">
            <div className="tinta flex flex-col gap-4 rounded-card bg-tinta p-5 text-card sm:flex-row sm:items-center">
              <Cobertura pos={inc.pos} listos={inc.capturas.filter((c) => estadoCaptura(c, estado.ahora) === 'LISTO')} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-mono text-sm text-niebla">{inc.id} · {lugar(inc.pos)}</span>
                <h2 className={h2}>
                  {!inc.reportero
                    ? 'Nadie vio el choque'
                    : res.completo
                      ? `${listosDirectos} ${listosDirectos === 1 ? 'ángulo' : 'ángulos'} con vista directa`
                      : 'Reuniendo ángulos…'}
                </h2>
                <span className="text-sm text-niebla">
                  {!inc.reportero
                    ? 'Ningún teléfono ni cámara tenía ese punto en cuadro. Pruebe más cerca de un carro o de un semáforo.'
                    : (['CAPTURANDO', 'SUBIENDO', 'LISTO', 'EN_CAMINO', 'PERDIDO'] as EstadoCaptura[])
                        .filter((s) => res.cuenta[s] > 0 || s === 'LISTO')
                        .map((s) => `${res.cuenta[s]} ${s === 'EN_CAMINO' ? 'sin señal, alerta en cola' : ETIQUETA[s].toLowerCase()}`)
                        .join(' · ')}
                </span>
              </div>
              {inc.reportero && (
                <button
                  type="button"
                  className="press inline-flex h-12 flex-none items-center justify-center gap-2 rounded-control bg-brand px-5 font-semibold text-tinta disabled:opacity-40"
                  disabled={!res.completo || listosDirectos === 0}
                  onClick={() => setRepro(tauRepro == null ? performance.now() : null)}
                >
                  {tauRepro == null ? <Play size={16} strokeWidth={2} aria-hidden="true" /> : <Pause size={16} strokeWidth={2} aria-hidden="true" />}
                  {tauRepro == null ? 'Ver todos sincronizados' : <>Reproduciendo <span className="num font-mono">{formatT(Math.round((tauRepro ?? 0) / 100) * 100)}</span></>}
                </button>
              )}
            </div>
            {tauRepro != null && (
              <div className="relative h-1.5 rounded-full bg-suave" role="progressbar" aria-label="Reproducción sincronizada" aria-valuenow={Math.round(((tauRepro + PRE_MS) / REPRO_MS) * 100)}>
                <span className="absolute inset-y-0 left-0 rounded-full bg-tinta" style={{ width: `${Math.min(100, ((tauRepro + PRE_MS) / REPRO_MS) * 100)}%` }} />
                <span aria-hidden="true" className="absolute -top-1 h-3.5 w-0.5 bg-rojo" style={{ left: `${(PRE_MS / REPRO_MS) * 100}%` }} />
              </div>
            )}
            {capturas.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {capturas.map((c, i) => (
                  <TarjetaAngulo
                    key={`${inc.id}-${c.nodoId}`}
                    c={c}
                    inc={inc}
                    ahora={estado.ahora}
                    tauRepro={tauRepro}
                    clipReal={c.propio ? clips[inc.id] : undefined}
                    stream={c.propio ? stream : null}
                    i={i}
                  />
                ))}
              </div>
            )}
            {inc.reportero && (
              <p className="text-caption text-texto-2">
                Nodos fuera del radio: <span className="font-mono">{estado.nodos.length - inc.capturas.length}</span>. No reciben la alerta y su buffer se sobrescribe como siempre.
              </p>
            )}
          </section>
        )}
      </Pagina>
    </div>
  )
}
