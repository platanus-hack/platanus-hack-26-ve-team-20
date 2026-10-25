// Evidencia en Vercel Blob. El store del proyecto es PRIVADO: las fotos se suben con access "private" y el
// navegador las pide a GET /api/evidence (api/_p2/evidence.ts), que las lee con el token del servidor.
// Las URLs llevan sufijo aleatorio (docs/02-arquitectura.md). Dueño: P2. Solo servidor.
import { get, put } from "@vercel/blob";

export const CLIP_PREFIX = "evidence/clips/";
export const CLIP_CONTENT_TYPES = ["video/mp4", "video/quicktime"];
export const CLIP_MAX_BYTES = 30 * 1024 * 1024;
export const EVIDENCE_PREFIX = "/evidence/";

/** Guarda un JPEG en base64 y devuelve su URL (privada: se ve a través de /api/evidence). */
export async function saveImage(path: string, jpegBase64: string): Promise<string> {
  const blob = await put(path, Buffer.from(jpegBase64, "base64"), {
    access: "private",
    contentType: "image/jpeg",
    addRandomSuffix: true,
  });
  return blob.url;
}

/** Solo evidencia de un store de Vercel Blob: la ruta pública no debe servir de proxy para otra cosa. */
export function isEvidenceUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com") && u.pathname.startsWith(EVIDENCE_PREFIX);
  } catch {
    return false;
  }
}

/** Lee una evidencia privada; null si no existe. */
export async function readEvidence(url: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null> {
  const r = await get(url, { access: "private" });
  if (!r || r.statusCode !== 200) return null;
  return { stream: r.stream, contentType: r.blob.contentType };
}
