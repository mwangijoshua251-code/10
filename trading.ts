import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, contracts, transactions } from "@/db/schema";
import { CATEGORY_MAP, TYPE_LABELS, getSymbol, type SymbolDef } from "./catalog";
import { lastDigit, priceAt, quote, seriesRange, sigmaPerSecond, tickAt } from "./engine";
import { ACCU_C, SELL_HAIRCUT, TradeError, prepare, winProbability, type TradeRequest } from "./pricing";
import { adjustBalance, adjustBalanceFull, getActiveAccount, type User } from "./accounts";
import { num, r2 } from "./util";

type ContractRow = typeof contracts.$inferSelect;

export interface Evaluation {
  closed: boolean;
  status?: "won" | "lost";
  exitTick?: number;
  exitSpot?: number;
  credit?: number; // final credit when closed
  spot: number;
  value: number; // current cash-out value (open) or final value
  sellable: boolean;
  ticksSurvived?: number;
  barrierHigh?: number;
  barrierLow?: number;
}

const scanCache = new Map<number, { tick: number; k: number; prev: number }>();
const CHUNK = 40000;

function defOf(c: ContractRow): SymbolDef {
  const d = getSymbol(c.symbol);
  if (!d) throw new Error("Unknown symbol " + c.symbol);
  return d;
}

function outcome(c: ContractRow, exitSpot: number, def: SymbolDef): boolean {
  const d = lastDigit(exitSpot, def.digits);
  switch (c.contractType) {
    case "CALL": return exitSpot > c.entrySpot;
    case "PUT": return exitSpot < c.entrySpot;
    case "HIGHER": return exitSpot > (c.barrier ?? c.entrySpot);
    case "LOWER": return exitSpot < (c.barrier ?? c.entrySpot);
    case "DIGITMATCH": return d === c.digit;
    case "DIGITDIFF": return d !== c.digit;
    case "DIGITEVEN": return d % 2 === 0;
    case "DIGITODD": return d % 2 === 1;
    case "DIGITOVER": return d > (c.digit ?? 0);
    case "DIGITUNDER": return d < (c.digit ?? 9);
  }
  return false;
}

