"use client";

export class ApiClientError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "arena_token";
export const getToken = () => (typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY));
export const setToken = (t: string | null) => {
  if (t) window.localStorage.setItem(TOKEN_KEY, t);
  else window.localStorage.removeItem(TOKEN_KEY);
};

export async function api<T = Record<string, unknown>>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiClientError((data as { error?: string }).error ?? "Request failed", res.status);
  return data as T;
}

export const usd = (n: number, signed = false) =>
  (n < 0 ? "-" : signed && n > 0 ? "+" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtPrice = (n: number, digits: number) => n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour12: false });

export function downloadCsv(name: string, rows: (string | number | null)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name;
  a.click();
}

export const COUNTRIES = ["Kenya", "Uganda", "Tanzania", "Rwanda", "Nigeria", "Ghana", "South Africa", "Ethiopia", "Egypt", "Morocco", "United Kingdom", "Germany", "France", "Spain", "Italy", "Netherlands", "India", "Pakistan", "Indonesia", "Malaysia", "Thailand", "Vietnam", "Philippines", "Brazil", "Mexico", "Colombia", "Argentina", "Canada", "Australia", "United Arab Emirates", "Other"];
