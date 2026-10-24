// Capa de demo del modo ciudadano: fixtures ficticios y reglas del prototipo del canvas.
// No hay backend de cuentas todavía; todo vive en memoria con latencia simulada.
import { useSyncExternalStore } from 'react';

export type EstadoMulta = 'PENDIENTE' | 'VENCIDA' | 'PAGADA' | 'APELADA' | 'ANULADA';
export type TipoInfraccion = 'Luz roja' | 'Flecha de giro' | 'Exceso de velocidad';

export interface Multa {
  id: string;
  placa: string;
  tipo: TipoInfraccion;
  fecha: string;
  hora: string;
  mes: string;
  lugar: string;
  cam: string;
  estado: EstadoMulta;
  amountCents: number;
  vence?: string;
  ref?: string;
  pagadaEl?: string;
  motivo?: string;
  verif: 'Verificado automáticamente' | 'Verificado por operador';
  conf: string;
}

export interface Vehiculo {
  placa: string;
  modelo: string;
  detalle: string;
  descripcion: string;
}

export const CIUDADANO = {
  cedula: 'V-99000001',
  telefono: '0412-0000001',
  telefonoOculto: '0412-***0001',
};

export const MONTO_MULTA = 125000;

const L1 = 'Av. Demo Norte con Calle 1 (ejemplo)';
const L2 = 'Av. Demo Sur con Calle 4 (ejemplo)';
const L3 = 'Av. Demo Este con Calle 3 (ejemplo)';
const L4 = 'Av. Demo Oeste con Calle 2 (ejemplo)';

export function multasBase(): Multa[] {
  const m = MONTO_MULTA;
  return [
    { id: 'm1', placa: 'AB123CD', tipo: 'Luz roja', fecha: '24/10/2026', hora: '10:03', mes: 'Octubre 2026', lugar: L1, cam: 'CAM-001', estado: 'PENDIENTE', amountCents: m, vence: '23/11/2026', verif: 'Verificado automáticamente', conf: '0,91' },
    { id: 'm2', placa: 'CD456EF', tipo: 'Flecha de giro', fecha: '21/09/2026', hora: '08:47', mes: 'Septiembre 2026', lugar: L3, cam: 'CAM-003', estado: 'VENCIDA', amountCents: m, vence: '21/10/2026', verif: 'Verificado por operador', conf: '0,78' },
    { id: 'm3', placa: 'AB123CD', tipo: 'Exceso de velocidad', fecha: '02/08/2026', hora: '18:20', mes: 'Agosto 2026', lugar: L2, cam: 'CAM-002', estado: 'PAGADA', amountCents: m, ref: 'SIM-30418822', pagadaEl: '05/08/2026', verif: 'Verificado por operador', conf: '0,86' },
    { id: 'm4', placa: 'AB123CD', tipo: 'Luz roja', fecha: '15/06/2026', hora: '07:55', mes: 'Junio 2026', lugar: L2, cam: 'CAM-002', estado: 'PAGADA', amountCents: m, ref: 'SIM-27115409', pagadaEl: '18/06/2026', verif: 'Verificado automáticamente', conf: '0,94' },
    { id: 'm5', placa: 'AB123CD', tipo: 'Luz roja', fecha: '03/04/2026', hora: '13:10', mes: 'Abril 2026', lugar: L1, cam: 'CAM-001', estado: 'PAGADA', amountCents: m, ref: 'SIM-19902376', pagadaEl: '04/04/2026', verif: 'Verificado automáticamente', conf: '0,92' },
    { id: 'm6', placa: 'AB123CD', tipo: 'Luz roja', fecha: '11/03/2026', hora: '22:31', mes: 'Marzo 2026', lugar: L4, cam: 'CAM-004', estado: 'ANULADA', amountCents: m, motivo: 'vehículo de emergencia', verif: 'Verificado por operador', conf: '0,89' },
  ];
}

export const VEHICULOS: Vehiculo[] = [
  { placa: 'AB123CD', modelo: 'Toyota Corolla 2018', detalle: 'Gris · ejemplo', descripcion: 'Toyota Corolla gris 2018 (ejemplo)' },
  { placa: 'CD456EF', modelo: 'Chevrolet Aveo 2012', detalle: 'Blanco · ejemplo', descripcion: 'Chevrolet Aveo blanco 2012 (ejemplo)' },
];

