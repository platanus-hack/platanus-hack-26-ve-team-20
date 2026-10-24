// Háptica, vibración y almacenamiento con fallback en web.
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { Platform, Vibration } from 'react-native';

const web = Platform.OS === 'web';

export function hapticaExito() {
  if (!web) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

// Patrón en ms alternando vibrar/pausar, como navigator.vibrate.
export function vibrar(patron: number[]) {
  try {
    if (web) globalThis.navigator?.vibrate?.(patron);
    else Vibration.vibrate([0, ...patron]);
  } catch {
    // sin vibración disponible
  }
}

export async function leer(clave: string): Promise<string | null> {
  try {
    return web ? globalThis.localStorage?.getItem(clave) ?? null : await SecureStore.getItemAsync(clave);
  } catch {
    return null;
  }
}

export async function guardar(clave: string, valor: string | null): Promise<void> {
  try {
    if (web) {
      if (valor === null) globalThis.localStorage?.removeItem(clave);
      else globalThis.localStorage?.setItem(clave, valor);
    } else if (valor === null) await SecureStore.deleteItemAsync(clave);
    else await SecureStore.setItemAsync(clave, valor);
  } catch {
    // almacenamiento no disponible: la sesión dura lo que dure la app
  }
}

export type Modo = 'ciudadano' | 'policia';
const SESION = 'smarttraffic.sesion';

// Copia en memoria con suscriptores: la guardia de rutas se re-renderiza al instante tras login/logout.
let sesionActual: Modo | null = null;
const oyentes = new Set<() => void>();
const fijarSesion = (modo: Modo | null) => {
  sesionActual = modo;
  oyentes.forEach((cb) => cb());
};
export const sesionEnMemoria = () => sesionActual;
export const suscribirSesion = (cb: () => void) => {
  oyentes.add(cb);
  return () => { oyentes.delete(cb); };
};

export const leerSesion = async (): Promise<Modo | null> => {
  const v = await leer(SESION);
  fijarSesion(v === 'ciudadano' || v === 'policia' ? v : null);
  return sesionActual;
};
export const guardarSesion = (modo: Modo | null) => {
  fijarSesion(modo);
  return guardar(SESION, modo);
};

// Ajustes del modo cámara
export const CLAVE_CAMARA = 'smarttraffic.camara.clave';
export const URL_API = 'smarttraffic.camara.url';
export const CODIGO_CAMARA = 'smarttraffic.camara.codigo';
