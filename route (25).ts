import { getActiveAccount } from "@/lib/accounts";
import { closedPage, settleDue } from "@/lib/trading";
import { authed, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = authed(async ({ req, user }) => {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
  await settleDue(user.id);
  const acct = await getActiveAccount(user);
  return json(await closedPage(acct.id, limit, offset));
});
