// GET /api/citizen/fines/:id — una multa propia. Una ajena responde 404, igual que una inexistente.
import { db } from "../../lib/db.ts";
import { getCitizenFine } from "../../lib/domain/citizen-data.ts";
import { requireCitizen } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["GET"], async (req, res) => {
  const { person } = await requireCitizen(db, req, res);
  const raw = req.query["id"];
  sendOk(res, await getCitizenFine(db, person.id, Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "")));
});
