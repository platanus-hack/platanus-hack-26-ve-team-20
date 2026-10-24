// Token de client upload para el clip (docs/04 §1). Dueño: P2.
// Responde el JSON crudo de `handleUpload` (no `{ ok, data }`): es lo que espera el cliente de Vercel Blob.
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { CLIP_CONTENT_TYPES, CLIP_MAX_BYTES, CLIP_PREFIX } from "../../lib/storage/blob.ts";
import { requireCameraKey } from "../_lib/camera-key.ts";
import { handler } from "../_lib/respond.ts";

// Sin callbackUrl no hay avisos de "upload completed": solo se piden tokens.
const BodySchema = z.object({
  type: z.literal("blob.generate-client-token"),
  payload: z.object({ pathname: z.string().startsWith(CLIP_PREFIX), multipart: z.boolean(), clientPayload: z.string().nullable() }),
});

export default handler(["POST"], async (req, res) => {
  requireCameraKey(req);
  const body = BodySchema.parse(req.body);
  const result = await handleUpload({
    request: req,
    body: body as HandleUploadBody,
    onBeforeGenerateToken: async () => ({
      allowedContentTypes: CLIP_CONTENT_TYPES,
      maximumSizeInBytes: CLIP_MAX_BYTES,
      addRandomSuffix: true,
    }),
  });
  res.status(200).json(result);
});
