import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { accounts, transactions, users } from "@/db/schema";
import { ApiError, createOtp, createSession, hashPassword, normalizeEmail, normalizePhone, publicUser, sessionCookie, validatePassword } from "@/lib/auth";
import { DEMO_BALANCE, genLoginId } from "@/lib/accounts";
import { body, json, open } from "@/lib/http";

export const POST = open(async ({ req }) => {
  const b = await body<{ email?: string; phone?: string; password: string; fullName?: string; country?: string; terms?: boolean }>(req);
  const email = b.email?.trim() ? normalizeEmail(b.email) : null;
  const phone = b.phone?.trim() ? normalizePhone(b.phone) : null;
  if (b.email?.trim() && !email) throw new ApiError("Enter a valid email address");
  if (b.phone?.trim() && !phone) throw new ApiError("Enter a valid phone number including country code, e.g. +254712345678");
  if (!email && !phone) throw new ApiError("Enter an email address or a phone number");
  validatePassword(b.password);
  if (!b.terms) throw new ApiError("Please confirm you are 18 or older and accept the terms");

  const conds = [email ? eq(users.email, email) : undefined, phone ? eq(users.phone, phone) : undefined].filter(Boolean);
  const existing = await db.select({ id: users.id }).from(users).where(or(...(conds as never[]))).limit(1);
  if (existing.length) throw new ApiError("An account with those details already exists. Try logging in.");

  const [user] = await db
    .insert(users)
    .values({ email, phone, passwordHash: hashPassword(b.password), fullName: b.fullName?.trim() || null, country: b.country || null })
    .returning();
  const [real] = await db.insert(accounts).values({ userId: user.id, loginid: genLoginId("real"), type: "real", balance: "0" }).returning();
  const [demo] = await db.insert(accounts).values({ userId: user.id, loginid: genLoginId("demo"), type: "demo", balance: DEMO_BALANCE.toFixed(2) }).returning();
  void real;
  await db.insert(transactions).values({ userId: user.id, accountId: demo.id, type: "reset", amount: DEMO_BALANCE.toFixed(2), balanceAfter: DEMO_BALANCE.toFixed(2), description: "Virtual funds credited" });
  const [fresh] = await db.update(users).set({ activeAccountId: demo.id }).where(eq(users.id, user.id)).returning();

  const token = await createSession(user.id, req.headers.get("user-agent"));
  const verifyTarget = email ?? (phone as string);
  const demoCode = await createOtp(verifyTarget, "verify", user.id);
  return json({ token, user: publicUser(fresh), verifyTarget, demoCode }, 200, { "set-cookie": sessionCookie(token, req) });
});
