// Hash de contraseñas con scrypt (Node, sin dependencias). Formato autodescriptivo:
//   scrypt$N$r$p$<salt base64url>$<hash base64url>
// Los parámetros viajan en el hash, así que se pueden subir más adelante sin romper los existentes.
// N=16384 (16 MiB) es el compromiso para funciones serverless; OWASP sugiere más en servidores propios.
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify<string, Buffer, number, ScryptOptions, Buffer>(scryptCb);

const PARAMS = { N: 16_384, r: 8, p: 1, keylen: 64 } as const;
export const MIN_PASSWORD_LENGTH = 10;

const maxmem = (N: number, r: number) => 128 * N * r * 2;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  const salt = randomBytes(16);
  const { N, r, p, keylen } = PARAMS;
  const hash = await scrypt(password, salt, keylen, { N, r, p, maxmem: maxmem(N, r) });
  return ["scrypt", N, r, p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

/** Verifica una contraseña. Nunca lanza: un hash mal formado simplemente no coincide. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, nRaw, rRaw, pRaw, saltRaw, hashRaw] = stored.split("$");
  if (scheme !== "scrypt" || !nRaw || !rRaw || !pRaw || !saltRaw || !hashRaw) return false;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  // Cotas razonables: el hash viene de nuestra base, pero no se confía ciegamente en él.
  if (![N, r, p].every(Number.isInteger) || N < 2 || N > 2 ** 20 || (N & (N - 1)) !== 0 || r < 1 || r > 32 || p < 1 || p > 16) {
    return false;
  }
  try {
    const expected = Buffer.from(hashRaw, "base64url");
    const actual = await scrypt(password, Buffer.from(saltRaw, "base64url"), expected.length, { N, r, p, maxmem: maxmem(N, r) });
    return expected.length > 0 && expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;
/**
 * Hash falso para verificar contra algo cuando el usuario no existe: así el tiempo de respuesta no
 * revela si un correo está registrado.
 */
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword("contraseña-que-nadie-usa-nunca");
  return dummy;
}
