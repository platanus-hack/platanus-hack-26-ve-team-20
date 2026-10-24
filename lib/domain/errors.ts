// Errores de dominio (P1). Llevan un `ErrorCode` de la API para que los handlers los conviertan
// directamente en `{ ok: false, error: { code, message } }` con el HTTP que corresponde.
import type { ErrorCode, ViolationStatus } from "../contracts/index.ts";

export class DomainError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super("NOT_FOUND", `${entity} no encontrada: ${id}`);
  }
}

export class InvalidTransitionError extends DomainError {
  readonly from: ViolationStatus;
  readonly to: ViolationStatus;

  constructor(from: ViolationStatus, to: ViolationStatus) {
    super("INVALID_TRANSITION", `Transición inválida: ${from} → ${to}`);
    this.from = from;
    this.to = to;
  }
}
