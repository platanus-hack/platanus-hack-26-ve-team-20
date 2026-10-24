// Punto de entrada del dominio para los handlers de `api/` (P1). Cablea las dependencias reales.
// Importa `lib/db.ts`, así que NO debe importarse desde `src/` ni desde tests unitarios sin base.
import { db } from "../db.ts";
// TODO(F13): reemplazar el mock de P3 por `lib/notify` real cuando exista (USE_MOCKS=false).
import { notifyFineIssued } from "../notify/mock.ts";
import type { RegisterDetection } from "../contracts/index.ts";
import { createRegisterDetection } from "./violations.ts";

export const registerDetection: RegisterDetection = createRegisterDetection({ db, notifyFineIssued });

export { audit, SYSTEM_ACTOR, type Actor } from "./audit.ts";
export { DomainError, InvalidTransitionError, NotFoundError } from "./errors.ts";
export { effectiveFineStatus, transition } from "./state-machine.ts";
