// Límite de intentos por clave (p. ej. IP) en memoria de la instancia. Suficiente para la demo
// (docs/02 §7); en producción iría en la DB o en un store compartido.
export interface RateLimiter {
  /** `true` si se permite este intento (y lo cuenta). */
  hit(key: string, now?: number): boolean;
}

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    hit(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      const allowed = recent.length < limit;
      if (allowed) recent.push(now);
      hits.set(key, recent);
      return allowed;
    },
  };
}
