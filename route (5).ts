import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, clearRateLimit, createSession, identify, publicUser, rateLimit, sessionCookie, verifyPassword } from "@/lib/auth";
import { body, json, open } from "@/lib/http";

export const POST = open(async ({ req }) => {
  const b = await body<{ identifier: string; password: string }>(req);
  const id = identify(b.identifier);
  if (!id) throw new ApiError("Enter a valid email address or phone number");
  const key = `login:${id.value}`;
  rateLimit(key, 6, 10 * 60000);
  const [user] = await db.select().from(users).where(id.kind === "email" ? eq(users.email, id.value) : eq(users.phone, id.value));
  if (!user || !verifyPassword(String(b.password ?? ""), user.passwordHash)) throw new ApiError("Incorrect email/phone or password", 401);
  clearRateLimit(key);
  const token = await createSession(user.id, req.headers.get("user-agent"));
  return json({ token, user: publicUser(user) }, 200, { "set-cookie": sessionCookie(token, req) });
});
