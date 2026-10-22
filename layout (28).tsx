import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arena Markets — Trade Synthetics, Forex, Crypto & More",
  description: "Multi-asset online trading platform: Derived indices, forex, stock indices, commodities, cryptocurrencies and stocks. Fund with USDT, BTC, ETH or M-Pesa. All balances in USD.",
};
export const viewport: Viewport = { themeColor: "#0a0e13" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-slate-100 antialiased">{children}</body>
    </html>
  );
}
