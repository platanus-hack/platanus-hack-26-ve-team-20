export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ')

// Botones: 48 px, radio 12, presionar .98 · 120 ms.
// 'pay' y 'primary' son la acción principal (tinta en claro, lima en oscuro); 'lima' va sobre paneles tinta;
// 'acceso' es el azul de confianza de entrar y crear cuenta, igual en los dos temas (blanco sobre #1D4ED8 = 6,7:1).
export type Variante = 'pay' | 'primary' | 'lima' | 'acceso' | 'outline'
const VARIANTE: Record<Variante, string> = {
  pay: 'bg-primario text-sobre-primario hover:opacity-90',
  primary: 'bg-primario text-sobre-primario hover:opacity-90',
  lima: 'bg-brand text-[#0e1726] hover:bg-[#b4e035]',
  acceso: 'bg-[#1d4ed8] text-white shadow-[0_1px_2px_rgba(14,23,38,.18)] hover:bg-[#1e40af]',
  outline: 'border border-borde bg-card text-tinta hover:bg-suave',
}
export const boton = (v: Variante = 'primary', extra?: string) =>
  cx('press inline-flex h-12 items-center justify-center gap-2 rounded-control px-5 text-base font-semibold transition-[opacity,background-color] duration-150 disabled:opacity-60', VARIANTE[v], extra)

/** Enlace de texto azul con área táctil de 44 px. */
export const enlace = 'inline-flex min-h-11 items-center px-1 text-sm font-semibold text-azul hover:text-tinta'

/** Input: 48 px, 16 px, borde #7D8797 (error rojo). */
export const input = (mal = false, mono = false) =>
  cx(
    'h-12 w-full min-w-0 rounded-control bg-card px-3.5 text-base text-tinta transition-[border-color,box-shadow] duration-150 placeholder:text-texto-3 hover:border-tinta/50',
    mal ? 'border-[1.5px] border-rojo' : 'border border-input',
    mono && 'font-mono font-medium',
  )

/** Tarjeta clara: card + sombra teñida + radio 16. */
export const tarjeta = 'rounded-card bg-card shadow-card'
