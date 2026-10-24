import { CRASH, type CrashHeartbeatDTO, type CrashNetworkDTO } from '@contracts'
import { CheckCircle2, CloudUpload, LogOut, RotateCw, Siren, TriangleAlert, Video, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { conReloj, latir, marcarPerdida, reportar, subirClip, verRed } from '@/lib/choques/api.ts'
import { Grabadora, type ClipReal } from '@/lib/choques/grabadora.ts'
import { CALLES_X, CALLES_Y, MUNDO, ajustarACalle, formatM, normalizar, puestoEnCalle, type Punto } from '@/lib/choques/sim.ts'
import { Boton, Campo } from '@/components/ui/index.tsx'
import { cx, input, tarjeta } from '@/components/ui/estilos.ts'
import { Logo, PastillaTinta } from '@/components/vc/index.tsx'
import { Pagina, Titulo } from '@/components/cuenta/piezas.tsx'
import { Mapa } from '@/components/choques/Mapa.tsx'
import { estadoEnVivo, incidenteDeRed, nodoDeRed } from '@/components/choques/vivo.ts'

const LATIDO_MS = 1000
const RED_MS = 2000
/** El choque que reporta este teléfono ocurre a esta distancia, delante de él. */
const ADELANTE_M = 18
const K = { nombre: 'choques:nombre', nodo: 'choques:nodo' }

type Alerta = NonNullable<CrashHeartbeatDTO['alert']>
type Fase = 'CAPTURANDO' | 'SUBIENDO' | 'LISTO' | 'PERDIDA' | 'ERROR'
interface CapturaLocal {
  alertaId: string
  distanciaM: number
  propia: boolean
  fase: Fase
  clip?: ClipReal
  mensaje?: string
}

const leer = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const guardar = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sin almacenamiento: solo se pierde al recargar */ } }

const enCalleX = (p: Punto) => CALLES_X.some((x) => Math.abs(p.x - x) < 1)
const enCalleY = (p: Punto) => CALLES_Y.some((y) => Math.abs(p.y - y) < 1)

/** Si el punto está sobre una sola calle, el teléfono mira a lo largo de ella. */
function alinear(p: Punto, rumbo: number): number {
  const horizontal = Math.abs(normalizar(rumbo)) < 45 || Math.abs(normalizar(rumbo)) > 135
  if (enCalleY(p) && !enCalleX(p) && !horizontal) return 0
  if (enCalleX(p) && !enCalleY(p) && horizontal) return 90
  return rumbo
}

function delante(p: Punto, rumbo: number): Punto {
  const a = (rumbo * Math.PI) / 180
  const x = Math.min(MUNDO.ancho, Math.max(0, p.x + ADELANTE_M * Math.cos(a)))
  const y = Math.min(MUNDO.alto, Math.max(0, p.y + ADELANTE_M * Math.sin(a)))
  return ajustarACalle({ x, y })
}

function mensajeCamara(e: unknown): string {
  if (!window.isSecureContext) return 'La cámara solo funciona con https (abra el enlace publicado, no una IP local).'
  if (e instanceof Error && e.name === 'NotAllowedError') return 'Permiso de cámara denegado. Actívelo en los ajustes del navegador y vuelva a intentar.'
  return e instanceof Error && e.message ? e.message : 'No se pudo abrir la cámara.'
}

function VideoVivo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])
  return <video ref={ref} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-cover" />
}

/**
 * /choques/nodo: este teléfono entra a la red de choques. Con la cámara activa graba en un buffer de 30 s
 * y late cada segundo con su punto en el mapa. Si le llega una alerta (o reporta un choque), guarda
 * T−10 s → T+5 s de lo que estaba grabando y lo sube.
 */