export const esPendiente = (m: Multa) => m.estado === 'PENDIENTE' || m.estado === 'VENCIDA';

// ---- reglas puras (cubiertas por tests)

export const TELEFONO_RE = /^04(12|14|16|24|26)\d{7}$/;
export const telefonoValido = (tel: string) => TELEFONO_RE.test(tel.replace(/\D/g, ''));
export const cedulaValida = (ced: string) => /^\d{6,9}$/.test(ced);

export function validarLogin(ced: string, clave: string): boolean {
  return cedulaValida(ced) && clave.length >= 8 && clave !== 'clave-mal';
}

export type ErrorRegistro = 'yaRegistrada' | 'telefono' | 'claveCorta' | 'noCoinciden';

export function validarRegistro(d: { ced: string; tel: string; c1: string; c2: string }): ErrorRegistro | null {
  if (d.ced === '12345678') return 'yaRegistrada';
  if (!telefonoValido(d.tel)) return 'telefono';
  if (d.c1.length < 8) return 'claveCorta';
  if (d.c1 !== d.c2) return 'noCoinciden';
  return null;
}

// Prototipo: 123456 es válido; cualquier otro (p. ej. 000000) es inválido.
export const verificarCodigo = (codigo: string): 'ok' | 'invalido' => (codigo === '123456' ? 'ok' : 'invalido');

export type RechazoPago = 'clave' | 'fondos';

// Prototipo: 000000 = clave inválida, 111111 = fondos insuficientes, el resto se aprueba.
export function resultadoPago(clave: string): RechazoPago | 'aprobado' {
  if (clave === '000000') return 'clave';
  if (clave === '111111') return 'fondos';
  return 'aprobado';
}

export const claveC2PValida = (clave: string) => /^\d{6,8}$/.test(clave);

export function referenciaSimulada(rand: () => number = Math.random): string {
  return 'SIM-' + Math.floor(rand() * 1e8).toString().padStart(8, '0');
}

export function aplicarPago(
  multas: Multa[],
  ids: string[],
  pagadaEl: string,
  rand: () => number = Math.random,
): Multa[] {
  return multas.map((m): Multa => (ids.includes(m.id) && esPendiente(m) ? { ...m, estado: 'PAGADA', ref: referenciaSimulada(rand), pagadaEl } : m));
}

// ---- store en memoria (sesión de demo)

interface EstadoCiudadano {
  multas: Multa[];
  notificacionVista: boolean;
}

let estado: EstadoCiudadano = { multas: multasBase(), notificacionVista: false };
const oyentes = new Set<() => void>();

function set(next: Partial<EstadoCiudadano>) {
  estado = { ...estado, ...next };
  oyentes.forEach((l) => l());
}

function subscribe(l: () => void) {
  oyentes.add(l);
  return () => oyentes.delete(l);
}

export function useCiudadano(): EstadoCiudadano {
  return useSyncExternalStore(subscribe, () => estado, () => estado);
}

export const getMultas = () => estado.multas;
export const marcarNotificacionVista = () => set({ notificacionVista: true });
export const reiniciarCiudadano = () => set({ multas: multasBase(), notificacionVista: false });

export function apelar(id: string) {
  set({ multas: estado.multas.map((m): Multa => (m.id === id && esPendiente(m) ? { ...m, estado: 'APELADA' } : m)) });
}

export const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function entrar(ced: string, clave: string): Promise<boolean> {
  await espera(500);
  return validarLogin(ced, clave);
}

export async function enviarCodigo(d: { ced: string; tel: string; c1: string; c2: string }): Promise<ErrorRegistro | null> {
  await espera(600);
  return validarRegistro(d);
}

export async function confirmarCodigo(codigo: string): Promise<'ok' | 'invalido'> {
  await espera(500);
  return verificarCodigo(codigo);
}

export async function pagarMultas(
  ids: string[],
  clave: string,
  pagadaEl: string,
): Promise<{ ok: true; multas: Multa[] } | { ok: false; rechazo: RechazoPago }> {
  await espera(1250);
  const r = resultadoPago(clave);
  if (r !== 'aprobado') return { ok: false, rechazo: r };
  set({ multas: aplicarPago(estado.multas, ids, pagadaEl) });
  return { ok: true, multas: estado.multas.filter((m) => ids.includes(m.id)) };
}
