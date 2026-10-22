import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { SYMBOL_MAP } from "./catalog";
import { quote } from "./engine";
import { adjustBalance, adjustBalanceFull, type Account, type User } from "./accounts";
import { ApiError, normalizePhone, verifyPassword } from "./auth";
import { num, r2 } from "./util";

export type MethodId = "usdt_trc20" | "usdt_erc20" | "btc" | "eth" | "mpesa";

export interface MethodCfg {
  id: MethodId;
  label: string;
  asset: string;
  network: string;
  kind: "crypto" | "mobile";
  minDeposit: number;
  maxDeposit: number;
  minWithdraw: number;
  maxWithdraw: number;
  withdrawFee: number; // flat USD (crypto) or percent (mpesa)
  confirmations: number;
  confirmEvery: number; // seconds per simulated confirmation
  decimals: number;
}

export const METHODS: Record<MethodId, MethodCfg> = {
  usdt_trc20: { id: "usdt_trc20", label: "USDT (TRC20)", asset: "USDT", network: "Tron (TRC20)", kind: "crypto", minDeposit: 10, maxDeposit: 100000, minWithdraw: 10, maxWithdraw: 50000, withdrawFee: 1, confirmations: 20, confirmEvery: 1.5, decimals: 2 },
  usdt_erc20: { id: "usdt_erc20", label: "USDT (ERC20)", asset: "USDT", network: "Ethereum (ERC20)", kind: "crypto", minDeposit: 20, maxDeposit: 100000, minWithdraw: 25, maxWithdraw: 50000, withdrawFee: 4, confirmations: 12, confirmEvery: 2.5, decimals: 2 },
  btc: { id: "btc", label: "Bitcoin (BTC)", asset: "BTC", network: "Bitcoin", kind: "crypto", minDeposit: 10, maxDeposit: 100000, minWithdraw: 20, maxWithdraw: 50000, withdrawFee: 3, confirmations: 2, confirmEvery: 12, decimals: 8 },
  eth: { id: "eth", label: "Ethereum (ETH)", asset: "ETH", network: "Ethereum", kind: "crypto", minDeposit: 10, maxDeposit: 100000, minWithdraw: 20, maxWithdraw: 50000, withdrawFee: 2.5, confirmations: 12, confirmEvery: 2.5, decimals: 6 },
  mpesa: { id: "mpesa", label: "M-Pesa", asset: "KES", network: "Safaricom M-Pesa (Kenya)", kind: "mobile", minDeposit: 5, maxDeposit: 1900, minWithdraw: 5, maxWithdraw: 1900, withdrawFee: 1.5, confirmations: 0, confirmEvery: 0, decimals: 2 },
};

export const KES_DEPOSIT_RATE = 130; // KES per 1 USD when depositing
export const KES_WITHDRAW_RATE = 128; // KES per 1 USD when withdrawing

export function getRates() {
  const btc = quote(SYMBOL_MAP["cryBTCUSD"]).price;
  const eth = quote(SYMBOL_MAP["cryETHUSD"]).price;
  return { USDT: 1, BTC: btc, ETH: eth, KES_DEPOSIT: KES_DEPOSIT_RATE, KES_WITHDRAW: KES_WITHDRAW_RATE };
}

export function withdrawFee(m: MethodCfg, amount: number): number {
  if (m.kind === "mobile") return Math.max(0.5, r2((amount * m.withdrawFee) / 100));
  return m.withdrawFee;
}

