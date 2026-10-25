// Capa de demo del modo cámara. Los tipos copian lib/contracts (DetectionRequest / DetectionResultDTO)
// porque mobile/ es un proyecto independiente y no importa del repo raíz.
import { espera } from './ciudadano';

export const CAMARA_DEFECTO = {
  apiUrl: process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.demo.smarttraffic.example',
  codigo: 'CAM-001',
  interseccion: 'Av. Demo Norte con Calle 1',
  // Ubicación registrada de CAM-001 (ejemplo); se usa cuando no hay GPS.
  lat: 10.5,
  lng: -66.9,
};

export const DURACION_CLIP_MS = 4000;

// Duración real del clip en ms: nunca 0 ni más que el máximo.
export const duracionClip = (inicio: number, ahora = Date.now()) => Math.min(DURACION_CLIP_MS, Math.max(1, ahora - inicio));

export type LightState = 'RED' | 'YELLOW' | 'GREEN' | 'UNKNOWN';
export type Verdict = 'VIOLATION' | 'NO_VIOLATION' | 'NEEDS_REVIEW';

export interface DetectionRequest {
  cameraCode: string;
  type: 'RED_LIGHT' | 'TURN_ARROW' | 'SPEEDING';
  clip: { url: string; startedAt: string; durationMs: number };
  clockOffsetMs: number;
  device?: { lat: number; lng: number; accuracyM?: number };
  idempotencyKey: string;
}

export interface DetectionResult {
  verdict: Verdict;
  plate: string | null;
  confidence: number;
  crossing: { crossedStopLine: boolean; lightState: LightState };
  motion: { speedKmh: number | null; laneId: string | null; relation: 'WITH_FLOW' | 'AGAINST_FLOW' | 'UNKNOWN' };
  latencyMs: number;
}

export interface EnvioOpciones {
  apiUrl: string;
  cameraKey: string;
  onProgress: (pct: number) => void;
}

export class SinConexionError extends Error {
  pct: number;
  constructor(pct: number) {
    super("Sin conexión a la API");
    this.pct = pct;
  }
}

export function nuevaClaveEvento(numero: number, ahora = Date.now()): string {
  return `evt-${ahora.toString(36)}-${numero.toString().padStart(4, '0')}`;
}

export const urlValida = (url: string) => /^https?:\/\/\S+$/.test(url.trim());

// GET /api/time → desfase entre el reloj del teléfono y el del servidor.
// shortcut: simulado (devuelve 0 tras 3,5 s); conectar a `${apiUrl}/api/time` cuando exista api/time.ts.
export async function sincronizarReloj(_apiUrl: string): Promise<number> {
  await espera(3500);
  return 0;
}

// Sube el clip a Blob y llama a POST /api/detections. Reintentar con la misma idempotencyKey.
// shortcut: subida y análisis simulados; falta pedir token a POST /api/blob/upload (X-Camera-Key),
// subir el clip a Vercel Blob y hacer POST `${apiUrl}/api/detections` con `req`.
export async function sendEvent(req: DetectionRequest, opts: EnvioOpciones, desdePct = 0): Promise<DetectionResult> {
  for (let pct = desdePct; pct < 100; ) {
    await espera(120);
    pct = Math.min(100, pct + 8);
    // En la demo, una URL de API inválida simula "sin conexión" a mitad de la subida.
    if (pct > 50 && !urlValida(opts.apiUrl)) throw new SinConexionError(pct - 8);
    opts.onProgress(pct);
  }
  return {
    verdict: 'VIOLATION',
    plate: 'AB123CD',
    confidence: 0.91,
    crossing: { crossedStopLine: true, lightState: 'RED' },
    motion: { speedKmh: 42, laneId: 'C1', relation: 'WITH_FLOW' },
    latencyMs: 3800,
  };
}
