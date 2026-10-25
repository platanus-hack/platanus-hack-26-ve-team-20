import { useSyncExternalStore } from 'react'

export type Tema = 'claro' | 'oscuro' | 'sistema'
const CLAVE = 'st.tema'

/** Lo guardado en localStorage (o cualquier basura) → tema válido; sin valor, sigue al sistema. */
export const normalizarTema = (v: string | null | undefined): Tema => (v === 'claro' || v === 'oscuro' ? v : 'sistema')

export function leerTema(): Tema {
  try {
    return normalizarTema(localStorage.getItem(CLAVE))
  } catch {
    return 'sistema'
  }
}

/** `data-tema` en <html> fija el `color-scheme`; sin atributo rige `prefers-color-scheme` (index.css). */
export function aplicarTema(tema: Tema, raiz: Pick<HTMLElement, 'setAttribute' | 'removeAttribute'> = document.documentElement) {
  if (tema === 'sistema') raiz.removeAttribute('data-tema')
  else raiz.setAttribute('data-tema', tema)
}

let actual: Tema = 'sistema'
const oyentes = new Set<() => void>()

/**
 * Cambia el tema. Con View Transitions el tema nuevo se abre como un círculo desde `origen` (el interruptor);
 * sin soporte, los colores se funden 300 ms; con movimiento reducido, cambia de golpe.
 */
export function cambiarTema(tema: Tema, origen?: { x: number; y: number }) {
  actual = tema
  const reducido = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (typeof document === 'undefined' || reducido) aplicarTema(tema)
  else if (document.startViewTransition) {
    const { x, y } = origen ?? { x: innerWidth - 80, y: 40 }
    const radio = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    document.startViewTransition(() => aplicarTema(tema)).ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radio}px at ${x}px ${y}px)`] },
        { duration: 480, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', pseudoElement: '::view-transition-new(root)' },
      )
    }).catch(() => {})
  } else {
    const raiz = document.documentElement
    raiz.classList.add('tema-suave')
    aplicarTema(tema)
    setTimeout(() => raiz.classList.remove('tema-suave'), 320)
  }
  try {
    if (tema === 'sistema') localStorage.removeItem(CLAVE)
    else localStorage.setItem(CLAVE, tema)
  } catch {
    // Sin almacenamiento (modo privado): el tema dura la sesión.
  }
  oyentes.forEach((f) => f())
}

/** Llamar antes del primer render, para que el atributo esté puesto cuando pinte React. */
export function iniciarTema() {
  actual = leerTema()
  aplicarTema(actual)
}

export function useTema() {
  const tema = useSyncExternalStore(
    (f) => { oyentes.add(f); return () => { oyentes.delete(f) } },
    () => actual,
  )
  return [tema, cambiarTema] as const
}