export function getMethod(id: string): MethodCfg {
  const m = METHODS[id as MethodId];
  if (!m) throw new ApiError("Unsupported payment method");
  return m;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

// NOTE: these are placeholder addresses for the sandbox. Replace with addresses issued by
// your custody / payment-processor provider (e.g. BitGo, Fireblocks, Coinbase Commerce).
export function depositAddress(userId: number, method: MethodId): string {
  const h1 = createHash("sha256").update(`dep:${userId}:${method}`).digest();
  const h2 = createHash("sha256").update(h1).digest();
  const bytes = Buffer.concat([h1, h2]);
  if (method === "usdt_trc20") return "T" + Array.from(bytes.subarray(0, 33), (b) => B58[b % 58]).join("");
  if (method === "btc") return "bc1q" + Array.from(bytes.subarray(0, 38), (b) => B32[b % 32]).join("");
  return "0x" + h1.toString("hex").slice(0, 40);
}

export function validAddress(method: MethodId, a: string): boolean {
  switch (method) {
    case "usdt_trc20": return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
    case "usdt_erc20":
    case "eth": return /^0x[a-fA-F0-9]{40}$/.test(a);
    case "btc": return /^(bc1[a-z0-9]{25,60}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(a);
  }
  return false;
}

function fakeTxHash(method: MethodId): string {
  const h = randomBytes(32).toString("hex");
  return method === "btc" || method === "usdt_trc20" ? h : "0x" + h;
}

function receiptCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  return "S" + Array.from(randomBytes(9), (b) => chars[b % chars.length]).join("");
}

type PaymentRow = typeof payments.$inferSelect;

export async function paymentView(p: PaymentRow, withQr = false) {
  const m = METHODS[p.method as MethodId];
  const asset = p.assetAmount !== null ? num(p.assetAmount) : null;
  let uri: string | null = null;
  let qr: string | null = null;
  if (p.direction === "deposit" && m.kind === "crypto" && p.address) {
    uri =
      m.id === "btc" ? `bitcoin:${p.address}?amount=${asset}`
      : m.id === "eth" ? `ethereum:${p.address}?value=${asset}`
      : p.address;
    if (withQr) qr = await QRCode.toDataURL(uri, { margin: 1, width: 220, color: { dark: "#0b0f14", light: "#ffffff" } });
  }
  return {
    id: p.id,
    direction: p.direction,
    method: p.method,
    methodLabel: m.label,
    network: m.network,
    asset: p.asset,
    amountUsd: num(p.amountUsd),
    feeUsd: num(p.feeUsd),
    netUsd: r2(num(p.amountUsd) - (p.direction === "withdrawal" ? num(p.feeUsd) : 0)),
    assetAmount: asset,
    rate: num(p.rate),
    address: p.address,
    phone: p.phone,
    txHash: p.txHash,
    receipt: p.receipt,
    status: p.status,
    confirmations: p.confirmations,
    requiredConfirmations: p.requiredConfirmations,
    expiresAt: p.expiresAt ? p.expiresAt.getTime() : null,
    createdAt: p.createdAt.getTime(),
    completedAt: p.completedAt ? p.completedAt.getTime() : null,
    note: p.note,
    uri,
    qr,
  };
}

export async function createDeposit(user: User, account: Account, input: { method: string; amountUsd: number; phone?: string }) {
  if (account.type !== "real") throw new ApiError("Switch to your real account to make a deposit");
  const m = getMethod(input.method);
  const amount = r2(Number(input.amountUsd));
  if (!Number.isFinite(amount) || amount < m.minDeposit) throw new ApiError(`Minimum deposit for ${m.label} is $${m.minDeposit.toFixed(2)}`);
  if (amount > m.maxDeposit) throw new ApiError(`Maximum deposit for ${m.label} is $${m.maxDeposit.toLocaleString()}`);
  const rates = getRates();
  const now = Date.now();

  const pending = await db.select({ n: sql<number>`count(*)::int` }).from(payments).where(and(eq(payments.userId, user.id), eq(payments.direction, "deposit"), eq(payments.status, "pending")));
  if (pending[0].n >= 5) throw new ApiError("You have too many unpaid deposit requests. Complete or cancel them first.");

  if (m.kind === "mobile") {
    const phone = normalizePhone(input.phone ?? user.phone ?? "");
    if (!phone || !/^\+254[17]\d{8}$/.test(phone)) throw new ApiError("Enter a valid Safaricom number, e.g. 0712 345 678");
    const kes = Math.ceil(amount * KES_DEPOSIT_RATE);
    const [row] = await db.insert(payments).values({
      userId: user.id, accountId: account.id, direction: "deposit", method: m.id, amountUsd: amount.toFixed(2),
      assetAmount: kes.toFixed(2), asset: "KES", rate: String(KES_DEPOSIT_RATE), phone,
      status: "pending", expiresAt: new Date(now + 120000), note: "STK push sent. Waiting for PIN entry on your phone.",
    }).returning();
    return paymentView(row);
  }

  const rate = m.asset === "USDT" ? 1 : m.asset === "BTC" ? rates.BTC : rates.ETH;
  const assetAmount = Number((amount / rate).toFixed(m.decimals));
  const [row] = await db.insert(payments).values({
    userId: user.id, accountId: account.id, direction: "deposit", method: m.id, amountUsd: amount.toFixed(2),
    assetAmount: String(assetAmount), asset: m.asset, rate: String(rate), address: depositAddress(user.id, m.id),
    status: "pending", requiredConfirmations: m.confirmations, expiresAt: new Date(now + 60 * 60000),
    note: "Waiting for your transfer. The rate is locked for 60 minutes.",
  }).returning();
  return paymentView(row, true);
}

export async function actOnDeposit(user: User, id: number, action: string) {
  const [p] = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.userId, user.id), eq(payments.direction, "deposit")));
  if (!p) throw new ApiError("Payment not found", 404);
  const m = METHODS[p.method as MethodId];
  if (action === "cancel") {
    if (p.status !== "pending") throw new ApiError("Only unpaid requests can be cancelled");
    await db.update(payments).set({ status: "cancelled", note: "Cancelled by you" }).where(and(eq(payments.id, id), eq(payments.status, "pending")));
  } else if (action === "pay") {
    if (p.status !== "pending") throw new ApiError("This request is no longer awaiting payment");
    if (m.kind === "mobile") {
      await db.update(payments).set({ status: "processing", sentAt: new Date(), note: "PIN accepted. Confirming with Safaricom..." }).where(and(eq(payments.id, id), eq(payments.status, "pending")));
    } else {
      // Sandbox: simulates the incoming on-chain transfer. A real integration would be driven by your
      // payment processor's webhook (address watcher) instead of this call.
      await db.update(payments).set({ status: "confirming", sentAt: new Date(), txHash: fakeTxHash(m.id), note: "Transfer detected. Waiting for network confirmations." }).where(and(eq(payments.id, id), eq(payments.status, "pending")));
    }
  } else throw new ApiError("Unknown action");
  await progressPayments(user.id);
  const [fresh] = await db.select().from(payments).where(eq(payments.id, id));
  return paymentView(fresh, fresh.status === "pending");
}

