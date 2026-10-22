import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, transactions, users } from "@/db/schema";
import { num, r2 } from "./util";

export type Account = typeof accounts.$inferSelect;
export type User = typeof users.$inferSelect;

/**
 * Atomically moves money on an account and writes a ledger row.
 * Negative deltas fail (return null) when funds are insufficient.
 */
export async function adjustBalance(
  accountId: number,
  userId: number,
  delta: number,
  type: string,
  description: string,
  ref?: string,
): Promise<number | null> {
  const r = await adjustBalanceFull(accountId, userId, delta, type, description, ref);
  return r ? r.balance : null;
}

export async function adjustBalanceFull(
  accountId: number,
  userId: number,
  delta: number,
  type: string,
  description: string,
  ref?: string,
): Promise<{ balance: number; txId: number } | null> {
  const amount = r2(delta).toFixed(2);
  return db.transaction(async (tx) => {
    const cond =
      delta < 0
        ? and(eq(accounts.id, accountId), sql`${accounts.balance} + ${amount}::numeric >= 0`)
        : eq(accounts.id, accountId);
    const [row] = await tx
      .update(accounts)
      .set({ balance: sql`${accounts.balance} + ${amount}::numeric` })
      .where(cond)
      .returning({ balance: accounts.balance });
    if (!row) return null;
    const [ins] = await tx.insert(transactions).values({
      userId,
      accountId,
      type,
      amount,
      balanceAfter: row.balance,
      description,
      ref: ref ?? null,
    }).returning({ id: transactions.id });
    return { balance: num(row.balance), txId: ins.id };
  });
}

export async function getAccounts(userId: number): Promise<Account[]> {
  return db.select().from(accounts).where(eq(accounts.userId, userId)).orderBy(accounts.id);
}

export async function getActiveAccount(user: User): Promise<Account> {
  const list = await getAccounts(user.id);
  const active = list.find((a) => a.id === user.activeAccountId) ?? list.find((a) => a.type === "demo") ?? list[0];
  return active;
}

export function genLoginId(type: "real" | "demo"): string {
  const n = Math.floor(1000000 + Math.random() * 9000000);
  return (type === "real" ? "CR" : "VRTC") + n;
}

export const DEMO_BALANCE = 10000;
