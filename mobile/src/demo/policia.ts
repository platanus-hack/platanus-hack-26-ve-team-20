// Capa de demo del modo policía. Las alertas nunca traen datos del dueño: solo placa, vehículo y deuda.
import { useSyncExternalStore } from 'react';

import { espera } from './ciudadano';

export const OFICIAL = {
  nombre: 'Oficial Ejemplo A',
  iniciales: 'OA',
  placaOficial: 'OF-0001',
  correo: 'oficial.a@example.com',
};

export const CODIGO_INSTITUCION = 'TRANSITO-DEMO';
export const POSICION_DEMO = 'Av. Demo Norte con Calle 1 (ejemplo)';

export interface Alerta {
  id: string;
  placa: string;
  vehiculo: string;
  multasImpagas: number;
  distanciaM: number;
  interseccion: string;
  cam: string;
  vistoA: string;
}

export const ALERTA_DEMO: Alerta = {
  id: 'al-1',
  placa: 'XY987ZT',
  vehiculo: 'Camioneta blanca (ejemplo)',
  multasImpagas: 2,
  distanciaM: 420,
  interseccion: 'Av. Demo Norte con Calle 1 (ejemplo)',
  cam: 'CAM-001',
  vistoA: '10:04',
};

export const institucionValida = (codigo: string) => codigo.trim().toUpperCase() === CODIGO_INSTITUCION;

// Placa de oficial y código de institución: mayúsculas, dígitos y guiones.
export const soloCodigo = (t: string) => t.toUpperCase().replace(/[^A-Z0-9-]/g, '');

export function validarLoginOficial(correo: string, clave: string): boolean {
  return correo.includes('@') && clave.length >= 8 && clave !== 'clave-mal';
}

export type ResultadoPlaca =
  | { tipo: 'formato'; placa: string }
  | { tipo: 'deuda'; placa: string; multas: number; vehiculo: string; totalCents: number }
  | { tipo: 'alDia'; placa: string };

export const normalizarPlaca = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function evaluarPlaca(entrada: string): ResultadoPlaca {
  const placa = normalizarPlaca(entrada);
  if (!/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(placa)) return { tipo: 'formato', placa };
  if (placa === ALERTA_DEMO.placa) return { tipo: 'deuda', placa, multas: 2, vehiculo: ALERTA_DEMO.vehiculo, totalCents: 250000 };
  return { tipo: 'alDia', placa };
}

export async function entrarOficial(correo: string, clave: string) {
  await espera(500);
  return validarLoginOficial(correo, clave);
}

// "Continuar con Google" simulado: no hay OAuth real en esta entrega.
export async function entrarConGoogle() {
  await espera(1300);
  return { primerAcceso: true };
}

export async function consultarPlaca(entrada: string) {
  await espera(400);
  return evaluarPlaca(entrada);
}

// ---- estado de la sesión del oficial (compartido entre pestañas)

export interface EstadoOficial {
  servicio: boolean;
  posicionDemo: boolean;
  geo: 'pendiente' | 'ok' | 'sin';
  alerta: 'ninguna' | 'activa' | 'recibida';
  recibidaA: string | null;
}

const inicial: EstadoOficial = { servicio: true, posicionDemo: false, geo: 'pendiente', alerta: 'ninguna', recibidaA: null };
let estado = inicial;
const oyentes = new Set<() => void>();

export function setOficial(next: Partial<EstadoOficial>) {
  estado = { ...estado, ...next };
  oyentes.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  oyentes.add(l);
  return () => oyentes.delete(l);
};

export const useOficial = () => useSyncExternalStore(subscribe, () => estado, () => estado);
export const getOficial = () => estado;
export const reiniciarOficial = () => setOficial(inicial);
