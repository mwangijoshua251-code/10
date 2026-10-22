import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { otpCodes, sessions, users } from "@/db/schema";
import type { User } from "./accounts";

export const COOKIE = "dtk";
const SESSION_DAYS = 14;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(pw, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validatePassword(pw: string) {
  if (typeof pw !== "string" || pw.length < 8) throw new ApiError("Password must be at least 8 characters");
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw))
    throw new ApiError("Password must contain upper-case, lower-case letters and a number");
}

export function normalizeEmail(e: string): string | null {
  const v = String(e ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : null;
}

export function normalizePhone(p: string): string | null {
  let v = String(p ?? "").trim().replace(/[\s\-().]/g, "");
  if (!v) return null;
  if (v.startsWith("00")) v = "+" + v.slice(2);
  if (v.startsWith("+")) {
    const d = v.slice(1);
    return /^\d{8,15}$/.test(d) ? "+" + d : null;
  }
  if (!/^\d+$/.test(v)) return null;
  if (v.startsWith("0") && v.length === 10) return "+254" + v.slice(1);
  if (v.length === 9 && /^[17]/.test(v)) return "+254" + v;
  if (v.length >= 10 && v.length <= 15) return "+" + v;
  return null;
}

export function identify(identifier: string): { kind: "email" | "phone"; value: string } | null {
  const raw = String(identifier ?? "").trim();
  if (raw.includes("@")) {
    const e = normalizeEmail(raw);
    return e ? { kind: "email", value: e } : null;
  }
  const p = normalizePhone(raw);
  return p ? { kind: "phone", value: p } : null;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: number, userAgent?: string | null) {
  const token = randomBytes(32).toString("hex");
  await db.insert(sessions).values({
    tokenHash: sha(token),
    userId,
    userAgent: userAgent?.slice(0, 200) ?? null,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000),
  });
  return token;
}

function tokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export async function getUserFromRequest(req: Request): Promise<User | null> {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha(token)), gt(sessions.expiresAt, new Date())));
  if (!row) return null;
  let user = row.user;
  // Sandbox KYC reviewer: documents are auto-approved ~15s after submission.
  if (user.kycStatus === "pending" && user.kycSubmittedAt && Date.now() - user.kycSubmittedAt.getTime() > 15000) {
    [user] = await db.update(users).set({ kycStatus: "verified" }).where(eq(users.id, user.id)).returning();
  }
  return user;
}

export async function destroySession(req: Request) {
  const token = tokenFromRequest(req);
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha(token)));
}

export function sessionCookie(token: string | null, req: Request): string {
  const secure = (req.headers.get("x-forwarded-proto") ?? "").includes("https");
  const base = `${COOKIE}=${token ? encodeURIComponent(token) : ""}; Path=/; HttpOnly; Max-Age=${token ? SESSION_DAYS * 86400 : 0}`;
  return secure ? `${base}; Secure; SameSite=None` : `${base}; SameSite=Lax`;
}

export function publicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    emailVerified: u.emailVerified,
    phoneVerified: u.phoneVerified,
    fullName: u.fullName,
    country: u.country,
    dob: u.dob,
    address: u.address,
    idType: u.idType,
    idNumber: u.idNumber ? "•••• " + u.idNumber.slice(-3) : null,
    kycStatus: u.kycStatus,
    limits: u.limits ?? {},
    excludedUntil: u.excludedUntil ? u.excludedUntil.getTime() : null,
    createdAt: u.createdAt.getTime(),
  };
}

// ---- rate limiting (in-memory)
const attempts = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.reset < now) {
    attempts.set(key, { n: 1, reset: now + windowMs });
    return;
  }
  a.n++;
  if (a.n > max) throw new ApiError("Too many attempts. Please try again later.", 429);
}
export function clearRateLimit(key: string) {
  attempts.delete(key);
}

// ---- OTP
export const OTP_DEMO = process.env.OTP_DEMO !== "off";

export async function createOtp(target: string, purpose: "login" | "verify", userId: number | null) {
  rateLimit(`otp:${target}`, 5, 10 * 60000);
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  await db.insert(otpCodes).values({
    userId,
    target,
    purpose,
    codeHash: sha(`${target}:${purpose}:${code}`),
    expiresAt: new Date(Date.now() + 5 * 60000),
  });
  // TODO: deliver `code` via your SMS / email provider here (e.g. Africa's Talking, Twilio, SES).
  return OTP_DEMO ? code : undefined;
}

export async function consumeOtp(target: string, purpose: "login" | "verify", code: string): Promise<boolean> {
  rateLimit(`otpv:${target}`, 8, 10 * 60000);
  const row = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.target, target), eq(otpCodes.purpose, purpose), isNull(otpCodes.usedAt), gt(otpCodes.expiresAt, new Date())))
    .orderBy(desc(otpCodes.id))
    .limit(1)
    .then((r) => r[0]);
  if (!row) return false;
  if (row.codeHash !== sha(`${target}:${purpose}:${String(code).trim()}`)) {
    await db.update(otpCodes).set({ attempts: row.attempts + 1 }).where(eq(otpCodes.id, row.id));
    return false;
  }
  await db.update(otpCodes).set({ usedAt: new Date() }).where(eq(otpCodes.id, row.id));
  return true;
}
