import { useEffect, useState } from 'react'

/** Valor del conteo en la fracción `t` (0–1) del tiempo, con salida cúbica: arranca rápido y frena al llegar. */
export const conteoEn = (fin: number, t: number) => Math.round(fin * (1 - (1 - Math.min(1, Math.max(0, t))) ** 3))

/** Cuenta de 0 a `fin` en `ms` (salida cúbica). Con movimiento reducido devuelve `fin` directo. */
export function useConteo(fin: number, ms = 700) {
  const reducido = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [valor, setValor] = useState(0)

  useEffect(() => {
    if (reducido) return
    let marco = 0
    const inicio = performance.now()
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / ms)
      setValor(conteoEn(fin, t))
      if (t < 1) marco = requestAnimationFrame(paso)
    }
    marco = requestAnimationFrame(paso)
    // Si el navegador pausa los cuadros (pestaña oculta), el monto exacto llega igual al terminar el tiempo.
    const seguro = setTimeout(() => setValor(fin), ms + 100)
    return () => { cancelAnimationFrame(marco); clearTimeout(seguro) }
  }, [fin, ms, reducido])

  return reducido ? fin : valor
}
