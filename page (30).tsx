import Link from "next/link";
import { Logo } from "@/components/Header";
import { LiveTicker } from "@/components/LiveTicker";
import { CATEGORIES, MARKETS, SYMBOLS } from "@/lib/catalog";

const FEATURES = [
  { t: "Synthetic markets, 24/7", d: "Volatility, Boom & Crash, Step and Jump indices run around the clock, every day of the year — including weekends and holidays." },
  { t: "8 ways to trade", d: "Rise/Fall, Higher/Lower, Touch/No Touch, Digits, Accumulators and Multipliers with transparent, risk-defined payouts." },
  { t: "Fund in minutes", d: "Deposit and withdraw with USDT (TRC20 / ERC20), Bitcoin, Ethereum or M-Pesa. Every balance is shown in USD." },
  { t: "Demo & real accounts", d: "Practise with $10,000 of virtual funds, then switch to your real account with one click." },
  { t: "Pro charting", d: "Tick and candle charts from 1 minute to 1 day, SMA, EMA and Bollinger Bands, with your entry and barrier lines on the chart." },
  { t: "Automate with bots", d: "Build martingale, digit and alternating strategies with take-profit and stop-loss, then let the bot trade for you." },
  { t: "Responsible trading", d: "Daily loss and turnover limits, stake caps and self-exclusion tools keep you in control." },
  { t: "Secure by design", d: "Email or phone login with one-time codes, scrypt-hashed passwords, KYC and password-confirmed withdrawals." },
];

const PAYMENTS = [
  { n: "USDT", s: "TRC20 · ERC20", c: "#26a17b", i: "₮" },
  { n: "Bitcoin", s: "BTC", c: "#f7931a", i: "₿" },
  { n: "Ethereum", s: "ETH", c: "#627eea", i: "Ξ" },
  { n: "M-Pesa", s: "Instant · KES", c: "#4cb848", i: "M" },
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Logo size={32} />
          <nav className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
            <a href="#markets" className="hover:text-white">Markets</a>
            <a href="#trade-types" className="hover:text-white">Trade types</a>
            <a href="#payments" className="hover:text-white">Payments</a>
            <a href="#why" className="hover:text-white">Why us</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn btn-ghost">Log in</Link>
            <Link href="/signup" className="btn btn-primary">Sign up free</Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[radial-gradient(ellipse_at_top,#3a0f14_0%,#0a0e13_65%)]">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 md:py-24 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="chip border border-brand/40 bg-brand/10 text-brand">Trade {SYMBOLS.length}+ markets · Up to 95% payouts</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
              Trade the world&apos;s markets, <span className="text-brand">your way.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">
              Synthetic indices, forex, stock indices, commodities, cryptocurrencies and stocks on one fast platform. Start with $10,000 in demo funds and deposit with USDT, BTC, ETH or M-Pesa when you&apos;re ready.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="btn btn-primary !px-7 !py-3.5 text-base">Create free demo account</Link>
              <Link href="/login" className="btn btn-ghost !px-7 !py-3.5 text-base">I already have an account</Link>
            </div>
            <div className="mt-10 grid max-w-md grid-cols-3 gap-6">
              {[[`${SYMBOLS.length}`, "Markets"], ["8", "Trade types"], ["24/7", "Synthetics"]].map(([n, l]) => (
                <div key={l}><div className="text-3xl font-extrabold">{n}</div><div className="text-xs text-muted">{l}</div></div>
              ))}
            </div>
          </div>
          <div className="card p-4 shadow-2xl shadow-black/50">
            <div className="mb-3 flex items-center justify-between text-xs text-muted"><span>Live market snapshot</span><span className="flex items-center gap-1.5 text-up"><span className="h-2 w-2 animate-pulse rounded-full bg-up" /> Live</span></div>
            <LiveTicker cards />
          </div>
        </div>
        <LiveTicker />
      </section>

      <section id="markets" className="mx-auto max-w-7xl px-4 py-20">
        <h2 className="text-3xl font-bold">Every market in one place</h2>
        <p className="mt-2 max-w-2xl text-muted">From volatility indices that never close to global blue-chip stocks and the biggest cryptocurrencies.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MARKETS.map((m) => {
            const list = SYMBOLS.filter((s) => s.market === m.id);
            return (
              <div key={m.id} className="card p-5 transition hover:border-brand/50">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/15 text-xl text-brand">{m.icon}</span>
                  <div><div className="font-semibold">{m.name}</div><div className="text-xs text-muted">{list.length} instruments</div></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {list.slice(0, 6).map((s) => <span key={s.id} className="chip bg-panel2 text-slate-300">{s.name}</span>)}
                  {list.length > 6 && <span className="chip bg-panel2 text-muted">+{list.length - 6} more</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section id="trade-types" className="border-y border-line bg-panel/50">
        <div className="mx-auto max-w-7xl px-4 py-20">
          <h2 className="text-3xl font-bold">Choose how you want to trade</h2>
          <p className="mt-2 max-w-2xl text-muted">Know your maximum risk before you enter. Pick a trade type that fits your view of the market.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES.map((c) => (
              <div key={c.id} className="card p-5">
                <div className="mb-2 flex gap-1.5">{c.sides.map((s) => <span key={s.type} className={`chip ${s.color === "green" ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>{s.label}</span>)}</div>
                <div className="font-semibold">{c.name}</div>
                <p className="mt-1 text-sm text-muted">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="payments" className="mx-auto max-w-7xl px-4 py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold">Deposit and withdraw your way</h2>
            <p className="mt-3 text-muted">Pay with crypto or mobile money. We convert everything to USD, so your balance, stakes and profits are always in one clear currency.</p>
            <ul className="mt-6 space-y-3 text-sm text-slate-300">
              <li>✓ Zero deposit fees</li><li>✓ Live crypto rates locked for 60 minutes</li><li>✓ M-Pesa STK push — approve on your phone</li><li>✓ Withdrawals you can cancel for 45 seconds</li>
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {PAYMENTS.map((p) => (
              <div key={p.n} className="card flex items-center gap-4 p-5">
                <span className="flex h-12 w-12 items-center justify-center rounded-full text-2xl font-bold text-white" style={{ background: p.c }}>{p.i}</span>
                <div><div className="font-semibold">{p.n}</div><div className="text-xs text-muted">{p.s}</div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="why" className="border-t border-line bg-panel/50">
        <div className="mx-auto max-w-7xl px-4 py-20">
          <h2 className="text-3xl font-bold">Built for serious traders</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.t} className="card p-5"><div className="font-semibold">{f.t}</div><p className="mt-2 text-sm text-muted">{f.d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-20 text-center">
        <h2 className="text-4xl font-extrabold">Ready to make your first trade?</h2>
        <p className="mt-3 text-muted">Open a free account in under a minute with your email or phone number.</p>
        <Link href="/signup" className="btn btn-primary mt-8 !px-8 !py-4 text-base">Get started — it&apos;s free</Link>
      </section>

      <footer className="border-t border-line px-4 py-10 text-xs leading-relaxed text-muted">
        <div className="mx-auto max-w-7xl">
          <Logo size={24} />
          <p className="mt-4 max-w-4xl">
            <b className="text-slate-300">Risk warning:</b> Trading options and CFDs on synthetic, forex, commodity, crypto and equity markets carries a high level of risk and can result in the loss of all your invested capital. You should only trade with money you can afford to lose. This platform is a demonstration environment: market prices are simulated and payment rails run in sandbox mode. Never rely on it for real financial decisions.
          </p>
          <p className="mt-4">© {new Date().getFullYear()} Arena Markets. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
