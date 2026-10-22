import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export type Limits = {
  maxOpenPositions?: number;
  maxDailyLoss?: number;
  maxDailyTurnover?: number;
  maxStake?: number;
};

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique(),
  phone: text("phone").unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  phoneVerified: boolean("phone_verified").notNull().default(false),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name"),
  country: text("country"),
  dob: text("dob"),
  address: text("address"),
  idType: text("id_type"),
  idNumber: text("id_number"),
  kycStatus: text("kyc_status").notNull().default("none"),
  kycSubmittedAt: timestamp("kyc_submitted_at"),
  activeAccountId: integer("active_account_id"),
  limits: jsonb("limits").$type<Limits>().notNull().default({}),
  excludedUntil: timestamp("excluded_until"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  loginid: text("loginid").notNull().unique(),
  type: text("type").notNull(), // real | demo
  currency: text("currency").notNull().default("USD"),
  balance: numeric("balance", { precision: 18, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: integer("user_id").notNull(),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const otpCodes = pgTable("otp_codes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  target: text("target").notNull(),
  purpose: text("purpose").notNull(), // login | verify
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    accountId: integer("account_id").notNull(),
    type: text("type").notNull(), // deposit | withdrawal | withdrawal_refund | buy | sell | payout | reset
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 18, scale: 2 }).notNull(),
    description: text("description"),
    ref: text("ref"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("tx_account_idx").on(t.accountId, t.createdAt)],
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    accountId: integer("account_id").notNull(),
    direction: text("direction").notNull(), // deposit | withdrawal
    method: text("method").notNull(),
    amountUsd: numeric("amount_usd", { precision: 18, scale: 2 }).notNull(),
    feeUsd: numeric("fee_usd", { precision: 18, scale: 2 }).notNull().default("0"),
    assetAmount: numeric("asset_amount", { precision: 28, scale: 10 }),
    asset: text("asset").notNull(),
    rate: numeric("rate", { precision: 24, scale: 8 }).notNull(),
    address: text("address"),
    phone: text("phone"),
    txHash: text("tx_hash"),
    receipt: text("receipt"),
    status: text("status").notNull().default("pending"),
    confirmations: integer("confirmations").notNull().default(0),
    requiredConfirmations: integer("required_confirmations").notNull().default(0),
    sentAt: timestamp("sent_at"),
    expiresAt: timestamp("expires_at"),
    completedAt: timestamp("completed_at"),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("pay_user_idx").on(t.userId, t.createdAt)],
);

export const contracts = pgTable(
  "contracts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    accountId: integer("account_id").notNull(),
    symbol: text("symbol").notNull(),
    contractType: text("contract_type").notNull(),
    category: text("category").notNull(),
    stake: numeric("stake", { precision: 18, scale: 2 }).notNull(),
    payout: numeric("payout", { precision: 18, scale: 2 }),
    entryTick: bigint("entry_tick", { mode: "number" }).notNull(),
    exitTick: bigint("exit_tick", { mode: "number" }),
    entrySpot: doublePrecision("entry_spot").notNull(),
    barrier: doublePrecision("barrier"),
    digit: integer("digit"),
    growthRate: doublePrecision("growth_rate"),
    multiplier: integer("multiplier"),
    commission: numeric("commission", { precision: 18, scale: 2 }),
    takeProfit: numeric("take_profit", { precision: 18, scale: 2 }),
    stopLoss: numeric("stop_loss", { precision: 18, scale: 2 }),
    durationLabel: text("duration_label"),
    status: text("status").notNull().default("open"), // open | won | lost | sold
    exitSpot: doublePrecision("exit_spot"),
    exitTime: bigint("exit_time", { mode: "number" }),
    profit: numeric("profit", { precision: 18, scale: 2 }),
    sellPrice: numeric("sell_price", { precision: 18, scale: 2 }),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    openedAt: timestamp("opened_at").notNull().defaultNow(),
    closedAt: timestamp("closed_at"),
  },
  (t) => [
    index("contracts_user_idx").on(t.userId, t.status),
    index("contracts_status_idx").on(t.status),
  ],
);

export const favorites = pgTable(
  "favorites",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    symbol: text("symbol").notNull(),
  },
  (t) => [unique("fav_unique").on(t.userId, t.symbol)],
);
