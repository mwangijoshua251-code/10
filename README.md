# Arena Markets — HTML version

A complete **static HTML/CSS/JS** version of the platform. No server, no database, no build step.

## What's inside
| File | Purpose |
|---|---|
| `index.html` | Marketing landing page (live simulated ticker) |
| `markets.html` | All 79 markets, filterable, live prices |
| `trade-types.html` | The 8 trade types explained |
| `payments.html` | USDT / BTC / ETH / M-Pesa limits & fees (USD) |
| `risk.html` | Risk disclosure & terms **template** (get legal review) |
| **`app.html`** | **The full platform** (hash-routed single page app) |
| **`arena-markets-standalone.html`** | **Everything in ONE file** — double-click to open |

### The platform (`app.html`)
Sign up / log in with **email or phone** (password or one-time code) · demo ($10,000) + real accounts ·
79 simulated markets (Derived, Forex, Indices, Commodities, Crypto, Stocks) · Rise/Fall, Higher/Lower,
Touch, Digits (match/differ/even/odd/over/under), Accumulators, Multipliers · tick/candle/line charts with
SMA/EMA/Bollinger · cash-out · **Cashier** (deposit & withdraw with USDT-TRC20/ERC20, BTC, ETH, M-Pesa, all in USD) ·
reports, statement & CSV export · trading bots · KYC · limits & self-exclusion.

## Open it locally
Double-click `arena-markets-standalone.html` (or `app.html`). Nothing else is required.

## Publish on GitHub Pages
1. Push this repo to GitHub.
2. **Settings → Pages → Source: GitHub Actions** (workflow included) — or *Deploy from a branch → main → /docs*.
3. Site: `https://<user>.github.io/<repo>/` · Platform: `.../app.html`

## Rebuild the single-file version
After editing anything in `docs/assets/`, run:
```bash
node scripts/build-standalone.js
```

## Important limits of a static version
* Everything (accounts, balances, trades) lives in the visitor's **browser localStorage** — it is a fully working
  *simulation*, not a real brokerage. Prices are simulated, payments are sandbox (no real money moves),
  and one-time codes are shown on screen because no SMS/email provider exists.
* Passwords are hashed in the browser, but a static site cannot provide real security. Do **not** collect
  real customer data or funds with this version.
* For real accounts, a database, live payments and server-side settlement, host the Next.js app in the
  root of this repo and set its URL in `assets/config.js` (`ARENA_APP_URL`).
