import { destroySession, sessionCookie } from "@/lib/auth";
import { json, open } from "@/lib/http";

export const POST = open(async ({ req }) => {
  await destroySession(req);
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(null, req) });
});