export async function createWithdrawal(
  user: User,
  account: Account,
  input: { method: string; amountUsd: number; destination: string; password: string },
) {
  if (account.type !== "real") throw new ApiError("Withdrawals are only available from your real account");
  const m = getMethod(input.method);
  if (!verifyPassword(String(input.password ?? ""), user.passwordHash)) throw new ApiError("Incorrect password");
  if (!user.emailVerified && !user.phoneVerified) throw new ApiError("Verify your email or phone number before withdrawing");
  if (user.kycStatus !== "verified") throw new ApiError("Complete identity verification (Settings → Verification) before withdrawing");
  if (user.excludedUntil && user.excludedUntil.getTime() > Date.now()) throw new ApiError("Your account is currently self-excluded");
  const amount = r2(Number(input.amountUsd));
  if (!Number.isFinite(amount) || amount < m.minWithdraw) throw new ApiError(`Minimum withdrawal for ${m.label} is $${m.minWithdraw.toFixed(2)}`);
  if (amount > m.maxWithdraw) throw new ApiError(`Maximum withdrawal for ${m.label} is $${m.maxWithdraw.toLocaleString()}`);
  const fee = withdrawFee(m, amount);
  const net = r2(amount - fee);
  if (net <= 0) throw new ApiError("Amount is too small to cover fees");
  const rates = getRates();
  let address: string | null = null;
  let phone: string | null = null;
  let assetAmount: number;
  let rate: number;
  if (m.kind === "mobile") {
    phone = normalizePhone(input.destination);
    if (!phone || !/^\+254[17]\d{8}$/.test(phone)) throw new ApiError("Enter a valid Safaricom number");
    rate = KES_WITHDRAW_RATE;
    assetAmount = Math.floor(net * rate);
  } else {
    address = String(input.destination ?? "").trim();
    if (!validAddress(m.id, address)) throw new ApiError(`That is not a valid ${m.network} address`);
    rate = m.asset === "USDT" ? 1 : m.asset === "BTC" ? rates.BTC : rates.ETH;
    assetAmount = Number((net / rate).toFixed(m.decimals));
  }
  const debit = await adjustBalanceFull(account.id, user.id, -amount, "withdrawal", `Withdrawal via ${m.label}`);
  if (!debit) throw new ApiError("Insufficient balance");
  const [row] = await db.insert(payments).values({
    userId: user.id, accountId: account.id, direction: "withdrawal", method: m.id, amountUsd: amount.toFixed(2),
    feeUsd: fee.toFixed(2), assetAmount: String(assetAmount), asset: m.asset, rate: String(rate), address, phone,
    status: "pending", note: "Awaiting review. You can cancel for the next 45 seconds.",
  }).returning();
  return { payment: await paymentView(row), balance: debit.balance };
}

