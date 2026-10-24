// Una sola Vercel Function para la red de choques en vivo (el plan Hobby admite 12 funciones por deploy).
// vercel.json reescribe /api/choques/* a /api/choques?route=…; los handlers viven en api/_choques/.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendError } from "./_lib/respond.ts";
import alertaPerdida from "./_choques/alerta-perdida.ts";
import clipSubir from "./_choques/clip-subir.ts";
import clipVer from "./_choques/clip-ver.ts";
import incidente from "./_choques/incidente.ts";
import latido from "./_choques/latido.ts";
import red from "./_choques/red.ts";

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void;

export const CHOQUES_ROUTES: Record<string, Handler> = {
  "latido": latido, //                 POST /api/choques/latido
  "red": red, //                       GET  /api/choques/red
  "incidente": incidente, //           POST /api/choques/incidentes
  "clip-subir": clipSubir, //          POST /api/choques/alertas/:id/clip
  "alerta-perdida": alertaPerdida, //  POST /api/choques/alertas/:id/perdida
  "clip-ver": clipVer, //              GET  /api/choques/clips/:id
};

export default function choques(req: VercelRequest, res: VercelResponse) {
  const route = req.query["route"];
  const fn = typeof route === "string" ? CHOQUES_ROUTES[route] : undefined;
  if (!fn) return sendError(res, "NOT_FOUND", "Ruta no encontrada");
  return fn(req, res);
}
