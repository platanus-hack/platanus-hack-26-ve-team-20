// POST /api/auth/login  { email, password }  — login de admin/operador.
// Respuesta idéntica para correo inexistente, contraseña errónea o cuenta desactivada, y tiempo
// similar en los tres casos. Los intentos fallidos se registran y se limitan por IP y por correo.
import { createHash } from "node:crypto";
import { LoginRequestSchema, type AdminSessionDTO } from "../../lib/contracts/index.ts";
import { dummyHash, verifyPassword } from "../../lib/auth/password.ts";
import { db } from "../../lib/db.ts";
import { audit } from "../../lib/domain/audit.ts";
import { assertUnderLimit } from "../../lib/domain/rate-limit.ts";
import { assertSameOrigin, getClientIp, issueAdminSession } from "../_lib/auth.ts";
import { ApiError, handler, sendOk } from "../_lib/respond.ts";

const WINDOW_MS = 10 * 60_000;
const MAX_FAILURES_PER_IP = 10;
const MAX_FAILURES_PER_EMAIL = 5;
const FAILED = "ADMIN_LOGIN_FAILED";

export default handler(["POST"], async (req, res) => {
  assertSameOrigin(req);
  const { email, password } = LoginRequestSchema.parse(req.body);
  const ip = getClientIp(req);
  // El correo no se guarda en el log: solo una huella para contar intentos por cuenta.
  const emailKey = createHash("sha256").update(email).digest("hex").slice(0, 16);

  await assertUnderLimit(db, { action: FAILED, ip, max: MAX_FAILURES_PER_IP, windowMs: WINDOW_MS });
  await assertUnderLimit(db, { action: FAILED, entityId: emailKey, max: MAX_FAILURES_PER_EMAIL, windowMs: WINDOW_MS });

  const user = await db.adminUser.findUnique({ where: { email } });
  // Se verifica siempre (contra un hash falso si no existe) para no revelar qué correos existen.
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));

  if (!user || !user.active || !passwordOk) {
    await audit(db, { actor: { type: "OPERATOR", ip }, action: FAILED, entity: "AdminUser", entityId: emailKey });
    throw new ApiError("UNAUTHORIZED", "Credenciales inválidas");
  }

  await db.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(db, { actor: { type: "OPERATOR", id: user.id, ip }, action: "ADMIN_LOGIN", entity: "AdminUser", entityId: user.id });
  issueAdminSession(res, user);
  const data: { user: AdminSessionDTO } = { user: { id: user.id, email: user.email, name: user.name } };
  sendOk(res, data);
});
