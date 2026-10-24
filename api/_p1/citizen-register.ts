// POST /api/citizen/register  { cedula, password, phone?, email? } — paso 1 del registro del ciudadano (docs/04 §0c).
// Con `CITIZEN_WHATSAPP_CODE=true` envía un código de 6 dígitos por WhatsApp al `phone` (o, sin él, al del titular
// conocido) y devuelve `{ telefono }` enmascarado. Sin esa variable crea la cuenta ya, abre la sesión y devuelve
// también `{ user, vehicles }` (como /register/verify).
import { CitizenRegisterSchema } from "../../lib/contracts/index.ts";
import { db } from "../../lib/db.ts";
import { citizen } from "../../lib/domain/index.ts";
import { listCitizenVehicles, toProfile } from "../../lib/domain/citizen-data.ts";
import { assertSameOrigin, getClientIp, issueCitizenSession } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  assertSameOrigin(req);
  const { cedula, password, phone, email } = CitizenRegisterSchema.parse(req.body);
  const { telefono, session } = await citizen.startRegistration({ cedula, password, phone, email, ip: getClientIp(req) });
  if (!session) return sendOk(res, { telefono });
  issueCitizenSession(res, session.account);
  sendOk(res, { telefono, user: toProfile(session.person), vehicles: await listCitizenVehicles(db, session.person.id) });
});
