// GET /api/citizen/me — perfil del ciudadano autenticado y renovación de la sesión (30 min).
import { db } from "../../lib/db.ts";
import { toProfile } from "../../lib/domain/citizen-data.ts";
import { requireCitizen } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["GET"], async (req, res) => {
  // `?renew=0` (sondeos como el de /en-vivo) comprueba la sesión sin extenderla.
  const { person } = await requireCitizen(db, req, res, { renew: req.query["renew"] !== "0" });
  sendOk(res, { user: toProfile(person) });
});
