// POST /api/citizen/password  { current, next } — cambia la contraseña. Cierra las demás sesiones abiertas.
import { CitizenPasswordSchema } from "../../lib/contracts/index.ts";
import { db } from "../../lib/db.ts";
import { citizen } from "../../lib/domain/index.ts";
import { getClientIp, issueCitizenSession, requireCitizen } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  const { account } = await requireCitizen(db, req);
  const { current, next } = CitizenPasswordSchema.parse(req.body);
  const updated = await citizen.changePassword({ accountId: account.id, current, next, ip: getClientIp(req) });
  issueCitizenSession(res, updated); // la huella de la contraseña cambió: se emite una sesión nueva a quien la cambió
  sendOk(res, {});
});
