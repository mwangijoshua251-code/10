import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, createOtp, getUserFromRequest, identify } from "@/lib/auth";
import { body, json, open } from "@/lib/http";

export const POST = open(async ({ req }) => {
  const b = await body<{ identifier: string; purpose: "login" | "verify" }>(req);
  const id = identify(b.identifier);
  if (!id) throw new ApiError("Enter a valid email address or phone number");
  if (b.purpose === "verify") {
    const user = await getUserFromRequest(req);
    if (!user) throw new ApiError("Please log in first", 401);
    if (user.email !== id.value && user.phone !== id.value) throw new ApiError("That contact is not on your account");
    const demoCode = await createOtp(id.value, "verify", user.id);
    return json({ ok: true, target: id.value, demoCode });
  }
  const [user] = await db.select().from(users).where(id.kind === "email" ? eq(users.email, id.value) : eq(users.phone, id.value));
  if (!user) throw new ApiError("No account found with those details");
  const demoCode = await createOtp(id.value, "login", user.id);
  return json({ ok: true, target: id.value, demoCode });
});
