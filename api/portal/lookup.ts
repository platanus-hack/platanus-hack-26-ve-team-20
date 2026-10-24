// POST /api/portal/lookup  { cedula }  (público, 10 consultas / 10 min / IP) — docs/04 §4.
// Siempre 200 con la misma forma, exista o no la cédula. Sin nombre, teléfono ni correo; placa
// enmascarada. Cada consulta permitida queda en el AuditLog con la IP.
import { PortalLookupRequestSchema } from "../../lib/contracts/index.ts";
import { db } from "../../lib/db.ts";
import { portalLookup } from "../../lib/domain/portal.ts";
import { getClientIp } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  const { cedula } = PortalLookupRequestSchema.parse(req.body);
  sendOk(res, await portalLookup(db, { cedula, ip: getClientIp(req) }));
});
