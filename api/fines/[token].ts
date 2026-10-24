// GET /api/fines/[token]  (público) — docs/04 §3.
// El token es la "llave" de acceso: quien lo tiene ve la evidencia de esa multa. La respuesta no
// incluye cédula, teléfono ni nombre del dueño; la placa va enmascarada.
import { db } from "../../lib/db.ts";
import { getPublicFine } from "../../lib/domain/queries.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["GET"], async (req, res) => {
  const raw = req.query["token"];
  const token = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  sendOk(res, await getPublicFine(db, token));
});
