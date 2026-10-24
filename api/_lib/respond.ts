// Respuestas uniformes `{ ok: true, data }` | `{ ok: false, error: { code, message } }` (docs/04).
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ZodError } from "zod";
import { ERROR_HTTP_STATUS, type ApiResponse, type ErrorCode } from "../../lib/contracts/index.ts";
import { DomainError } from "../../lib/domain/errors.ts";

export function sendOk<T>(res: VercelResponse, data: T, status = 200): void {
  const body: ApiResponse<T> = { ok: true, data };
  res.status(status).json(body);
}

export function sendError(res: VercelResponse, code: ErrorCode, message: string): void {
  const body: ApiResponse<never> = { ok: false, error: { code, message } };
  res.status(ERROR_HTTP_STATUS[code]).json(body);
}

/** Error de dominio con código de la API; los handlers lo convierten en respuesta. */
export class ApiError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void;

/**
 * Envuelve un handler: restringe métodos, desactiva el caché (datos de multas) y convierte
 * ZodError → 400, ApiError y DomainError → su código. Cualquier otro error → 500 genérico (el detalle
 * va al log, nunca al cliente).
 */
export function handler(methods: readonly string[], fn: Handler): Handler {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!methods.includes(req.method ?? "")) {
      res.setHeader("Allow", methods.join(", "));
      return sendError(res, "VALIDATION_ERROR", `Método no permitido: ${req.method}`);
    }
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof ZodError) {
        return sendError(res, "VALIDATION_ERROR", err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      }
      if (err instanceof ApiError || err instanceof DomainError) return sendError(res, err.code, err.message);
      console.error("[api] error no controlado", err);
      sendError(res, "INTERNAL_ERROR", "Error interno");
    }
  };
}
