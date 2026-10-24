// POST /api/choques/latido { nodeId?, name, x, y, heading, recording } → { serverNow, nodeId, alert }.
// El teléfono lo envía cada segundo mientras /choques/nodo está abierta; `alert` es lo que debe capturar ya.
import { CrashHeartbeatRequestSchema } from "../../lib/contracts/index.ts";
import { heartbeat } from "../../lib/crash/network.ts";
import { db } from "../../lib/db.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  sendOk(res, await heartbeat(db, CrashHeartbeatRequestSchema.parse(req.body)));
});
