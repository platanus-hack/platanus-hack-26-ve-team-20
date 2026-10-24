// shortcut: P1 todavía no publica `registerDetection` (lib/domain); esto no guarda nada.
// Reemplazar el import en api/detections.ts por el de lib/domain cuando exista.
import type { RegisterDetection } from "../contracts/index.ts";

export const registerDetectionStub: RegisterDetection = async (r) => ({
  violationId: `stub_${r.idempotencyKey}`,
  status: r.verdict === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "DETECTED",
  duplicate: false,
});
