// lib/alerts (P3): dispatchAlert de lib/contracts/modules.ts. Con USE_MOCKS=true usa mock.ts.
// La DB se carga al primer uso: importar este módulo no exige DATABASE_URL.
import type { DispatchAlert } from "../contracts/index.ts";
import { notifyOfficerAlert } from "../notify/index.ts";
import { alertRadiusFromEnv } from "./decide.ts";
import type { createDispatcher } from "./dispatch.ts";
import * as mock from "./mock.ts";

type Dispatcher = ReturnType<typeof createDispatcher>;
let real: Promise<Dispatcher> | null = null;

function dispatcher(): Promise<Dispatcher> {
  real ??= Promise.all([import("../db.ts"), import("./dispatch.ts")]).then(([{ db }, { createDispatcher: create }]) =>
    create({ db, notifyOfficerAlert, radiusM: alertRadiusFromEnv() }),
  );
  return real;
}

export const dispatchAlert = (async (sightingId) =>
  process.env.USE_MOCKS === "true" ? mock.dispatchAlert(sightingId) : (await dispatcher()).dispatchAlert(sightingId)) satisfies DispatchAlert;
