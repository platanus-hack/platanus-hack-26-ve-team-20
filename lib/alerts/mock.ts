// Mock de lib/alerts (P3) con la firma de lib/contracts/modules.ts. Se activa con USE_MOCKS=true
// mientras no exista lib/alerts/dispatch.ts. No toca la DB: siempre hay un oficial a 420 m.
import type { DispatchAlert } from "../contracts/index.ts";

export const MOCK_OFFICER_ID = "officer_mock_of0001";
export const MOCK_DISTANCE_M = 420;

export const dispatchAlert = (async (sightingId) => ({
  alertId: `alert_mock_${sightingId}`,
  status: "SENT",
  officerId: MOCK_OFFICER_ID,
  distanceM: MOCK_DISTANCE_M,
})) satisfies DispatchAlert;
