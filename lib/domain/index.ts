// Punto de entrada del dominio para los handlers de `api/` (P1). Cablea las dependencias reales.
// Importa `lib/db.ts`, así que NO debe importarse desde `src/` ni desde tests unitarios sin base.
import { db } from "../db.ts";
// F13: módulos reales de P3. Con USE_MOCKS=true ellos mismos delegan en sus mocks (lib/*/mock.ts).
// Cambio hecho por P3 en su rama (Edwjon); avisado a P1 en docs/p3-plan-de-trabajo.md §4.
import { dispatchAlert } from "../alerts/index.ts";
import { notifyFineIssued } from "../notify/index.ts";
import type { MarkFinePaid, RegisterDetection, RegisterSighting } from "../contracts/index.ts";
import { normalizeCedula } from "../contracts/index.ts";
import { createCitizenService } from "./citizen.ts";
import { createCodeSender } from "./citizen-sender.ts";
import { createOfficerFinesService } from "./officer-fines.ts";
import { createInviteSender } from "./officer-invite-sender.ts";
import { createOfficerInviteService } from "./officer-invitations.ts";
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

/**
 * Cuenta del ciudadano. `CITIZEN_DEMO_CODE` + `DEMO_CEDULA` (ambas, solo para demos) hacen válido ese código para
 * esa cédula sin enviar nada por WhatsApp; sin ellas la verificación exige el código real.
 * Por ahora el registro no pide código (el envío falla en producción); `CITIZEN_WHATSAPP_CODE=true` lo exige.
 */
export const citizen = createCitizenService({
  db,
  sendCode: createCodeSender(),
  requireCode: () => process.env["CITIZEN_WHATSAPP_CODE"]?.trim().toLowerCase() === "true",
  demo: () => {
    const code = process.env["CITIZEN_DEMO_CODE"] ?? "";
    const cedula = normalizeCedula(process.env["DEMO_CEDULA"] ?? "");
    return /^\d{6}$/.test(code) && /^[VE]\d{5,9}$/.test(cedula) ? { cedula, code } : undefined;
  },
});

/** Invitaciones por correo a oficiales (docs/04 §0d). El enlace usa `APP_BASE_URL`. */
export const officerInvites = createOfficerInviteService({
  db,
  sendInvite: createInviteSender(),
  baseUrl: () => process.env["APP_BASE_URL"] ?? "http://localhost:5173",
});

/** Historial de multas del oficial y reenvío de la notificación (docs/12). */
export const officerFines = createOfficerFinesService({ db, notify: notifyFineIssued });

export { audit, SYSTEM_ACTOR, type Actor } from "./audit.ts";
export { DomainError, InvalidTransitionError, NotFoundError } from "./errors.ts";
export { effectiveFineStatus, transition } from "./state-machine.ts";
