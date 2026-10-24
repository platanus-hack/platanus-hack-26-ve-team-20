// Simulación de la red de choques (/choques). Los teléfonos de los conductores (dashcam) y las cámaras
// de semáforo graban todo el tiempo en un buffer circular de 30 s. Cuando un nodo detecta un choque lo
// reporta; el servidor alerta a todos los nodos en el radio del reportero y cada uno guarda su ventana
// T−10 s → T+5 s. Así el choque queda grabado desde varios ángulos.
// Todo es puro y determinista (semilla): la página llama a avanzar() y deriva el resto de `ahora`.
// El incidente se calcula entero al crearse (posiciones en T0, latencias, subidas); su estado en cada
// instante sale de estadoCaptura() y bitacora().

export interface Punto {
  x: number
  y: number
}
export type Dir = 'N' | 'S' | 'E' | 'O'
export type Senal = 'OK' | 'DEBIL' | 'SIN'
export type TipoNodo = 'TELEFONO' | 'SEMAFORO'

/** Cuadrícula de calles, en metros. Avenidas verticales en x, calles horizontales en y. */
export const CALLES_X = [100, 300, 500, 700] as const
export const CALLES_Y = [80, 240, 400] as const
export const MUNDO = { ancho: 800, alto: 480 } as const
const X_MIN = CALLES_X[0]
const X_MAX = CALLES_X[CALLES_X.length - 1] ?? X_MIN
const Y_MIN = CALLES_Y[0]
const Y_MAX = CALLES_Y[CALLES_Y.length - 1] ?? Y_MIN

/** Lo que guarda cada teléfono en memoria; lo más viejo se sobrescribe. */
export const BUFFER_MS = 30_000
/** Ventana que se comparte: 10 s antes y 5 s después del choque. El resto nunca sale del teléfono. */
export const PRE_MS = 10_000
export const POST_MS = 5_000
/** Inferencia del modelo en el teléfono que ve el choque. */
export const DETECCION_MS = 600
/** Un nodo sin señal recibe la alerta cuando reconecta: para entonces su buffer ya no tiene el choque. */
export const RECONEXION_MS = 45_000
/** Lo que tarda la onda de alerta en dibujarse hasta el radio. */
export const DURACION_ONDA_MS = 900
/** Distancia a la que ocurre el choque frente al reportero en choqueAlAzar(). */
const CHOQUE_ADELANTE_M = 18

export interface Nodo {
  id: string
  tipo: TipoNodo
  /** El dispositivo desde el que se abre la página, si activó su cámara. */
  propio: boolean
  pos: Punto
  dir: Dir
  /** Grados, 0 = este, 90 = sur (el eje y del mapa crece hacia abajo). */
  rumbo: number
  /** m/s; 0 = fijo. */
  velocidad: number
  fov: number
  /** Metros hasta donde el modelo reconoce un choque. */
  alcance: number
  senal: Senal
  latenciaMs: number
  /** Frenó por el choque. */
  detenido: boolean
}

export interface Captura {
  nodoId: string
  tipo: TipoNodo
  propio: boolean
  reportero: boolean
  /** Posición y orientación del nodo en T0. */
  pos: Punto
  rumbo: number
  fov: number
  distanciaM: number
  /** Grados del choque respecto al frente del nodo: negativo a la izquierda, positivo a la derecha. */
  anguloRel: number
  enCuadro: boolean
  alertaEn: number
  /** La alerta llegó cuando el buffer ya había sobrescrito T−10 s. */
  perdida: boolean
  finCaptura: number
  listoEn: number
}

export interface Incidente {
  id: string
  pos: Punto
  t0: number
  /** null: ningún nodo tenía el punto en cuadro, así que nadie lo reporta. */
  reportero: string | null
  confianza: number
  radioM: number
  /** Posición del reportero: el servidor alerta a los nodos a `radioM` de aquí. */
  centro: Punto
  servidorEn: number | null
  capturas: Captura[]
}

export interface Estado {
  ahora: number
  semilla: number
  secuencia: number
  nodos: Nodo[]
  incidente: Incidente | null
}

export type EstadoCaptura = 'EN_CAMINO' | 'CAPTURANDO' | 'SUBIENDO' | 'LISTO' | 'PERDIDO'

