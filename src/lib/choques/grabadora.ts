// Buffer circular con la cámara real del dispositivo (nodo "ESTE" de /choques).
// Un MediaRecorder solo produce un archivo válido desde su primer fragmento, así que no se puede
// recortar "los últimos 10 s" de una grabación larga. En su lugar hay dos grabadoras escalonadas:
// cada ROTACION_MS arranca una nueva y la que pasa de 2 × ROTACION_MS se descarta. Siempre hay una con
// entre 10 y 20 s de historia; al llegar la alerta se toma esa, se deja grabar el post y se cierra.
// Nada de esto sale del navegador: el clip queda como URL local.

const ROTACION_MS = 10_000
const TIPOS = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']

interface Tramo {
  rec: MediaRecorder
  partes: Blob[]
  inicio: number
  reservado: boolean
}

export interface ClipReal {
  url: string
  /** Segundos de video antes de la alerta que quedaron en el clip. */
  previoS: number
  duracionS: number
}

export class Grabadora {
  private stream: MediaStream | null = null
  private tramos: Tramo[] = []
  private reloj: ReturnType<typeof setInterval> | null = null
  private tipo = ''

  get activa() {
    return this.stream != null
  }

  get video() {
    return this.stream
  }

  async iniciar(): Promise<MediaStream> {
    if (this.stream) return this.stream
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Este navegador no permite grabar video.')
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false })
    this.tipo = TIPOS.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
    this.abrirTramo()
    this.reloj = setInterval(() => this.rotar(), ROTACION_MS)
    return this.stream
  }

  /** Guarda lo que hay en el buffer y sigue grabando `postMs`; devuelve el clip completo. */
  capturar(postMs: number): Promise<ClipReal> {
    const tramo = this.tramos.find((t) => !t.reservado && t.rec.state === 'recording')
    if (!tramo) return Promise.reject(new Error('La cámara no está grabando.'))
    tramo.reservado = true
    const previoS = (Date.now() - tramo.inicio) / 1000
    return new Promise((resolve) => {
      tramo.rec.onstop = () => {
        const blob = new Blob(tramo.partes, { type: tramo.rec.mimeType || 'video/webm' })
        resolve({ url: URL.createObjectURL(blob), previoS, duracionS: (Date.now() - tramo.inicio) / 1000 })
      }
      setTimeout(() => {
        if (tramo.rec.state !== 'inactive') tramo.rec.stop()
        this.tramos = this.tramos.filter((t) => t !== tramo)
      }, Math.max(0, postMs))
      // La reservada deja de contar como buffer: que haya otra grabando para la siguiente alerta.
      if (!this.tramos.some((t) => !t.reservado)) this.abrirTramo()
    })
  }

  detener() {
    if (this.reloj) clearInterval(this.reloj)
    this.reloj = null
    for (const t of this.tramos) if (t.rec.state !== 'inactive') t.rec.stop()
    this.tramos = []
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }

  private abrirTramo() {
    if (!this.stream) return
    const rec = new MediaRecorder(this.stream, this.tipo ? { mimeType: this.tipo } : undefined)
    const tramo: Tramo = { rec, partes: [], inicio: Date.now(), reservado: false }
    rec.ondataavailable = (ev) => { if (ev.data.size > 0) tramo.partes.push(ev.data) }
    rec.start(1000)
    this.tramos.push(tramo)
  }

  private rotar() {
    const ahora = Date.now()
    for (const t of this.tramos) {
      if (!t.reservado && ahora - t.inicio >= 2 * ROTACION_MS - 100 && t.rec.state !== 'inactive') {
        t.rec.onstop = null
        t.rec.stop()
      }
    }
    this.tramos = this.tramos.filter((t) => t.reservado || t.rec.state !== 'inactive')
    this.abrirTramo()
  }
}
