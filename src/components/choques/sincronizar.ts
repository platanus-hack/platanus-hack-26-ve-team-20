// Reproducción sincronizada de los clips de un choque (/choques/vivo): cada <video> se adelanta al mismo instante
// relativo al choque y todos arrancan a la vez.

/** Cuánto adelantar cada clip para que todos muestren el mismo instante: `previo` segundos antes del choque. */
export function planSincronizado(t0s: number[], maxPrevioS: number): { previoS: number; iniciosS: number[] } {
  const previoS = Math.max(0, Math.min(maxPrevioS, ...t0s))
  return { previoS, iniciosS: t0s.map((t0) => Math.max(0, t0 - previoS)) }
}

function esperar(v: HTMLVideoElement, evento: string, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const fin = (ok: boolean) => {
      v.removeEventListener(evento, listo)
      clearTimeout(t)
      resolve(ok)
    }
    const listo = () => fin(true)
    const t = setTimeout(() => fin(false), ms)
    v.addEventListener(evento, listo)
  })
}

/**
 * Deja el video pausado en `t` segundos. Los webm de MediaRecorder no traen duración (Infinity) y el navegador no
 * los deja adelantar hasta conocerla: un salto al final la fuerza. Devuelve si quedó donde se pidió.
 */
export async function adelantar(v: HTMLVideoElement, t: number): Promise<boolean> {
  v.pause()
  if (v.readyState < HTMLMediaElement.HAVE_METADATA) await esperar(v, 'loadedmetadata', 5000)
  if (!Number.isFinite(v.duration)) {
    const duracion = esperar(v, 'durationchange', 3000)
    v.currentTime = 1e101
    await duracion
  }
  const listo = esperar(v, 'seeked', 4000)
  v.currentTime = t
  await listo
  return Math.abs(v.currentTime - t) < 0.5
}

/** Al cargar el clip, calcula ya su duración (si falta) para que "Ver todos sincronizados" no espere al clic. */
export function fijarDuracion(v: HTMLVideoElement): void {
  if (Number.isFinite(v.duration)) return
  // Sin plazo: volver al inicio antes de que el navegador termine de calcularla cancelaría el cálculo.
  const listo = () => {
    if (!Number.isFinite(v.duration)) return
    v.removeEventListener('durationchange', listo)
    if (v.paused) v.currentTime = 0
  }
  v.addEventListener('durationchange', listo)
  v.currentTime = 1e101
}
