// Una sola Vercel Function para las rutas de P1 (el plan Hobby admite 12 funciones por deploy y P2 y P3
// también necesitan las suyas). vercel.json reescribe las URLs públicas de docs/04 a /api/p1?route=…, así
// que los clientes no cambian. Los handlers viven en api/_p1/ (el prefijo `_` evita que Vercel los
// cuente como funciones). Cada handler valida su método y su sesión con handler() y las guardas de
// api/_lib/auth.ts. Un test comprueba que este mapa y vercel.json estén sincronizados.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendError } from "./_lib/respond.ts";
import authLogin from "./_p1/auth-login.ts";
import authLogout from "./_p1/auth-logout.ts";
import authMe from "./_p1/auth-me.ts";
import violationDetail from "./_p1/violation-detail.ts";
import violationReview from "./_p1/violation-review.ts";
import violationsList from "./_p1/violations-list.ts";

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void;

/** route → handler. */
export const P1_ROUTES: Record<string, Handler> = {
  "auth-login": authLogin, //             POST /api/auth/login
  "auth-logout": authLogout, //           POST /api/auth/logout
  "auth-me": authMe, //                   GET  /api/auth/me
  "violations-list": violationsList, //   GET  /api/violations
  "violation-detail": violationDetail, // GET  /api/violations/:id
  "violation-review": violationReview, // POST /api/violations/:id/review
};

export default function p1(req: VercelRequest, res: VercelResponse) {
  const route = req.query["route"];
  // hasOwnProperty: `P1_ROUTES["constructor"]` existiría por herencia y se ejecutaría en vez de responder 404.
  const fn = typeof route === "string" && Object.prototype.hasOwnProperty.call(P1_ROUTES, route) ? P1_ROUTES[route] : undefined;
  if (!fn) return sendError(res, "NOT_FOUND", "Ruta no encontrada");
  return fn(req, res);
}
