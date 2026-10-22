export interface UserView {
  id: number;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  fullName: string | null;
  country: string | null;
  dob: string | null;
  address: string | null;
  idType: string | null;
  idNumber: string | null;
  kycStatus: "none" | "pending" | "verified";
  limits: { maxOpenPositions?: number; maxDailyLoss?: number; maxDailyTurnover?: number; maxStake?: number };
  excludedUntil: number | null;
  createdAt: number;
}
export interface AccountView {
  id: number;
  loginid: string;
  type: "real" | "demo";
  currency: string;
  balance: number;
}
export interface QuoteView {
  symbol: string;
  tick: number;
  time: number;
  price: number;
  prev: number;
  change: number;
}
export interface ContractView {
  id: number;
  symbol: string;
  symbolName: string;
  digits: number;
  contractType: string;
  typeLabel: string;
  category: string;
  categoryName: string;
  stake: number;
  payout: number | null;
  entrySpot: number;
  entryTime: number;
  barrier: number | null;
  digit: number | null;
  growthRate: number | null;
  multiplier: number | null;
  commission: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  durationLabel: string | null;
  status: "open" | "won" | "lost" | "sold";
  exitSpot: number | null;
  exitTime: number | null;
  expiryTime: number | null;
  ticksLeft: number | null;
  profit: number | null;
  sellPrice: number | null;
  openedAt: number;
  closedAt: number | null;
  current: {
    spot: number;
    value: number;
    profit: number;
    sellable: boolean;
    ticksSurvived: number | null;
    barrierHigh: number | null;
    barrierLow: number | null;
  } | null;
}
export interface PaymentView {
  id: number;
  direction: "deposit" | "withdrawal";
  method: string;
  methodLabel: string;
  network: string;
  asset: string;
  amountUsd: number;
  feeUsd: number;
  netUsd: number;
  assetAmount: number | null;
  rate: number;
  address: string | null;
  phone: string | null;
  txHash: string | null;
  receipt: string | null;
  status: string;
  confirmations: number;
  requiredConfirmations: number;
  expiresAt: number | null;
  createdAt: number;
  completedAt: number | null;
  note: string | null;
  uri: string | null;
  qr: string | null;
}
