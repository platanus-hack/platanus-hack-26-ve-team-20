export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ')

// Botones: 48 px, radio 12, presionar .98 · 120 ms.
export type Variante = 'pay' | 'primary' | 'outline'
const VARIANTE: Record<Variante, string> = {
  pay: 'bg-rojo text-card hover:bg-rojo-osc',
  primary: 'bg-tinta text-card',
  outline: 'border border-input bg-card text-tinta',
}
export const boton = (v: Variante = 'primary', extra?: string) =>
  cx('press inline-flex h-12 items-center justify-center gap-2 rounded-control px-5 text-base font-semibold disabled:opacity-60', VARIANTE[v], extra)

/** Enlace de texto azul con área táctil de 44 px. */
export const enlace = 'inline-flex min-h-11 items-center px-1 text-sm font-semibold text-azul hover:text-tinta'

/** Input: 48 px, 16 px, borde #7D8797 (error rojo). */
export const input = (mal = false, mono = false) =>
  cx(
    'h-12 w-full min-w-0 rounded-control bg-card px-3.5 text-base text-tinta placeholder:text-texto-3',
    mal ? 'border-[1.5px] border-rojo' : 'border border-input',
    mono && 'font-mono font-medium',
  )

/** Tarjeta clara: card + sombra teñida + radio 16. */
export const tarjeta = 'rounded-card bg-card shadow-card'
