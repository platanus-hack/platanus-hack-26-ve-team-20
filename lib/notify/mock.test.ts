import { afterEach, describe, expect, it, vi } from 'vitest'
import { notifyFineIssued, notifyOfficerAlert, notifyPaymentConfirmed } from './mock.ts'

describe('mock de lib/notify', () => {
  afterEach(() => vi.restoreAllMocks())

  it('devuelve DRY_RUN por WhatsApp con un providerId distinto por mensaje', async () => {
    const results = await Promise.all([
      notifyFineIssued('fine_1'),
      notifyPaymentConfirmed('fine_1'),
      notifyOfficerAlert('alert_1'),
    ])
    for (const r of results) {
      expect(r.channel).toBe('WHATSAPP')
      expect(r.status).toBe('DRY_RUN')
    }
    expect(new Set(results.map((r) => r.providerId)).size).toBe(3)
  })

  it('no hace llamadas de red', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await notifyFineIssued('fine_1')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
