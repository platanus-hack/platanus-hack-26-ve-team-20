import { handler, sendOk } from "./_lib/respond.ts";

export default handler(["GET"], (_req, res) => {
  sendOk(res, { status: "ok", time: new Date().toISOString() });
});
