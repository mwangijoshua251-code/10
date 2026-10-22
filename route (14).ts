import { actOnDeposit } from "@/lib/payments";
import { authed, body, json } from "@/lib/http";

export const POST = authed(async ({ req, user, params }) => {
  const b = await body<{ action: string }>(req);
  return json({ payment: await actOnDeposit(user, Number(params.id), b.action) });
});
