// Hora del servidor: la app calcula clockOffsetMs = serverNow − phoneNow (docs/04 §1). Dueño: P2.
import { handler, sendOk } from "./_lib/respond.ts";

export default handler(["GET"], (_req, res) => {
  sendOk(res, { now: new Date().toISOString() });
});