export function evaluate(c: ContractRow, nowMs = Date.now()): Evaluation {
  const def = defOf(c);
  const nowTick = tickAt(def, nowMs);
  const q = quote(def, nowMs);
  const stake = num(c.stake);

  if (c.category === "accumulator") {
    const g = c.growthRate ?? 0.01;
    const cc = ACCU_C[String(g)] ?? 2.3;
    const sdTick = sigmaPerSecond(def) * Math.sqrt(def.interval);
    const st = scanCache.get(c.id) ?? { tick: c.entryTick, k: 0, prev: c.entrySpot };
    const tp = c.takeProfit ? num(c.takeProfit) : null;
    let result: Evaluation | null = null;
    while (!result && st.tick < nowTick) {
      const to = Math.min(nowTick, st.tick + CHUNK);
      const arr = seriesRange(def, st.tick + 1, to);
      for (let i = 0; i < arr.length; i++) {
        const cur = arr[i];
        const tick = st.tick + 1 + i;
        if (Math.abs(cur - st.prev) > st.prev * sdTick * cc) {
          result = { closed: true, status: "lost", exitTick: tick, exitSpot: cur, credit: 0, spot: cur, value: 0, sellable: false, ticksSurvived: st.k };
          break;
        }
        st.k++;
        st.prev = cur;
        const value = r2(stake * Math.pow(1 + g, st.k));
        if (tp !== null && value - stake >= tp) {
          result = { closed: true, status: "won", exitTick: tick, exitSpot: cur, credit: value, spot: cur, value, sellable: false, ticksSurvived: st.k };
          break;
        }
      }
      if (!result) st.tick = to;
    }
    if (result) {
      scanCache.delete(c.id);
      return result;
    }
    scanCache.set(c.id, st);
    const half = st.prev * sdTick * cc;
    return {
      closed: false, spot: q.price, value: r2(stake * Math.pow(1 + g, st.k)), sellable: true,
      ticksSurvived: st.k, barrierHigh: st.prev + half, barrierLow: st.prev - half,
    };
  }

  if (c.category === "multiplier") {
    const m = c.multiplier ?? 10;
    const dir = c.contractType === "MULTUP" ? 1 : -1;
    const notional = stake * m;
    const commission = num(c.commission);
    const tp = c.takeProfit ? num(c.takeProfit) : null;
    const sl = c.stopLoss ? Math.min(num(c.stopLoss), stake) : stake;
    const profitAt = (p: number) => notional * dir * (p / c.entrySpot - 1) - commission;
    const st = scanCache.get(c.id) ?? { tick: c.entryTick, k: 0, prev: c.entrySpot };
    let result: Evaluation | null = null;
    while (!result && st.tick < nowTick) {
      const to = Math.min(nowTick, st.tick + CHUNK);
      const arr = seriesRange(def, st.tick + 1, to);
      for (let i = 0; i < arr.length; i++) {
        const pr = profitAt(arr[i]);
        const tick = st.tick + 1 + i;
        if (pr <= -sl) {
          const credit = r2(stake - sl);
          result = { closed: true, status: "lost", exitTick: tick, exitSpot: arr[i], credit, spot: arr[i], value: credit, sellable: false };
          break;
        }
        if (tp !== null && pr >= tp) {
          const credit = r2(stake + tp);
          result = { closed: true, status: "won", exitTick: tick, exitSpot: arr[i], credit, spot: arr[i], value: credit, sellable: false };
          break;
        }
      }
      if (!result) st.tick = to;
    }
    if (result) {
      scanCache.delete(c.id);
      return result;
    }
    scanCache.set(c.id, st);
    return { closed: false, spot: q.price, value: Math.max(0, r2(stake + profitAt(q.price))), sellable: true };
  }

  // ---- binary / fixed payout contracts
  const payout = num(c.payout);
  const exitTick = c.exitTick ?? c.entryTick + 1;

  if (c.category === "touch") {
    const barrier = c.barrier ?? c.entrySpot;
    const up = barrier > c.entrySpot;
    const st = scanCache.get(c.id) ?? { tick: c.entryTick, k: 0, prev: 0 };
    const lim = Math.min(nowTick, exitTick);
    let touchTick: number | null = null;
    let touchSpot = 0;
    while (touchTick === null && st.tick < lim) {
      const to = Math.min(lim, st.tick + CHUNK);
      const arr = seriesRange(def, st.tick + 1, to);
      for (let i = 0; i < arr.length; i++) {
        if (up ? arr[i] >= barrier : arr[i] <= barrier) {
          touchTick = st.tick + 1 + i;
          touchSpot = arr[i];
          break;
        }
      }
      if (touchTick === null) st.tick = to;
    }
    if (touchTick !== null) {
      scanCache.delete(c.id);
      const won = c.contractType === "TOUCH";
      return { closed: true, status: won ? "won" : "lost", exitTick: touchTick, exitSpot: touchSpot, credit: won ? payout : 0, spot: touchSpot, value: won ? payout : 0, sellable: false };
    }
    if (nowTick >= exitTick) {
      scanCache.delete(c.id);
      const exitSpot = priceAt(def, exitTick);
      const won = c.contractType === "NOTOUCH";
      return { closed: true, status: won ? "won" : "lost", exitTick, exitSpot, credit: won ? payout : 0, spot: exitSpot, value: won ? payout : 0, sellable: false };
    }
    scanCache.set(c.id, st);
  } else if (nowTick >= exitTick) {
    const exitSpot = priceAt(def, exitTick);
    const won = outcome(c, exitSpot, def);
    return { closed: true, status: won ? "won" : "lost", exitTick, exitSpot, credit: won ? payout : 0, spot: exitSpot, value: won ? payout : 0, sellable: false };
  }

  // open: theoretical value
  const ticksLeft = exitTick - nowTick;
  const tau = ticksLeft * def.interval;
  const p = winProbability(c.contractType, {
    spot: q.price, entry: c.entrySpot, barrier: c.barrier, digit: c.digit, tauSec: tau, sigmaSec: sigmaPerSecond(def),
  });
  const value = r2(Math.min(payout * 0.995, payout * p * (1 - SELL_HAIRCUT)));
  const meta = (c.meta ?? {}) as { unit?: string };
  const sellable = ["updown", "highlow", "touch"].includes(c.category) && meta.unit !== "t" && tau >= 10;
  return { closed: false, spot: q.price, value, sellable };
}

export async function settle(c: ContractRow, ev: { status: "won" | "lost" | "sold"; exitTick: number; exitSpot: number; credit: number }) {
  const def = defOf(c);
  const stake = num(c.stake);
  const profit = r2(ev.credit - stake);
  const [u] = await db
    .update(contracts)
    .set({
      status: ev.status,
      exitSpot: ev.exitSpot,
      exitTime: Math.round(ev.exitTick * def.interval * 1000),
      profit: profit.toFixed(2),
      sellPrice: ev.credit.toFixed(2),
      closedAt: new Date(),
    })
    .where(and(eq(contracts.id, c.id), eq(contracts.status, "open")))
    .returning({ id: contracts.id });
  if (!u) return false;
  scanCache.delete(c.id);
  if (ev.credit > 0) {
    await adjustBalance(
      c.accountId,
      c.userId,
      ev.credit,
      ev.status === "sold" ? "sell" : "payout",
      `${TYPE_LABELS[c.contractType] ?? c.contractType} ${def.name} ${ev.status === "sold" ? "cashed out" : ev.status}`,
      `contract:${c.id}`,
    );
  }
  return true;
}

