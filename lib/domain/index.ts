// Punto de entrada del dominio para los handlers de `api/` (P1). Cablea las dependencias reales.
// Importa `lib/db.ts`, así que NO debe importarse desde `src/` ni desde tests unitarios sin base.
import { db } from "../db.ts";
// F13: módulos reales de P3. Con USE_MOCKS=true ellos mismos delegan en sus mocks (lib/*/mock.ts).
// Cambio hecho por P3 en su rama (Edwjon); avisado a P1 en docs/p3-plan-de-trabajo.md §4.
import { dispatchAlert } from "../alerts/index.ts";
import { notifyFineIssued } from "../notify/index.ts";
import type { MarkFinePaid, RegisterDetection, RegisterSighting } from "../contracts/index.ts";
import { createMarkFinePaid } from "./payments.ts";
import { createReviewViolation, type ReviewViolation } from "./review.ts";
import { createRegisterSighting } from "./sightings.ts";
import { createRegisterDetection } from "./violations.ts";

export const registerSighting: RegisterSighting = createRegisterSighting(db);
export const markFinePaid: MarkFinePaid = createMarkFinePaid(db);
export const registerDetection: RegisterDetection = createRegisterDetection({
  db,
  notifyFineIssued,
  registerSighting,
  dispatchAlert,
});
export const reviewViolation: ReviewViolation = createReviewViolation({ db, notifyFineIssued });

export { audit, SYSTEM_ACTOR, type Actor } from "./audit.ts";
export { DomainError, InvalidTransitionError, NotFoundError } from "./errors.ts";
export { effectiveFineStatus, transition } from "./state-machine.ts";
