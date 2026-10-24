// GET /api/citizen/fines — multas de los vehículos del ciudadano, la infracción más reciente primero.
import { db } from "../../lib/db.ts";
import { listCitizenFines } from "../../lib/domain/citizen-data.ts";
import { requireCitizen } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["GET"], async (req, res) => {
  const { person } = await requireCitizen(db, req, res);
  sendOk(res, { items: await listCitizenFines(db, person.id) });
});
