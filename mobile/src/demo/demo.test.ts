import { describe, expect, it, vi } from 'vitest';

import { SinConexionError, duracionClip, sendEvent, urlValida, type DetectionRequest } from './camara';
import { aplicarPago, multasBase, referenciaSimulada, resultadoPago, validarLogin, validarRegistro, verificarCodigo } from './ciudadano';
import { bs, decimal, fechaCaracas, horaCaracas } from './format';
import { evaluarPlaca, institucionValida, validarLoginOficial } from './policia';

describe('formato', () => {
  it('monto en bolívares es-VE', () => {
    expect(bs(125000)).toBe('Bs. 1.250,00');
    expect(bs(250000)).toBe('Bs. 2.500,00');
    expect(bs(0)).toBe('Bs. 0,00');
    expect(bs(99)).toBe('Bs. 0,99');
    expect(bs(123456789)).toBe('Bs. 1.234.567,89');
  });

  it('hora 24 h en Caracas (UTC-4)', () => {
    const d = new Date('2026-10-24T14:03:00Z');
    expect(horaCaracas(d)).toBe('10:03');
    expect(fechaCaracas(d)).toBe('24/10/2026');
    expect(horaCaracas(new Date('2026-10-25T02:30:00Z'))).toBe('22:30');
    expect(fechaCaracas(new Date('2026-10-25T02:30:00Z'))).toBe('24/10/2026');
  });

  it('decimales con coma', () => {
    expect(decimal(0.91)).toBe('0,91');
    expect(decimal(3.8, 1)).toBe('3,8');
  });
});

describe('ciudadano', () => {
  it('código de WhatsApp del prototipo', () => {
    expect(verificarCodigo('123456')).toBe('ok');
    expect(verificarCodigo('000000')).toBe('invalido');
    expect(verificarCodigo('')).toBe('invalido');
  });

  it('registro', () => {
    const ok = { ced: '99000001', tel: '0412-0000001', c1: 'demo1234', c2: 'demo1234' };
    expect(validarRegistro(ok)).toBeNull();
    expect(validarRegistro({ ...ok, ced: '12345678' })).toBe('yaRegistrada');
    expect(validarRegistro({ ...ok, tel: '0212-0000001' })).toBe('telefono');
    expect(validarRegistro({ ...ok, c1: 'corta', c2: 'corta' })).toBe('claveCorta');
    expect(validarRegistro({ ...ok, c2: 'otra-clave' })).toBe('noCoinciden');
  });

  it('login', () => {
    expect(validarLogin('99000001', 'demo1234')).toBe(true);
    expect(validarLogin('99000001', 'clave-mal')).toBe(false);
    expect(validarLogin('99000001', 'corta')).toBe(false);
    expect(validarLogin('12', 'demo1234')).toBe(false);
  });

  it('pago simulado: claves especiales', () => {
    expect(resultadoPago('000000')).toBe('clave');
    expect(resultadoPago('111111')).toBe('fondos');
    expect(resultadoPago('123456')).toBe('aprobado');
  });

  it('referencia SIM-########', () => {
    expect(referenciaSimulada(() => 0.48213977)).toBe('SIM-48213977');
    expect(referenciaSimulada(() => 0)).toBe('SIM-00000000');
    expect(referenciaSimulada()).toMatch(/^SIM-\d{8}$/);
  });

  it('pagar deja al día solo las multas pendientes elegidas', () => {
    const base = multasBase();
    const pagadas = aplicarPago(base, ['m1', 'm2', 'm6'], '24/10/2026', () => 0.5);
    expect(pagadas.find((m) => m.id === 'm1')).toMatchObject({ estado: 'PAGADA', ref: 'SIM-50000000', pagadaEl: '24/10/2026' });
    expect(pagadas.find((m) => m.id === 'm2')?.estado).toBe('PAGADA');
    expect(pagadas.find((m) => m.id === 'm6')?.estado).toBe('ANULADA');
    expect(pagadas.filter((m) => m.estado === 'PENDIENTE' || m.estado === 'VENCIDA')).toHaveLength(0);
    expect(base.find((m) => m.id === 'm1')?.estado).toBe('PENDIENTE');
  });
});

describe('policía y cámara', () => {
  it('código de institución', () => {
    expect(institucionValida('TRANSITO-DEMO')).toBe(true);
    expect(institucionValida(' transito-demo ')).toBe(true);
    expect(institucionValida('OTRO')).toBe(false);
  });

  it('login de oficial', () => {
    expect(validarLoginOficial('oficial.a@example.com', 'demo1234')).toBe(true);
    expect(validarLoginOficial('oficial.a@example.com', 'clave-mal')).toBe(false);
    expect(validarLoginOficial('sin-arroba', 'demo1234')).toBe(false);
  });

  it('consulta de placa sin datos del dueño', () => {
    expect(evaluarPlaca('xy-987 zt')).toEqual({ tipo: 'deuda', placa: 'XY987ZT', multas: 2, vehiculo: 'Camioneta blanca (ejemplo)', totalCents: 250000 });
    expect(evaluarPlaca('AB123CD')).toEqual({ tipo: 'alDia', placa: 'AB123CD' });
    expect(evaluarPlaca('ABC')).toEqual({ tipo: 'formato', placa: 'ABC' });
  });

  it('URL de la API', () => {
    expect(urlValida('https://api.demo.smarttraffic.example')).toBe(true);
    expect(urlValida('api sin esquema')).toBe(false);
  });

  it('duración del clip siempre > 0 y como máximo 4 s', () => {
    expect(duracionClip(1000, 1000)).toBe(1);
    expect(duracionClip(1000, 3500)).toBe(2500);
    expect(duracionClip(0, 9999)).toBe(4000);
  });

  it('subida: sin conexión guarda el % y el reintento sigue desde ahí hasta 100', async () => {
    vi.useFakeTimers();
    try {
      const req: DetectionRequest = {
        cameraCode: 'CAM-001',
        type: 'RED_LIGHT',
        clip: { url: 'https://blob.example/clips/CAM-001-1.mp4', startedAt: new Date(0).toISOString(), durationMs: duracionClip(0, 2500) },
        clockOffsetMs: 0,
        idempotencyKey: 'evt-test-0001',
      };
      expect(req.clip.durationMs).toBeGreaterThan(0);
      const vistos: number[] = [];
      const onProgress = (p: number) => vistos.push(p);

      const fallo = sendEvent(req, { apiUrl: 'api sin esquema', cameraKey: '', onProgress }).catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      const e = await fallo;
      expect(e).toBeInstanceOf(SinConexionError);
      const pct = (e as SinConexionError).pct;
      expect(pct).toBe(48);
      expect(vistos.at(-1)).toBe(pct);

      const ok = sendEvent(req, { apiUrl: 'https://api.demo.smarttraffic.example', cameraKey: '', onProgress }, pct);
      await vi.runAllTimersAsync();
      await expect(ok).resolves.toMatchObject({ verdict: 'VIOLATION' });
      expect(vistos.at(-1)).toBe(100);
      expect(vistos.every((p, i) => i === 0 || p > vistos[i - 1])).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
