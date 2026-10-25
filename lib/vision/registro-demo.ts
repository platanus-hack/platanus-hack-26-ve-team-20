// registerDetection de P1 con el aviso por WhatsApp limitado para los dueños de demo (notificarConTope). Lo usan las
// rutas de P2 (multas en vivo y de clips). Solo servidor. Dueño: P2.
import type { RegisterDetection } from "../contracts/index.ts";
import { dispatchAlert } from "../alerts/index.ts";
import { db } from "../db.ts";
import { registerSighting } from "../domain/index.ts";
import { createRegisterDetection } from "../domain/violations.ts";
import { notifyFineIssued } from "../notify/index.ts";
import { notificarConTope } from "./demo-owners.ts";

export const registerDetectionDemo: RegisterDetection = createRegisterDetection({
  db,
  notifyFineIssued: notificarConTope(notifyFineIssued, db),
  registerSighting,
  dispatchAlert,
});
