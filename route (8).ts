import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, consumeOtp, createSession, getUserFromRequest, identify, publicUser, sessionCookie } from "@/lib/auth";
import { body, json, open } from "@/lib/http";

export const POST = open(async ({ req }) => {
  const b = await body<{ identifier: string; purpose: "login" | "verify"; code: string }>(req);
  const id = identify(b.identifier);
  if (!id) throw new ApiError("Enter a valid email address or phone number");
  const ok = await consumeOtp(id.value, b.purpose, b.code);
  if (!ok) throw new ApiError("Invalid or expired code");
  const patch = id.kind === "email" ? { emailVerified: true } : { phoneVerified: true };
  if (b.purpose === "verify") {
    const user = await getUserFromRequest(req);
    if (!user) throw new ApiError("Please log in first", 401);
    if (user.email !== id.value && user.phone !== id.value) throw new ApiError("That contact is not on your account");
    const [u] = await db.update(users).set(patch).where(eq(users.id, user.id)).returning();
    return json({ ok: true, user: publicUser(u) });
  }
  const [found] = await db.select().from(users).where(id.kind === "email" ? eq(users.email, id.value) : eq(users.phone, id.value));
  if (!found) throw new ApiError("No account found");
  const [u] = await db.update(users).set(patch).where(eq(users.id, found.id)).returning();
  const token = await createSession(u.id, req.headers.get("user-agent"));
  return json({ token, user: publicUser(u) }, 200, { "set-cookie": sessionCookie(token, req) });
});