/** Settles every open contract that is due (optionally for one user). */
export async function settleDue(userId?: number) {
  const open = await db
    .select()
    .from(contracts)
    .where(userId ? and(eq(contracts.status, "open"), eq(contracts.userId, userId)) : eq(contracts.status, "open"))
    .limit(2000);
  const now = Date.now();
  for (const c of open) {
    try {
      const def = defOf(c);
      const simple = !["accumulator", "multiplier", "touch"].includes(c.category);
      if (simple && tickAt(def, now) < (c.exitTick ?? 0)) continue;
      const ev = evaluate(c, now);
      if (ev.closed && ev.status && ev.exitTick !== undefined) {
        await settle(c, { status: ev.status, exitTick: ev.exitTick, exitSpot: ev.exitSpot ?? ev.spot, credit: ev.credit ?? 0 });
      }
    } catch (e) {
      console.error("settle error", c.id, e);
    }
  }
}

export function serialize(c: ContractRow, ev?: Evaluation) {
  const def = defOf(c);
  const isOpen = c.status === "open";
  const stake = num(c.stake);
  const nowTick = tickAt(def, Date.now());
  const cat = CATEGORY_MAP[c.category];
  return {
    id: c.id,
    symbol: c.symbol,
    symbolName: def.name,
    digits: def.digits,
    contractType: c.contractType,
    typeLabel: TYPE_LABELS[c.contractType] ?? c.contractType,
    category: c.category,
    categoryName: cat?.name ?? c.category,
    stake,
    payout: c.payout ? num(c.payout) : null,
    entrySpot: c.entrySpot,
    entryTime: c.entryTick * def.interval,
    barrier: c.barrier,
    digit: c.digit,
    growthRate: c.growthRate,
    multiplier: c.multiplier,
    commission: c.commission ? num(c.commission) : null,
    takeProfit: c.takeProfit ? num(c.takeProfit) : null,
    stopLoss: c.stopLoss ? num(c.stopLoss) : null,
    durationLabel: c.durationLabel,
    status: c.status,
    exitSpot: c.exitSpot,
    exitTime: c.exitTime ? Math.round(c.exitTime / 1000) : null,
    expiryTime: c.exitTick ? c.exitTick * def.interval : null,
    ticksLeft: isOpen && c.exitTick ? Math.max(0, c.exitTick - nowTick) : null,
    profit: c.profit !== null ? num(c.profit) : null,
    sellPrice: c.sellPrice !== null ? num(c.sellPrice) : null,
    openedAt: c.openedAt.getTime(),
    closedAt: c.closedAt ? c.closedAt.getTime() : null,
    current: isOpen && ev
      ? {
          spot: ev.spot, value: ev.value, profit: r2(ev.value - stake), sellable: ev.sellable,
          ticksSurvived: ev.ticksSurvived ?? null, barrierHigh: ev.barrierHigh ?? null, barrierLow: ev.barrierLow ?? null,
        }
      : null,
  };
}

async function checkLimits(user: User, accountId: number, stake: number) {
  const limits = user.limits ?? {};
  if (user.excludedUntil && user.excludedUntil.getTime() > Date.now())
    throw new TradeError(`Your account is self-excluded until ${user.excludedUntil.toUTCString()}`);
  if (limits.maxStake && stake > limits.maxStake) throw new TradeError(`Stake exceeds your maximum stake limit of $${limits.maxStake}`);
  if (limits.maxOpenPositions) {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(contracts).where(and(eq(contracts.accountId, accountId), eq(contracts.status, "open")));
    if (r.n >= limits.maxOpenPositions) throw new TradeError(`You have reached your limit of ${limits.maxOpenPositions} open positions`);
  }
  if (limits.maxDailyTurnover || limits.maxDailyLoss) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    if (limits.maxDailyTurnover) {
      const [r] = await db.select({ s: sql<string>`coalesce(sum(${contracts.stake}),0)` }).from(contracts).where(and(eq(contracts.accountId, accountId), gte(contracts.openedAt, start)));
      if (num(r.s) + stake > limits.maxDailyTurnover) throw new TradeError(`This trade would exceed your daily turnover limit of $${limits.maxDailyTurnover}`);
    }
    if (limits.maxDailyLoss) {
      const [r] = await db.select({ s: sql<string>`coalesce(sum(${contracts.profit}),0)` }).from(contracts).where(and(eq(contracts.accountId, accountId), gte(contracts.closedAt, start)));
      if (-num(r.s) >= limits.maxDailyLoss) throw new TradeError(`You have reached your daily loss limit of $${limits.maxDailyLoss}`);
    }
  }
}

