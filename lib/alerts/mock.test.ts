import { describe, expect, it } from 'vitest'
import { ALERT_STATUSES } from '../contracts/index.ts'
import { MOCK_DISTANCE_M, MOCK_OFFICER_ID, dispatchAlert } from './mock.ts'

describe('mock de lib/alerts', () => {
  it('asigna siempre el oficial de ejemplo con un estado válido', async () => {
    const r = await dispatchAlert('sighting_1')
    expect(ALERT_STATUSES).toContain(r.status)
    expect(r).toEqual({
      alertId: 'alert_mock_sighting_1',
      status: 'SENT',
      officerId: MOCK_OFFICER_ID,
      distanceM: MOCK_DISTANCE_M,
    })
  })
})
