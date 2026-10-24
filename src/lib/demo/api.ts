// Fachada de la cuenta del ciudadano. Las pantallas importan SIEMPRE de aquí (`@/lib/demo/api.ts`) y no saben
// qué hay detrás:
//   · `real.ts`  → API de verdad (`/api/citizen/*`): cédula + contraseña, código por WhatsApp, multas de la base.
//   · `demo.ts`  → prototipo sin servidor con datos de ejemplo (cédula V99000001, código 123456).
// Se usa la real salvo en tests (que prueban la demo) o con `VITE_CUENTA_API=demo` (para enseñar la pantalla sin
// backend). Ambas exponen exactamente las mismas funciones.
import * as demo from './demo.ts'
import * as real from './real.ts'

export { DemoError, calcularEstadisticas, esPagable, reiniciarDemo } from './demo.ts'
export type { Camara, DatosPago, DemoErrorCode, Estadisticas, Multa, Sesion, Vehiculo } from './demo.ts'

export const USA_API_REAL = import.meta.env?.MODE !== 'test' && import.meta.env?.VITE_CUENTA_API !== 'demo'
const impl: typeof demo & typeof real = (USA_API_REAL ? real : demo) as typeof demo & typeof real

export const alVencerSesion = impl.alVencerSesion
export const sesionVencio = impl.sesionVencio
export const getSesion = impl.getSesion
export const iniciarSesion = impl.iniciarSesion
export const cerrarSesion = impl.cerrarSesion
export const solicitarCodigo = impl.solicitarCodigo
export const getRegistroPendiente = impl.getRegistroPendiente
export const reenviarCodigo = impl.reenviarCodigo
export const verificarCodigo = impl.verificarCodigo
export const contarPendientes = impl.contarPendientes
export const getMultas = impl.getMultas
export const getMulta = impl.getMulta
export const getVehiculos = impl.getVehiculos
export const getPerfil = impl.getPerfil
export const cambiarClave = impl.cambiarClave
export const apelarMulta = impl.apelarMulta
export const pagarMultas = impl.pagarMultas
export const getCamaras = impl.getCamaras