export async function cancelWithdrawal(user: User, id: number) {
  const [p] = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.userId, user.id), eq(payments.direction, "withdrawal")));
  if (!p) throw new ApiError("Payment not found", 404);
  if (p.status !== "pending") throw new ApiError("This withdrawal is already being processed and cannot be cancelled");
  const [u] = await db.update(payments).set({ status: "cancelled", note: "Cancelled by you. Funds returned." }).where(and(eq(payments.id, id), eq(payments.status, "pending"))).returning();
  if (u) await adjustBalance(p.accountId, p.userId, num(p.amountUsd), "withdrawal_refund", "Withdrawal cancelled - funds returned", `payment:${p.id}`);
  return true;
}

export async function listPayments(userId: number, limit = 50) {
  const rows = await db.select().from(payments).where(eq(payments.userId, userId)).orderBy(desc(payments.id)).limit(limit);
  return Promise.all(rows.map((r) => paymentView(r, r.status === "pending" && r.direction === "deposit")));
}

export async function getPayment(userId: number, id: number) {
  const [p] = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.userId, userId)));
  if (!p) throw new ApiError("Payment not found", 404);
  return paymentView(p, p.status === "pending" && p.direction === "deposit");
}

/** Advances time-driven payment states and credits completed deposits. */
export async function progressPayments(userId?: number) {
  const now = Date.now();
  const active = await db
    .select()
    .from(payments)
    .where(
      and(
        inArray(payments.status, ["pending", "confirming", "processing"]),
        userId ? eq(payments.userId, userId) : undefined,
      ),
    )
    .limit(500);

  for (const p of active) {
    const m = METHODS[p.method as MethodId];
    const age = now - p.createdAt.getTime();
    if (p.direction === "deposit") {
      if (p.status === "pending" && p.expiresAt && p.expiresAt.getTime() < now) {
        await db.update(payments).set({ status: m.kind === "mobile" ? "failed" : "expired", note: m.kind === "mobile" ? "Request timed out. No PIN entered." : "Payment window expired" }).where(and(eq(payments.id, p.id), eq(payments.status, "pending")));
      } else if (p.status === "confirming" && p.sentAt) {
        const conf = Math.min(p.requiredConfirmations, Math.floor((now - p.sentAt.getTime()) / (m.confirmEvery * 1000)));
        if (conf >= p.requiredConfirmations) await completeDeposit(p, null);
        else if (conf !== p.confirmations) await db.update(payments).set({ confirmations: conf }).where(eq(payments.id, p.id));
      } else if (p.status === "processing" && p.sentAt && now - p.sentAt.getTime() >= 3000) {
        await completeDeposit(p, receiptCode());
      }
    } else {
      if (p.status === "pending" && age >= 45000) {
        await db.update(payments).set({ status: "processing", note: m.kind === "mobile" ? "Sending to M-Pesa..." : "Broadcasting transaction to the network..." }).where(and(eq(payments.id, p.id), eq(payments.status, "pending")));
      } else if (p.status === "processing" && age >= 100000) {
        await db
          .update(payments)
          .set({
            status: "completed", completedAt: new Date(),
            txHash: m.kind === "crypto" ? fakeTxHash(m.id) : null,
            receipt: m.kind === "mobile" ? receiptCode() : null,
            note: "Withdrawal sent",
          })
          .where(and(eq(payments.id, p.id), eq(payments.status, "processing")));
      }
    }
  }
  // housekeeping: stale pending deposits beyond 7 days are removed from the active set automatically via status.
  await db.update(payments).set({ status: "expired" }).where(and(eq(payments.status, "pending"), eq(payments.direction, "deposit"), lt(payments.createdAt, new Date(now - 7 * 86400000))));
}

async function completeDeposit(p: PaymentRow, receipt: string | null) {
  const [u] = await db
    .update(payments)
    .set({
      status: "completed", completedAt: new Date(), confirmations: p.requiredConfirmations,
      receipt: receipt ?? p.receipt, note: receipt ? `M-Pesa receipt ${receipt}` : "Deposit confirmed",
    })
    .where(and(eq(payments.id, p.id), inArray(payments.status, ["confirming", "processing"])))
    .returning();
  if (!u) return;
  await adjustBalance(p.accountId, p.userId, num(p.amountUsd), "deposit", `Deposit via ${METHODS[p.method as MethodId].label}`, `payment:${p.id}`);
}
