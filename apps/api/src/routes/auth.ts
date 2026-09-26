import { Router } from "express";
import { createHash, randomInt } from "node:crypto";
import { z } from "zod";
import { db } from "../db.js";
import { hashPassword, verifyPassword } from "../lib/passwords.js";
import { createAccessToken } from "../lib/tokens.js";
import { sendEmail } from "../lib/email.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(10).max(128) });
const resetRequestSchema = z.object({ email: z.string().email() });
const resetConfirmSchema = z.object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/), password: z.string().min(10).max(128) });
const hashResetCode = (code: string) => createHash("sha256").update(code).digest("hex");

authRouter.post("/register", async (request, response) => {
  const input = credentialsSchema.extend({ name: z.string().min(2).max(100), organizationName: z.string().min(2).max(120) }).parse(request.body);
  const existingUser = await db.user.findUnique({ where: { email: input.email } });
  if (existingUser) return response.status(409).json({ error: "An account with this email already exists" });
  const user = await db.user.create({ data: { email: input.email, name: input.name, passwordHash: await hashPassword(input.password), memberships: { create: { role: "SUPER_ADMIN", organization: { create: { name: input.organizationName } } } } }, include: { memberships: true } });
  const membership = user.memberships[0];
  const identity = { userId: user.id, organizationId: membership.organizationId, role: membership.role };
  return response.status(201).json({ token: createAccessToken(identity), user: { id: user.id, name: user.name, email: user.email }, organizationId: identity.organizationId, role: identity.role });
});

authRouter.post("/login", async (request, response) => {
  const input = credentialsSchema.parse(request.body);
  const user = await db.user.findUnique({ where: { email: input.email }, include: { memberships: true } });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) return response.status(401).json({ error: "Invalid email or password" });
  const membership = user.memberships[0];
  if (!membership) return response.status(403).json({ error: "This account is not assigned to an organization" });
  const identity = { userId: user.id, organizationId: membership.organizationId, role: membership.role };
  return response.json({ token: createAccessToken(identity), user: { id: user.id, name: user.name, email: user.email }, organizationId: identity.organizationId, role: identity.role });
});

authRouter.post("/password-reset/request", async (request, response) => {
  const input = resetRequestSchema.parse(request.body);
  const user = await db.user.findUnique({ where: { email: input.email } });
  if (!user) return response.json({ message: "If the account exists, a reset code has been sent." });
  const code = randomInt(100000, 1000000).toString();
  await db.$transaction([db.passwordResetToken.deleteMany({ where: { userId: user.id } }), db.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashResetCode(code), expiresAt: new Date(Date.now() + 15 * 60 * 1000) } })]);
  const delivery = await sendEmail({ to: user.email, subject: "Kravient Build password reset code", text: `Your password reset code is ${code}. It expires in 15 minutes. If you did not request this, you can ignore this email.` });
  response.json({ message: "A one-time reset code has been created. It expires in 15 minutes.", delivery: delivery.mode, ...(process.env.NODE_ENV === "production" ? {} : { resetCode: code }) });
});

authRouter.post("/password-reset/confirm", async (request, response) => {
  const input = resetConfirmSchema.parse(request.body);
  const user = await db.user.findUnique({ where: { email: input.email } });
  if (!user) return response.status(422).json({ error: "Invalid or expired reset code" });
  const token = await db.passwordResetToken.findFirst({ where: { userId: user.id, tokenHash: hashResetCode(input.code), expiresAt: { gt: new Date() } } });
  if (!token) return response.status(422).json({ error: "Invalid or expired reset code" });
  await db.$transaction([db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.password) } }), db.passwordResetToken.deleteMany({ where: { userId: user.id } })]);
  response.json({ message: "Password updated. You can now sign in." });
});

authRouter.get("/me", requireAuth, async (request, response) => {
  const user = await db.user.findUnique({ where: { id: request.auth!.userId }, select: { id: true, name: true, email: true } });
  if (!user) return response.status(404).json({ error: "User not found" });
  return response.json({ user, organizationId: request.auth!.organizationId, role: request.auth!.role });
});
