import { getActiveAccount } from "@/lib/accounts";
import { createWithdrawal } from "@/lib/payments";
import { authed, body, json } from "@/lib/http";

export const POST = authed(async ({ req, user }) => {
  const b = await body<{ method: string; amountUsd: number; destination: string; password: string }>(req);
  const acct = await getActiveAccount(user);
  return json(await createWithdrawal(user, acct, b));
});
