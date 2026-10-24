// POST /api/citizen/register  { cedula, password, email? } — paso 1 del registro del ciudadano (docs/04 §0c).
// Envía un código de 6 dígitos por WhatsApp al `phone` (o, sin él, al del titular conocido); devuelve `{ telefono }` enmascarado.
import { CitizenRegisterSchema } from "../../lib/contracts/index.ts";
import { citizen } from "../../lib/domain/index.ts";
import { assertSameOrigin, getClientIp } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  assertSameOrigin(req);
  const { cedula, password, phone, email } = CitizenRegisterSchema.parse(req.body);
  sendOk(res, await citizen.startRegistration({ cedula, password, phone, email, ip: getClientIp(req) }));
});