export interface Evento {
  t: number
  texto: string
  tono: 'neutro' | 'alerta' | 'ok' | 'mal'
}

// ---------------------------------------------------------------- azar con semilla (mulberry32)
class Azar {
  s: number
  constructor(s: number) {
    this.s = s | 0
  }
  sig(): number {
    this.s = (this.s + 0x6d2b79f5) | 0
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  entre(a: number, b: number): number {
    return a + (b - a) * this.sig()
  }
  elegir<T>(xs: readonly T[]): T {
    return xs[Math.min(xs.length - 1, Math.floor(this.sig() * xs.length))] as T
  }
}

// ---------------------------------------------------------------- geometría
export const RUMBO: Record<Dir, number> = { E: 0, S: 90, O: 180, N: 270 }
const VECTOR: Record<Dir, Punto> = { E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, O: { x: -1, y: 0 }, N: { x: 0, y: -1 } }
const OPUESTA: Record<Dir, Dir> = { E: 'O', O: 'E', N: 'S', S: 'N' }
const EPS = 1e-6

export const distancia = (a: Punto, b: Punto) => Math.hypot(b.x - a.x, b.y - a.y)

/** Rumbo de `a` hacia `b` en grados (-180, 180], 0 = este, 90 = sur. */
export const rumboHacia = (a: Punto, b: Punto) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI

/** Lleva un ángulo a (-180, 180]. */
export function normalizar(g: number): number {
  const r = ((((g + 180) % 360) + 360) % 360) - 180
  return r === -180 ? 180 : r
}

const avanzarEn = (p: Punto, d: Dir, m: number): Punto => ({ x: p.x + VECTOR[d].x * m, y: p.y + VECTOR[d].y * m })
const dentro = (p: Punto) => p.x >= X_MIN - EPS && p.x <= X_MAX + EPS && p.y >= Y_MIN - EPS && p.y <= Y_MAX + EPS
const cercana = (xs: readonly number[], v: number) => xs.reduce((m, x) => (Math.abs(x - v) < Math.abs(m - v) ? x : m))
const acotar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Cómo ve un nodo un punto: distancia, ángulo respecto a su frente y si cae en su campo de visión. */
export function vista(n: Pick<Nodo, 'pos' | 'rumbo' | 'fov' | 'alcance'>, p: Punto) {
  const distanciaM = distancia(n.pos, p)
  const anguloRel = normalizar(rumboHacia(n.pos, p) - n.rumbo)
  return { distanciaM, anguloRel, enCuadro: distanciaM <= n.alcance && Math.abs(anguloRel) <= n.fov / 2 }
}

/** El punto de calle más cercano (los choques ocurren en la vía). */
export function ajustarACalle(p: Punto): Punto {
  const h = { x: acotar(p.x, X_MIN, X_MAX), y: cercana(CALLES_Y, p.y) }
  const v = { x: cercana(CALLES_X, p.x), y: acotar(p.y, Y_MIN, Y_MAX) }
  return distancia(p, h) <= distancia(p, v) ? h : v
}

/** "Calle 2 con Av. 3" o "Av. 1, entre Calle 1 y Calle 2". */
export function lugar(p: Punto): string {
  const av = (x: number) => `Av. ${CALLES_X.indexOf(cercana(CALLES_X, x) as (typeof CALLES_X)[number]) + 1}`
  const ca = (y: number) => `Calle ${CALLES_Y.indexOf(cercana(CALLES_Y, y) as (typeof CALLES_Y)[number]) + 1}`
  const enAv = CALLES_X.some((x) => Math.abs(p.x - x) < 1)
  const enCa = CALLES_Y.some((y) => Math.abs(p.y - y) < 1)
  if (enAv && enCa) return `${ca(p.y)} con ${av(p.x)}`
  if (enCa) return `${ca(p.y)}, cerca de ${av(p.x)}`
  return `${av(p.x)}, cerca de ${ca(p.y)}`
}

// ---------------------------------------------------------------- red
const SEMAFOROS: Array<{ x: number; y: number; dir: Dir }> = [
  { x: 300, y: 80, dir: 'S' },
  { x: 700, y: 80, dir: 'O' },
  { x: 100, y: 240, dir: 'E' },
  { x: 500, y: 240, dir: 'O' },
  { x: 300, y: 400, dir: 'E' },
  { x: 500, y: 400, dir: 'N' },
  { x: 700, y: 400, dir: 'N' },
]

const dos = (i: number) => String(i).padStart(2, '0')

export function crearRed({ telefonos = 14, semilla = 26 }: { telefonos?: number; semilla?: number } = {}): Estado {
  const az = new Azar(semilla)
  const nodos: Nodo[] = []
  for (let i = 0; i < telefonos; i++) {
    const horizontal = az.sig() < 0.5
    const dir: Dir = horizontal ? az.elegir(['E', 'O'] as const) : az.elegir(['N', 'S'] as const)
    const pos = horizontal ? { x: Math.round(az.entre(X_MIN, X_MAX)), y: az.elegir(CALLES_Y) } : { x: az.elegir(CALLES_X), y: Math.round(az.entre(Y_MIN, Y_MAX)) }
    const r = az.sig()
    const senal: Senal = r < 0.1 ? 'SIN' : r < 0.25 ? 'DEBIL' : 'OK'
    nodos.push({
      id: `TEL-${dos(i + 1)}`,
      tipo: 'TELEFONO',
      propio: false,
      pos,
      dir,
      rumbo: RUMBO[dir],
      velocidad: az.entre(8, 14),
      fov: 130,
      alcance: 120,
      senal,
      latenciaMs: Math.round(senal === 'DEBIL' ? az.entre(2500, 5000) : az.entre(250, 900)),
      detenido: false,
    })
  }
  // Al menos un teléfono sin señal, para que la demo muestre por qué importa el buffer.
  const sinSenal = nodos.find((n) => n.senal === 'SIN') ?? nodos[nodos.length - 1]
  if (sinSenal) sinSenal.senal = 'SIN'

  SEMAFOROS.forEach((s, i) => {
    nodos.push({
      id: `SEM-${dos(i + 1)}`,
      tipo: 'SEMAFORO',
      propio: false,
      pos: { x: s.x, y: s.y },
      dir: s.dir,
      rumbo: RUMBO[s.dir],
      velocidad: 0,
      fov: 100,
      alcance: 200,
      senal: 'OK',
      latenciaMs: Math.round(az.entre(150, 300)),
      detenido: false,
    })
  })
  return { ahora: 0, semilla: az.s, secuencia: 0, nodos, incidente: null }
}

/** Nodo de "este dispositivo": estacionado en la Calle 2, mirando al este. */
export function nodoPropio(): Nodo {
  return {
    id: 'ESTE',
    tipo: 'TELEFONO',
    propio: true,
    pos: { x: 360, y: 240 },
    dir: 'E',
    rumbo: RUMBO.E,
    velocidad: 0,
    fov: 130,
    alcance: 120,
    senal: 'OK',
    latenciaMs: 300,
    detenido: false,
  }
}

export function conPropio(e: Estado, activo: boolean): Estado {
  const sin = e.nodos.filter((n) => !n.propio)
  return { ...e, nodos: activo ? [...sin, nodoPropio()] : sin }
}

// ---------------------------------------------------------------- movimiento
function siguienteCruce(p: Punto, d: Dir): Punto {
  switch (d) {
    case 'E': return { x: CALLES_X.find((x) => x > p.x + EPS) ?? X_MAX, y: p.y }
    case 'O': return { x: [...CALLES_X].reverse().find((x) => x < p.x - EPS) ?? X_MIN, y: p.y }
    case 'S': return { x: p.x, y: CALLES_Y.find((y) => y > p.y + EPS) ?? Y_MAX }
    case 'N': return { x: p.x, y: [...CALLES_Y].reverse().find((y) => y < p.y - EPS) ?? Y_MIN }
  }
}

function girar(c: Punto, d: Dir, az: Azar): Dir {
  const validas = (['E', 'O', 'N', 'S'] as const).filter((o) => o !== OPUESTA[d] && dentro(avanzarEn(c, o, 1)))
  if (validas.length === 0) return OPUESTA[d]
  if (validas.includes(d) && az.sig() < 0.55) return d
  return az.elegir(validas)
}

function mover(n: Nodo, metros: number, az: Azar): Nodo {
  let pos = n.pos
  let dir = n.dir
  let resto = metros
  for (let i = 0; i < 8 && resto > EPS; i++) {
    const cruce = siguienteCruce(pos, dir)
    const d = distancia(pos, cruce)
    if (d > resto) {
      pos = avanzarEn(pos, dir, resto)
      break
    }
    pos = cruce
    resto -= d
    dir = girar(cruce, dir, az)
  }
  return { ...n, pos, dir, rumbo: RUMBO[dir] }
}

export function avanzar(e: Estado, dtMs: number): Estado {
  const az = new Azar(e.semilla)
  const nodos = e.nodos.map((n) => (n.velocidad > 0 && !n.detenido ? mover(n, (n.velocidad * dtMs) / 1000, az) : n))
  return { ...e, ahora: e.ahora + dtMs, semilla: az.s, nodos }
}

// ---------------------------------------------------------------- choque y alerta
/** El nodo más cercano que tiene el punto en cuadro y señal para reportarlo. */
export function detectar(nodos: Nodo[], p: Punto): Nodo | null {
  let mejor: { n: Nodo; d: number } | null = null
  for (const n of nodos) {
    if (n.senal === 'SIN') continue
    const v = vista(n, p)
    if (v.enCuadro && (!mejor || v.distanciaM < mejor.d)) mejor = { n, d: v.distanciaM }
  }
  return mejor?.n ?? null
}

function crearIncidente(e: Estado, az: Azar, pos: Punto, reportero: Nodo | null, radioM: number): Incidente {
  const id = `INC-${String(e.secuencia + 1).padStart(3, '0')}`
  const t0 = e.ahora
  if (!reportero) return { id, pos, t0, reportero: null, confianza: 0, radioM, centro: pos, servidorEn: null, capturas: [] }

  const servidorEn = t0 + DETECCION_MS + reportero.latenciaMs
  const capturas = e.nodos
    .filter((n) => n.id === reportero.id || distancia(n.pos, reportero.pos) <= radioM)
    .map((n): Captura => {
      const esReportero = n.id === reportero.id
      const alertaEn = esReportero ? t0 + DETECCION_MS : n.senal === 'SIN' ? t0 + RECONEXION_MS : servidorEn + n.latenciaMs
      const perdida = alertaEn - t0 > BUFFER_MS - PRE_MS
      const finCaptura = Math.max(alertaEn, t0 + POST_MS)
      const subidaMs = n.senal === 'DEBIL' ? az.entre(6000, 9000) : n.tipo === 'SEMAFORO' ? az.entre(1200, 2000) : az.entre(2000, 3500)
      return {
        nodoId: n.id,
        tipo: n.tipo,
        propio: n.propio,
        reportero: esReportero,
        pos: n.pos,
        rumbo: n.rumbo,
        fov: n.fov,
        ...vista(n, pos),
        alertaEn,
        perdida,
        finCaptura,
        listoEn: perdida ? alertaEn : Math.round(finCaptura + subidaMs),
      }
    })
  return { id, pos, t0, reportero: reportero.id, confianza: Math.round(az.entre(0.86, 0.97) * 100) / 100, radioM, centro: reportero.pos, servidorEn, capturas }
}

/** Choque en un punto del mapa: lo reporta quien mejor lo vea (o nadie). */
export function simularChoque(e: Estado, punto: Punto, radioM: number): Estado {
  const az = new Azar(e.semilla)
  const pos = ajustarACalle(punto)
  const nodos = e.nodos.map((n) => (n.detenido ? { ...n, detenido: false } : n))
  const base = { ...e, nodos }
  const incidente = crearIncidente(base, az, pos, detectar(nodos, pos), radioM)
  return { ...base, semilla: az.s, secuencia: e.secuencia + 1, incidente }
}

/** Choque justo delante de un teléfono en marcha: su dashcam lo ve, frena y lo reporta. */
export function choqueAlAzar(e: Estado, radioM: number): Estado {
  const az = new Azar(e.semilla)
  const candidatos = e.nodos.filter((n) => n.tipo === 'TELEFONO' && n.velocidad > 0 && n.senal === 'OK' && dentro(avanzarEn(n.pos, n.dir, CHOQUE_ADELANTE_M)))
  if (candidatos.length === 0) return simularChoque(e, { x: az.entre(X_MIN, X_MAX), y: az.elegir(CALLES_Y) }, radioM)
  const rep = az.elegir(candidatos)
  const pos = avanzarEn(rep.pos, rep.dir, CHOQUE_ADELANTE_M)
  const nodos = e.nodos.map((n) => (n.id === rep.id ? { ...n, detenido: true } : n.detenido ? { ...n, detenido: false } : n))
  const base = { ...e, nodos }
  const incidente = crearIncidente(base, az, pos, rep, radioM)
  return { ...base, semilla: az.s, secuencia: e.secuencia + 1, incidente }
}

export function estadoCaptura(c: Captura, ahora: number): EstadoCaptura {
  if (ahora < c.alertaEn) return 'EN_CAMINO'
  if (c.perdida) return 'PERDIDO'
  if (ahora < c.finCaptura) return 'CAPTURANDO'
  if (ahora < c.listoEn) return 'SUBIENDO'
  return 'LISTO'
}

/** Cuándo queda consolidado: el último clip subido. Las alertas tardías (sin señal) no lo esperan. */
export const finIncidente = (inc: Incidente) => Math.max(inc.t0, ...inc.capturas.filter((c) => !c.perdida).map((c) => c.listoEn))

/** "T+1,2 s", "T−10 s". */
export function formatT(ms: number): string {
  const s = ms / 1000
  const signo = s < 0 ? '−' : '+'
  const abs = Math.abs(s)
  return `T${signo}${Number.isInteger(abs) ? abs : abs.toFixed(1).replace('.', ',')} s`
}

export const formatM = (m: number) => `${Math.round(m)} m`

export function bitacora(inc: Incidente, ahora: number): Evento[] {
  const ev: Evento[] = [{ t: inc.t0, texto: `Choque en ${lugar(inc.pos)}`, tono: 'alerta' }]
  if (!inc.reportero || inc.servidorEn == null) {
    ev.push({ t: inc.t0 + DETECCION_MS, texto: 'Ningún dispositivo de la red tenía ese punto en cuadro: nadie lo reporta', tono: 'mal' })
  } else {
    const otras = inc.capturas.filter((c) => !c.reportero)
    ev.push({ t: inc.t0 + DETECCION_MS, texto: `${inc.reportero} detecta el choque (confianza ${inc.confianza.toFixed(2).replace('.', ',')}) y guarda su ventana`, tono: 'alerta' })
    ev.push({ t: inc.servidorEn, texto: `El servidor recibe el reporte y alerta a ${otras.length} ${otras.length === 1 ? 'dispositivo' : 'dispositivos'} a ${formatM(inc.radioM)} de ${inc.reportero}`, tono: 'neutro' })
    for (const c of otras) {
      ev.push(
        c.perdida
          ? { t: c.alertaEn, texto: `${c.nodoId} recibe la alerta al reconectar (${formatT(c.alertaEn - inc.t0)}): su buffer ya sobrescribió el choque`, tono: 'mal' }
          : { t: c.alertaEn, texto: `${c.nodoId} recibe la alerta a ${formatM(c.distanciaM)} del choque y guarda desde ${formatT(-PRE_MS)}`, tono: 'neutro' },
      )
    }
    for (const c of inc.capturas) {
      if (!c.perdida) ev.push({ t: c.listoEn, texto: `${c.nodoId} sube su clip (${(PRE_MS + POST_MS) / 1000} s, ${c.enCuadro ? 'vista directa' : 'sin vista directa'})`, tono: 'ok' })
    }
    const listos = inc.capturas.filter((c) => !c.perdida)
    ev.push({ t: finIncidente(inc), texto: `Incidente ${inc.id} consolidado: ${listos.filter((c) => c.enCuadro).length} ángulos con vista directa en ${listos.length} clips`, tono: 'ok' })
  }
  return ev.filter((x) => x.t <= ahora).sort((a, b) => a.t - b.t)
}

export function resumen(inc: Incidente, ahora: number) {
  const cuenta: Record<EstadoCaptura, number> = { EN_CAMINO: 0, CAPTURANDO: 0, SUBIENDO: 0, LISTO: 0, PERDIDO: 0 }
  for (const c of inc.capturas) cuenta[estadoCaptura(c, ahora)]++
  const directos = inc.capturas.filter((c) => c.enCuadro && estadoCaptura(c, ahora) === 'LISTO')
  return { cuenta, directos: directos.length, completo: ahora >= finIncidente(inc) && inc.reportero != null }
}