export default function ChoquesNodo() {
  const [nombre, setNombre] = useState(() => leer(K.nombre) ?? `Teléfono ${Math.floor(10 + Math.random() * 90)}`)
  const [pos, setPos] = useState<Punto>(() => ajustarACalle({ x: 100 + Math.random() * 600, y: 80 + Math.random() * 320 }))
  const [rumbo, setRumbo] = useState(0)
  const [nodoId, setNodoId] = useState<string | null>(() => leer(K.nodo))
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conectado, setConectado] = useState(true)
  const [red, setRed] = useState<CrashNetworkDTO | null>(null)
  const [captura, setCaptura] = useState<CapturaLocal | null>(null)
  const [reportando, setReportando] = useState(false)
  const grabadora = useRef<Grabadora | null>(null)
  const offset = useRef(0)
  const atendidas = useRef(new Set<string>())
  const urls = useRef<string[]>([])
  const pantalla = useRef<WakeLockSentinel | null>(null)
  const datos = useRef({ nodoId, nombre, pos, rumbo })
  /** Ya tiene punto elegido (a mano, o junto a los demás al cargar la red). */
  const ubicado = useRef(false)

  useEffect(() => {
    datos.current = { nodoId, nombre, pos, rumbo }
  })

  /** Guarda la ventana del choque de una alerta (propia o recibida) y la sube. */
  async function atender(alerta: Alerta, propia: boolean) {
    if (atendidas.current.has(alerta.id)) return
    atendidas.current.add(alerta.id)
    const t0 = Date.parse(alerta.occurredAt) - offset.current
    const base = { alertaId: alerta.id, distanciaM: alerta.distanceM, propia }
    const g = grabadora.current
    if (!g?.activa || Date.now() - t0 > CRASH.BUFFER_MS - CRASH.PRE_MS) {
      setCaptura({ ...base, fase: 'PERDIDA', mensaje: 'La alerta llegó tarde: su buffer ya no tenía ese momento.' })
      void marcarPerdida(alerta.id).catch(() => undefined)
      return
    }
    setCaptura({ ...base, fase: 'CAPTURANDO' })
    if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([200, 100, 200])
    let clip: ClipReal | undefined
    try {
      clip = await g.capturar(t0, t0 + CRASH.POST_MS - Date.now())
      urls.current.push(clip.url)
      if (clip.blob.size > CRASH.CLIP_MAX_BYTES) throw new Error('El clip pesa demasiado para subirlo.')
      setCaptura({ ...base, fase: 'SUBIENDO', clip })
      await subirClip(alerta.id, clip)
      setCaptura({ ...base, fase: 'LISTO', clip })
    } catch (e) {
      setCaptura({ ...base, ...(clip && { clip }), fase: 'ERROR', mensaje: e instanceof Error ? e.message : 'No se pudo subir el clip.' })
      void marcarPerdida(alerta.id).catch(() => undefined)
    }
  }

  // Latido: cada segundo, mientras la cámara esté activa.
  useEffect(() => {
    if (!stream) return
    let vivo = true
    const latido = async () => {
      const d = datos.current
      try {
        const { data, offsetMs } = await conReloj(() => latir({
          ...(d.nodoId && { nodeId: d.nodoId }),
          name: d.nombre.trim() || 'Teléfono',
          x: d.pos.x,
          y: d.pos.y,
          heading: d.rumbo,
          recording: !document.hidden && (grabadora.current?.activa ?? false),
        }))
        if (!vivo) return
        offset.current = offsetMs
        setConectado(true)
        if (data.nodeId !== d.nodoId) {
          setNodoId(data.nodeId)
          guardar(K.nodo, data.nodeId)
        }
        if (data.alert) void atender(data.alert, false)
      } catch {
        if (vivo) setConectado(false)
      }
    }
    void latido()
    const t = setInterval(latido, LATIDO_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [stream]) // eslint-disable-line react-hooks/exhaustive-deps

  // El mapa de la red (también antes de unirse, para elegir el punto).
  useEffect(() => {
    let vivo = true
    const traer = () => {
      if (document.hidden) return
      conReloj(verRed).then(({ data }) => {
        if (!vivo) return
        setRed(data)
        // La primera vez, ponerse en la misma calle que los demás, en el siguiente puesto libre, mirando al este:
        // así todos caen en el radio de la misma alerta.
        if (!ubicado.current) {
          ubicado.current = true
          const otros = data.nodes.filter((n) => n.recording && n.id !== datos.current.nodoId).length
          setPos(puestoEnCalle(otros))
          setRumbo(0)
        }
      }, () => undefined)
    }
    traer()
    const t = setInterval(traer, RED_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [])

  // La pantalla no se apaga mientras graba; el navegador suelta el bloqueo al ocultarse la página.
  useEffect(() => {
    if (!stream) return
    const pedir = () => { if (!document.hidden) navigator.wakeLock?.request('screen').then((w) => { pantalla.current = w }, () => undefined) }
    pedir()
    document.addEventListener('visibilitychange', pedir)
    return () => {
      document.removeEventListener('visibilitychange', pedir)
      void pantalla.current?.release().catch(() => undefined)
    }
  }, [stream])

  useEffect(() => () => {
    grabadora.current?.detener()
    urls.current.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  const unirse = async () => {
    setError(null)
    try {
      grabadora.current ??= new Grabadora()
      setStream(await grabadora.current.iniciar())
      guardar(K.nombre, nombre.trim())
    } catch (e) {
      setError(mensajeCamara(e))
    }
  }

  const salir = () => {
    grabadora.current?.detener()
    setStream(null)
    const d = datos.current
    if (d.nodoId) void latir({ nodeId: d.nodoId, name: d.nombre.trim() || 'Teléfono', x: d.pos.x, y: d.pos.y, heading: d.rumbo, recording: false }).catch(() => undefined)
  }

  const mover = (p: Punto) => {
    ubicado.current = true
    const nuevo = ajustarACalle(p)
    setPos(nuevo)
    setRumbo((r) => alinear(nuevo, r))
  }

  const reportarFrente = async () => {
    if (!nodoId) return
    setError(null)
    setReportando(true)
    try {
      const punto = delante(pos, rumbo)
      const r = await reportar({ x: punto.x, y: punto.y, radiusM: CRASH.DEFAULT_RADIUS_M, reporterId: nodoId })
      if (r.ownAlert) void atender(r.ownAlert, true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reportar el choque.')
    } finally {
      setReportando(false)
    }
  }

  const incidente = red?.incident ?? null
  const nodos = (red?.nodes ?? []).filter((n) => n.id !== nodoId).map((n) => nodoDeRed(n, null))
  // Este teléfono siempre con su punto local (el del servidor llega un latido después).
  nodos.push(nodoDeRed({ id: nodoId ?? 'yo', name: nombre.trim() || 'Teléfono', x: pos.x, y: pos.y, heading: rumbo, recording: stream != null, lastSeenAgoMs: 0 }, nodoId ?? 'yo'))
  const grabando = (red?.nodes ?? []).filter((n) => n.recording && n.id !== nodoId).length + (stream ? 1 : 0)
  const capturando = captura?.fase === 'CAPTURANDO'

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="tinta flex h-14 flex-none items-center gap-3 bg-tinta px-4 text-card">
        <Logo claro />
        <span className="ml-auto inline-flex h-[26px] items-center gap-1.5 rounded-full bg-tinta-3 px-2.5 text-xs font-semibold">
          <span aria-hidden="true" className={cx('size-1.5 rounded-full', stream ? 'bg-[#FF5A4A]' : 'bg-niebla')} />
          {stream ? 'Grabando' : 'Sin cámara'}
        </span>
      </header>

      <Pagina className="max-w-[640px]">
        <Titulo despues={stream ? 'Mantenga esta página abierta y la pantalla encendida. Su teléfono guarda solo los últimos 30 s.' : 'Su teléfono graba como una dashcam. Si hay un choque cerca, guarda los 10 s antes y 5 s después y los comparte.'}>
          {stream ? 'Está en la red de choques' : 'Únase a la red de choques'}
        </Titulo>

        {!stream ? (
          <div className={cx(tarjeta, 'flex flex-col gap-4 p-4')}>
            <Campo id="nombre" label="Nombre en el mapa" ayuda="Cualquier apodo. No pedimos datos personales.">
              <input id="nombre" className={input()} value={nombre} maxLength={24} onChange={(e) => setNombre(e.target.value)} />
            </Campo>
            <Boton onClick={unirse}><Video size={18} strokeWidth={2} aria-hidden="true" />Activar cámara y unirme</Boton>
            <p className="text-caption text-texto-2">Use la cámara trasera apuntando a la calle. El video no sale del teléfono salvo el pedazo de un choque.</p>
          </div>
        ) : (
          <div className="tinta relative aspect-video overflow-hidden rounded-card bg-tinta-2">
            <VideoVivo stream={stream} />
            <PastillaTinta className="left-2.5" punto={cx('size-2 bg-[#FF5A4A]', capturando && 'animate-pulse')}>
              {capturando ? 'Guardando T−10 s → T+5 s' : 'Buffer · últimos 30 s'}
            </PastillaTinta>
            <PastillaTinta className="right-2.5">{nombre.trim() || 'Teléfono'}</PastillaTinta>
            {!conectado && (
              <span className="absolute inset-x-0 bottom-2.5 mx-auto flex w-fit items-center gap-1.5 rounded-full bg-tinta/85 px-2.5 py-1 text-xs font-semibold text-card">
                <WifiOff size={13} strokeWidth={2} aria-hidden="true" />Sin conexión con la red
              </span>
            )}
          </div>
        )}

        {error && <p role="alert" className="rounded-control bg-rojo-bg px-3.5 py-2.5 text-sm text-rojo-osc">{error}</p>}

        {captura && <EstadoCaptura c={captura} />}

        {stream && (
          <Boton variante="pay" onClick={reportarFrente} disabled={reportando || !nodoId || capturando}>
            <Siren size={18} strokeWidth={2} aria-hidden="true" />{reportando ? 'Reportando…' : 'Reportar choque frente a mí'}
          </Boton>
        )}

        <section aria-label="Su punto en el mapa" className="tinta flex flex-col overflow-hidden rounded-card bg-tinta">
          <Mapa
            nodos={nodos}
            incidente={incidente ? incidenteDeRed(incidente) : null}
            ahora={red ? Date.parse(red.serverNow) : 0}
            estadoDe={(id) => estadoEnVivo(incidente, id)}
            onClic={mover}
            etiquetarTodos
            etiqueta="Mapa de la red: toque una calle para mover su teléfono ahí"
          />
          <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-niebla">
            <span className="min-w-0 flex-1">Toque una calle para ubicarse. <span className="font-mono text-card">{grabando}</span> {grabando === 1 ? 'teléfono grabando' : 'teléfonos grabando'} en la red.</span>
            <button type="button" onClick={() => setRumbo((r) => (r + 90) % 360)} className="press inline-flex h-10 items-center gap-1.5 rounded-control bg-tinta-3 px-3 font-semibold text-card">
              <RotateCw size={15} strokeWidth={2} aria-hidden="true" />Girar
            </button>
          </div>
        </section>

        {stream && <Boton variante="outline" onClick={salir}><LogOut size={16} strokeWidth={2} aria-hidden="true" />Salir de la red</Boton>}
      </Pagina>
    </div>
  )
}

function EstadoCaptura({ c }: { c: CapturaLocal }) {
  const titulo = {
    CAPTURANDO: c.propia ? 'Choque reportado · guardando su clip' : `Choque a ${formatM(c.distanciaM)} · guardando su clip`,
    SUBIENDO: 'Subiendo su clip…',
    LISTO: 'Clip enviado a la red',
    PERDIDA: 'No alcanzó a guardar el choque',
    ERROR: 'No se pudo enviar el clip',
  }[c.fase]
  const Icono = c.fase === 'LISTO' ? CheckCircle2 : c.fase === 'SUBIENDO' ? CloudUpload : c.fase === 'CAPTURANDO' ? Siren : TriangleAlert
  const tono = c.fase === 'LISTO' ? 'bg-verde-bg text-verde-osc' : c.fase === 'CAPTURANDO' ? 'bg-rojo-bg text-rojo-osc' : c.fase === 'SUBIENDO' ? 'bg-azul-bg text-azul-osc' : 'bg-ambar-bg text-ambar-osc'
  return (
    <div role="status" className={cx(tarjeta, 'entra flex flex-col gap-3 p-4')}>
      <div className="flex items-center gap-3">
        <span className={cx('flex size-11 flex-none items-center justify-center rounded-control', tono)}><Icono size={22} strokeWidth={1.75} aria-hidden="true" /></span>
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold">{titulo}</span>
          <span className="text-caption text-texto-2">
            {c.mensaje ?? (c.clip ? `${Math.round(c.clip.duracionS)} s de video · el choque en el segundo ${c.clip.t0S.toFixed(1).replace('.', ',')}` : 'Siga apuntando a la calle 5 segundos más.')}
          </span>
        </span>
      </div>
      {c.clip && <video src={c.clip.url} controls muted playsInline className="aspect-video w-full rounded-control bg-tinta object-cover" />}
    </div>
  )
}
