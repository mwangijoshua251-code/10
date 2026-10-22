import { and, eq, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type Limits } from "@/db/schema";
import { ApiError, hashPassword, normalizeEmail, normalizePhone, publicUser, validatePassword, verifyPassword } from "@/lib/auth";
import { authed, body, json } from "@/lib/http";

const posNum = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new ApiError("Limits must be positive numbers");
  return n;
};

export const POST = authed(async ({ req, user }) => {
  const b = await body<Record<string, unknown>>(req);
  const action = String(b.action);

  if (action === "profile") {
    const [u] = await db.update(users).set({ fullName: String(b.fullName ?? "").trim().slice(0, 100) || null, country: String(b.country ?? "") || null }).where(eq(users.id, user.id)).returning();
    return json({ user: publicUser(u) });
  }

  if (action === "password") {
    if (!verifyPassword(String(b.current ?? ""), user.passwordHash)) throw new ApiError("Current password is incorrect");
    validatePassword(String(b.next ?? ""));
    await db.update(users).set({ passwordHash: hashPassword(String(b.next)) }).where(eq(users.id, user.id));
    return json({ ok: true });
  }

  if (action === "add_contact") {
    const kind = b.kind === "phone" ? "phone" : "email";
    const value = kind === "email" ? normalizeEmail(String(b.value)) : normalizePhone(String(b.value));
    if (!value) throw new ApiError(kind === "email" ? "Enter a valid email" : "Enter a valid phone number with country code");
    const [dup] = await db.select({ id: users.id }).from(users).where(and(kind === "email" ? eq(users.email, value) : eq(users.phone, value), ne(users.id, user.id)));
    if (dup) throw new ApiError("That contact is already used by another account");
    const patch = kind === "email" ? { email: value, emailVerified: false } : { phone: value, phoneVerified: false };
    const [u] = await db.update(users).set(patch).where(eq(users.id, user.id)).returning();
    return json({ user: publicUser(u), target: value });
  }

  if (action === "limits") {
    const limits: Limits = {};
    const o = posNum(b.maxOpenPositions);
    const l = posNum(b.maxDailyLoss);
    const t = posNum(b.maxDailyTurnover);
    const s = posNum(b.maxStake);
    if (o) limits.maxOpenPositions = Math.floor(o);
    if (l) limits.maxDailyLoss = l;
    if (t) limits.maxDailyTurnover = t;
    if (s) limits.maxStake = s;
    const [u] = await db.update(users).set({ limits }).where(eq(users.id, user.id)).returning();
    return json({ user: publicUser(u) });
  }

  if (action === "exclude") {
    if (!verifyPassword(String(b.password ?? ""), user.passwordHash)) throw new ApiError("Incorrect password");
    const days = Number(b.days);
    if (![1, 7, 30, 90, 180, 365].includes(days)) throw new ApiError("Invalid exclusion period");
    const [u] = await db.update(users).set({ excludedUntil: new Date(Date.now() + days * 86400000) }).where(eq(users.id, user.id)).returning();
    return json({ user: publicUser(u) });
  }

  if (action === "kyc") {
    const fullName = String(b.fullName ?? "").trim();
    const dob = String(b.dob ?? "");
    const country = String(b.country ?? "");
    const address = String(b.address ?? "").trim();
    const idType = String(b.idType ?? "");
    const idNumber = String(b.idNumber ?? "").trim();
    if (fullName.length < 3 || !country || address.length < 5 || !idType || idNumber.length < 4) throw new ApiError("Please complete all verification fields");
    const birth = new Date(dob);
    if (isNaN(birth.getTime()) || Date.now() - birth.getTime() < 18 * 365.25 * 86400000) throw new ApiError("You must be at least 18 years old");
    const [u] = await db.update(users).set({ fullName, dob, country, address, idType, idNumber, kycStatus: "pending", kycSubmittedAt: new Date() }).where(eq(users.id, user.id)).returning();
    return json({ user: publicUser(u) });
  }

  if (action === "logout_all") {
    await db.delete(sessions).where(or(eq(sessions.userId, user.id)));
    return json({ ok: true });
  }
  throw new ApiError("Unknown action");
});