export async function buyContract(user: User, req: TradeRequest) {
  const acct = await getActiveAccount(user);
  const t = prepare(req);
  if (acct.type === "real") await checkLimits(user, acct.id, t.stake);
  const debit = await adjustBalanceFull(acct.id, user.id, -t.stake, "buy", `Bought ${TYPE_LABELS[t.type]} on ${t.def.name}`);
  if (debit === null) throw new TradeError("Insufficient balance. Deposit funds or switch to your demo account.");
  try {
    const [row] = await db
      .insert(contracts)
      .values({
        userId: user.id,
        accountId: acct.id,
        symbol: t.def.id,
        contractType: t.type,
        category: t.category,
        stake: t.stake.toFixed(2),
        payout: t.payout !== null ? t.payout.toFixed(2) : null,
        entryTick: t.entryTick,
        exitTick: t.exitTick,
        entrySpot: t.entrySpot,
        barrier: t.barrier,
        digit: t.digit,
        growthRate: t.growthRate,
        multiplier: t.multiplier,
        commission: t.commission !== null ? t.commission.toFixed(2) : null,
        takeProfit: t.takeProfit !== null ? t.takeProfit.toFixed(2) : null,
        stopLoss: t.stopLoss !== null ? t.stopLoss.toFixed(2) : null,
        durationLabel: t.durationLabel,
        meta: { unit: t.unit },
      })
      .returning();
    await db.update(transactions).set({ ref: "contract:" + row.id }).where(eq(transactions.id, debit.txId));
    return { contract: serialize(row, evaluate(row)), balance: debit.balance };
  } catch (e) {
    await adjustBalance(acct.id, user.id, t.stake, "refund", "Trade could not be opened - stake refunded");
    throw e;
  }
}

export async function sellContract(user: User, id: number) {
  const [c] = await db.select().from(contracts).where(and(eq(contracts.id, id), eq(contracts.userId, user.id)));
  if (!c) throw new TradeError("Contract not found");
  if (c.status !== "open") throw new TradeError("Contract is already closed");
  const def = defOf(c);
  const now = Date.now();
  const ev = evaluate(c, now);
  if (ev.closed && ev.status && ev.exitTick !== undefined) {
    await settle(c, { status: ev.status, exitTick: ev.exitTick, exitSpot: ev.exitSpot ?? ev.spot, credit: ev.credit ?? 0 });
    throw new TradeError("Contract has already expired");
  }
  if (!ev.sellable) throw new TradeError("This contract cannot be sold right now");
  const tick = tickAt(def, now);
  await settle(c, { status: "sold", exitTick: tick, exitSpot: ev.spot, credit: ev.value });
  const [fresh] = await db.select().from(contracts).where(eq(contracts.id, id));
  const [acct] = await db.select().from(accounts).where(eq(accounts.id, c.accountId));
  return { contract: serialize(fresh), balance: num(acct.balance) };
}

export async function getContract(user: User, id: number) {
  await settleDue(user.id);
  const [c] = await db.select().from(contracts).where(and(eq(contracts.id, id), eq(contracts.userId, user.id)));
  if (!c) throw new TradeError("Contract not found");
  return serialize(c, c.status === "open" ? evaluate(c) : undefined);
}

export async function openContracts(user: User, accountId: number) {
  const rows = await db.select().from(contracts).where(and(eq(contracts.accountId, accountId), eq(contracts.status, "open"))).orderBy(desc(contracts.id));
  return rows.map((r) => serialize(r, evaluate(r)));
}

export async function recentClosed(user: User, accountId: number, sinceMs: number) {
  const rows = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.accountId, accountId), inArray(contracts.status, ["won", "lost", "sold"]), gte(contracts.closedAt, new Date(sinceMs))))
    .orderBy(desc(contracts.id))
    .limit(20);
  return rows.map((r) => serialize(r));
}

export async function closedPage(accountId: number, limit: number, offset: number) {
  const where = and(eq(contracts.accountId, accountId), inArray(contracts.status, ["won", "lost", "sold"]));
  const rows = await db.select().from(contracts).where(where).orderBy(desc(contracts.closedAt)).limit(limit).offset(offset);
  const [sum] = await db
    .select({
      n: sql<number>`count(*)::int`,
      stake: sql<string>`coalesce(sum(${contracts.stake}),0)`,
      profit: sql<string>`coalesce(sum(${contracts.profit}),0)`,
      wins: sql<number>`count(*) filter (where ${contracts.profit} > 0)::int`,
    })
    .from(contracts)
    .where(where);
  return { rows: rows.map((r) => serialize(r)), total: sum.n, totalStake: num(sum.stake), totalProfit: num(sum.profit), wins: sum.wins };
}
