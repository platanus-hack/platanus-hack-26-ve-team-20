import { describe, expect, it } from 'vitest'
import {
  fineIssuedText,
  fineUrl,
  formatAmount,
  formatCaracasDateTime,
  formatDistance,
  officerAlertText,
  paymentConfirmedText,
} from './templates.ts'

// 14:03 UTC = 10:03 en Caracas (UTC-4, sin horario de verano)
const OCCURRED_AT = '2026-10-24T14:03:10.100Z'

describe('formatos', () => {
  it('fecha y hora en Caracas, con espacios normales', () => {
    expect(formatCaracasDateTime(OCCURRED_AT)).toBe('24/10/2026, 10:03 a. m.')
    expect(formatCaracasDateTime(new Date('2026-10-24T02:30:00Z'))).toBe('23/10/2026, 10:30 p. m.')
  })

  it('montos desde céntimos enteros', () => {
    expect(formatAmount(123456, 'VES')).toBe('Bs. 1.234,56')
    expect(formatAmount(5000, 'USD')).toBe('USD 50,00')
    expect(formatAmount(0, 'VES')).toBe('Bs. 0,00')
    expect(formatAmount(100, 'EUR')).toBe('EUR 1,00')
  })

  it('distancia en metros o kilómetros', () => {
    expect(formatDistance(420)).toBe('420 m')
    expect(formatDistance(999.6)).toBe('1000 m')
    expect(formatDistance(1500)).toBe('1,5 km')
    expect(formatDistance(3000)).toBe('3 km')
  })

  it('link de la multa sin doble barra', () => {
    expect(fineUrl('https://smartvia-smart-via.vercel.app/', 'tok123')).toBe('https://smartvia-smart-via.vercel.app/multa/tok123')
  })

  it('ningún texto lleva espacios no separables', () => {
    const texts = [formatCaracasDateTime(OCCURRED_AT), formatAmount(123456, 'VES'), formatDistance(1500)]
    for (const t of texts) expect(t).not.toMatch(/[  ]/)
  })
})

describe('mensajes de WhatsApp (docs/04 §7)', () => {
  it('aviso de multa con placa enmascarada y link', () => {
    expect(
      fineIssuedText({
        type: 'RED_LIGHT',
        intersection: 'Av. Demo Norte con Calle 1 (ejemplo)',
        occurredAt: OCCURRED_AT,
        plate: 'ab-123-cd',
        amountCents: 123456,
        currency: 'VES',
        fineToken: 'x7GqToken',
        appBaseUrl: 'https://smartvia-smart-via.vercel.app',
      }),
    ).toBe(
      'SmartTraffic (demo). Se registró una posible infracción: luz roja en Av. Demo Norte con Calle 1 (ejemplo), ' +
        '24/10/2026, 10:03 a. m. (hora de Caracas), vehículo placa AB***CD. Monto de ejemplo: Bs. 1.234,56. ' +
        'Vea la evidencia, pague o apele aquí: https://smartvia-smart-via.vercel.app/multa/x7GqToken',
    )
  })

  it('confirmación de pago simulado', () => {
    expect(paymentConfirmedText({ reference: 'SIM-48213977', plate: 'AB123CD' })).toBe(
      'SmartTraffic (demo). Pago simulado recibido. Ref SIM-48213977. Multa AB***CD saldada.',
    )
  })

  it('alerta al oficial con placa completa, minutos y distancia', () => {
    expect(
      officerAlertText({
        plate: 'xy 987 zt',
        vehicle: 'Camioneta blanca (ejemplo)',
        unpaidCount: 2,
        intersection: 'Av. Demo Norte con Calle 1 (ejemplo)',
        seenAt: '2026-10-24T14:00:00Z',
        distanceM: 420,
        now: new Date('2026-10-24T14:03:30Z'),
      }),
    ).toBe(
      'SmartTraffic · Alerta: vehículo XY987ZT (Camioneta blanca (ejemplo)) con 2 multas impagas visto en ' +
        'Av. Demo Norte con Calle 1 (ejemplo) hace 3 min, a 420 m de su posición. Verifique antes de actuar.',
    )
  })

  it('alerta en singular y recién vista', () => {
    const text = officerAlertText({
      plate: 'XY987ZT',
      vehicle: 'Sedán gris (ejemplo)',
      unpaidCount: 1,
      intersection: 'Calle Demo (ejemplo)',
      seenAt: '2026-10-24T14:00:00Z',
      distanceM: 1500,
      now: new Date('2026-10-24T14:00:20Z'),
    })
    expect(text).toContain('con 1 multa impaga visto')
    expect(text).toContain('hace menos de 1 min, a 1,5 km de su posición')
  })
})
