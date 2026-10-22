import { getActiveAccount } from "@/lib/accounts";
import { createDeposit } from "@/lib/payments";
import { authed, body, json } from "@/lib/http";

export const POST = authed(async ({ req, user }) => {
  const b = await body<{ method: string; amountUsd: number; phone?: string }>(req);
  const acct = await getActiveAccount(user);
  return json({ payment: await createDeposit(user, acct, b) });
});
