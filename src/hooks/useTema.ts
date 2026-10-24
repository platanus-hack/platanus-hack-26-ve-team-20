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

export function cambiarTema(tema: Tema) {
  actual = tema
  aplicarTema(tema)
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
