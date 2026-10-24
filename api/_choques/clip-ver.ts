// GET /api/choques/clips/:id → el video. Responde rangos (206): Safari no reproduce <video> sin ellos.
import { z } from "zod";
import { readClip } from "../../lib/crash/network.ts";
import { db } from "../../lib/db.ts";
import { handler } from "../_lib/respond.ts";

export default handler(["GET"], async (req, res) => {
  const id = z.string().min(1).parse(req.query["id"]);
  const { bytes, type } = await readClip(db, id);
  const total = bytes.byteLength;
  res.setHeader("Content-Type", type);
  res.setHeader("Accept-Ranges", "bytes");
  // El clip no cambia una vez subido.
  res.setHeader("Cache-Control", "private, max-age=3600");

  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers["range"] ?? ""));
  if (m && (m[1] || m[2])) {
    const start = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
    if (start >= total || start > end) {
      res.setHeader("Content-Range", `bytes */${total}`);
      res.status(416).end();
      return;
    }
    res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
    res.setHeader("Content-Length", String(end - start + 1));
    res.status(206).send(Buffer.from(bytes.subarray(start, end + 1)));
    return;
  }
  res.setHeader("Content-Length", String(total));
  res.status(200).send(Buffer.from(bytes));
});
