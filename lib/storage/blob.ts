// Evidencia en Vercel Blob (docs/02-arquitectura.md: URLs públicas con sufijo aleatorio). Dueño: P2. Solo servidor.
import { put } from "@vercel/blob";

export const CLIP_PREFIX = "evidence/clips/";
export const CLIP_CONTENT_TYPES = ["video/mp4", "video/quicktime"];
export const CLIP_MAX_BYTES = 30 * 1024 * 1024;

/** Guarda un JPEG en base64 y devuelve su URL pública. */
export async function saveImage(path: string, jpegBase64: string): Promise<string> {
  const blob = await put(path, Buffer.from(jpegBase64, "base64"), {
    access: "public",
    contentType: "image/jpeg",
    addRandomSuffix: true,
  });
  return blob.url;
}
