import { getAccounts, getActiveAccount } from "@/lib/accounts";
import { progressPayments } from "@/lib/payments";
import { openContracts, recentClosed, settleDue } from "@/lib/trading";
import { authed, json } from "@/lib/http";
import { num } from "@/lib/util";

export const dynamic = "force-dynamic";

export const GET = authed(async ({ req, user }) => {
  const since = Number(new URL(req.url).searchParams.get("since")) || Date.now() - 15000;
  await Promise.all([settleDue(user.id), progressPayments(user.id)]);
  const acct = await getActiveAccount(user);
  const [list, open, closed] = await Promise.all([getAccounts(user.id), openContracts(user, acct.id), recentClosed(user, acct.id, since)]);
  return json({
    serverTime: Date.now(),
    activeAccountId: acct.id,
    accounts: list.map((a) => ({ id: a.id, loginid: a.loginid, type: a.type, currency: a.currency, balance: num(a.balance) })),
    open,
    closed,
  });
});
