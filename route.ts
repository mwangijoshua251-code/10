import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, publicUser } from "@/lib/auth";
import { DEMO_BALANCE, adjustBalance, getAccounts } from "@/lib/accounts";
import { authed, body, json } from "@/lib/http";
import { num } from "@/lib/util";

export const dynamic = "force-dynamic";

async function view(userId: number, activeId: number | null) {
  const list = await getAccounts(userId);
  const active = list.find((a) => a.id === activeId) ?? list.find((a) => a.type === "demo") ?? list[0];
  return {
    accounts: list.map((a) => ({ id: a.id, loginid: a.loginid, type: a.type, currency: a.currency, balance: num(a.balance) })),
    activeAccountId: active.id,
  };
}

export const GET = authed(async ({ user }) => json({ user: publicUser(user), ...(await view(user.id, user.activeAccountId)) }));

export const POST = authed(async ({ req, user }) => {
  const b = await body<{ action: string; accountId?: number }>(req);
  const list = await getAccounts(user.id);
  if (b.action === "switch") {
    const target = list.find((a) => a.id === Number(b.accountId));
    if (!target) throw new ApiError("Account not found");
    await db.update(users).set({ activeAccountId: target.id }).where(eq(users.id, user.id));
    return json(await view(user.id, target.id));
  }
  if (b.action === "reset_demo") {
    const demo = list.find((a) => a.type === "demo");
    if (!demo) throw new ApiError("No demo account");
    const delta = DEMO_BALANCE - num(demo.balance);
    if (delta !== 0) await adjustBalance(demo.id, user.id, delta, "reset", "Demo balance reset");
    return json(await view(user.id, user.activeAccountId));
  }
  throw new ApiError("Unknown action");
});
