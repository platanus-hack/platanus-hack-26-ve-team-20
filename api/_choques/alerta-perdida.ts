// POST /api/choques/alertas/:id/perdida { status: "MISSED" }: el teléfono no pudo guardar su ventana.
import { z } from "zod";
import { CrashAlertUpdateSchema } from "../../lib/contracts/index.ts";
import { markMissed } from "../../lib/crash/network.ts";
import { db } from "../../lib/db.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  const id = z.string().min(1).parse(req.query["id"]);
  CrashAlertUpdateSchema.parse(req.body);
  sendOk(res, await markMissed(db, id));
});
