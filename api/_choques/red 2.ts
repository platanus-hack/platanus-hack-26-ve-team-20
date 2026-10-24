// GET /api/choques/red → { serverNow, nodes, incident }: los teléfonos presentes y el último incidente.
import { network } from "../../lib/crash/network.ts";
import { db } from "../../lib/db.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["GET"], async (_req, res) => {
  sendOk(res, await network(db));
});
