// GET /api/citizen/vehicles — vehículos registrados a nombre del ciudadano.
import { db } from "../../lib/db.ts";
import { listCitizenVehicles } from "../../lib/domain/citizen-data.ts";
import { requireCitizen } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["GET"], async (req, res) => {
  const { person } = await requireCitizen(db, req, res);
  sendOk(res, { items: await listCitizenVehicles(db, person.id) });
});
