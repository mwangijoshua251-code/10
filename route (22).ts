import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { getActiveAccount } from "@/lib/accounts";
import { authed, json } from "@/lib/http";
import { num } from "@/lib/util";

export const dynamic = "force-dynamic";

export const GET = authed(async ({ req, user }) => {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 500);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
  const type = url.searchParams.get("type");
  const acct = await getActiveAccount(user);
  const where = and(eq(transactions.accountId, acct.id), type ? eq(transactions.type, type) : undefined);
  const rows = await db.select().from(transactions).where(where).orderBy(desc(transactions.id)).limit(limit).offset(offset);
  const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(transactions).where(where);
  return json({
    total: c.n,
    rows: rows.map((r) => ({ id: r.id, type: r.type, amount: num(r.amount), balanceAfter: num(r.balanceAfter), description: r.description, ref: r.ref, createdAt: r.createdAt.getTime() })),
  });
});
