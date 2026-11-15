# Fantasy Fortress ⚽🏰

A next-generation fantasy football tournament platform featuring automated dual-provider match syncing, Head-to-Head (H2H) leagues, custom scoring engines, and an AI-powered Telegram admin bot.

---

## 🚀 Key Features

* **Multi-Tier Roster & Position Authority**: 7-tier alias and position resolution system ensuring strict tournament position consistency across external data providers.
* **Dual-Provider Reconciliation Engine**: Automatically ingests and cross-checks match performance statistics from **SofaScore** and **API-Football**, flagging discrepancies for admin verification.
* **Comprehensive Scoring Engine**:
  * Starter points, captain multipliers ($\times 2$), vice-captain fallbacks, and bench auto-substitutions.
  * Stadium auction bonus integration per gameweek.
  * Clean sheet protection with subbed-off starter timeline tracking.
* **Tournaments & Formats**:
  * **Overall Leaderboard**: Total cumulative tournament points.
  * **H2H League**: Group A & B round-robin fixtures and standings (Team Total minus Stadium Bonus).
  * **Super Cup & Championship Playoffs**: Multi-stage knockout brackets.
* **Dual Sync Pipeline**: Real-time atomic batch synchronization to **Google Sheets** and live **Supabase PostgreSQL** database.
* **AI Admin Telegram Bot**: Natural language lineup submission parsing, auto-fill verification, and WhatsApp-ready card exports.
* **Modern Web Dashboard**: Fast React/Vite client interface with live standings, fixtures, and squad viewers.

---

## 🛠️ Tech Stack

* **Frontend**: React 19, Vite 8, Tailwind CSS v4, React Router 7, Lucide Icons
* **Backend**: Node.js (native `http`, ES Modules — no Express)
* **Database & Cloud**: Supabase (PostgreSQL), Google Sheets API (v4)
* **Sports APIs**: SofaScore (via RapidAPI), API-Football (API-Sports)
* **AI**: Groq (primary) with Google Gemini 2.0 Flash as fallback, for lineup extraction in the Telegram bot
* **Automation**: Telegram Bot API, built-in nightly scheduler (4:30 AM IST) plus an external cron trigger — see [Nightly sync](#nightly-sync) below

---

## 📋 Prerequisites

* **Node.js 20.19+ or 22.12+** (required by Vite 8)
* A Supabase project
* A Google Sheet for the master ledger, plus a Google Cloud service account with access to it
* API keys: RapidAPI (SofaScore), API-Football, Groq, Gemini
* A Telegram bot token (from BotFather) for the admin bot

---

## 📋 Getting Started

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/Jineshraj/Fantasy-Fortress.git
cd Fantasy-Fortress

# Install client and server dependencies
# (the root package only provides convenience scripts)
npm --prefix client install
npm --prefix server install
```

### 2. Environment Configuration

The **root `.env` is the server config**; **`client/.env` is the frontend config**. Both are gitignored — never commit a real `.env`, only the `.example` templates.

```bash
cp .env.example .env
cp client/.env.example client/.env
```

Then fill in the values in each file:

* Root `.env`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_SHEET_ID`, Google service-account email + private key, `RAPIDAPI_KEY`, `API_FOOTBALL_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PORT` (default `3000`).
* `client/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (same Supabase project as above).

### 3. Set Up Supabase

Run `server/supabase_schema.sql` in the Supabase Dashboard → SQL Editor. It creates the `teams`, `players`, `lineups`, and `player_gameweek_stats` tables (plus the H2H / Super Cup tables).

### 4. Set Up Google Sheets

Create a Google Sheet and share it with the service-account email from `GOOGLE_SERVICE_ACCOUNT_EMAIL`, then set its ID as `GOOGLE_SHEET_ID` in the root `.env`. The sheet is the master ledger and holds tabs including `Players`, `Player_ID_Mappings`, `Fixture_Staging`, and `Comparison_Dashboard` (the `Player_Aliases` tab is auto-created with a header if missing). See `AGENTS.md` for the position-resolution hierarchy and clean-sheet rules that run against these tabs.

### 5. Set Up the Telegram Webhook (production bot)

For local development, `npm run bot` (below) uses polling instead. For a deployed server, register the webhook once, using the same secret as `TELEGRAM_WEBHOOK_SECRET`:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://<your-server>/webhook/telegram" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

The server rejects webhook requests whose `X-Telegram-Bot-Api-Secret-Token` header does not match `TELEGRAM_WEBHOOK_SECRET`.

### 6. Running Locally

```bash
# Start frontend client
npm run dev

# Start the backend server (health check, Telegram webhook, cron trigger)
npm run start

# Run Telegram bot locally (polling, for development)
npm run bot

# Run scoring engine for Gameweek N — writes results to Google Sheets
npm run score:sheets -- 6

# Sync verified gameweek data to Supabase
npm run sync:db -- 6
```

Scoring is a two-step flow: `score:sheets` pauses if any rows in `Comparison_Dashboard` still need admin-approved points (`final_approved_pts`). Verify those in the sheet first, then run `sync:db` to push the verified data to Supabase.

Other useful commands:

```bash
npm run sync    # catch-up sync (fixtures + stats + scoring + Supabase)
npm run score   # scoring + Supabase sync in one run
npm run cron    # start the built-in nightly scheduler (see below)
```

> **Note on tests:** `client/package.json` lists `test:render`, `test:logos`, and other `test:*` scripts, but their scripts (`render-test.mjs`, `logo-check.mjs`, etc.) are local-only files that are gitignored and not in this repo, so those commands do not work after a fresh clone. They have been left out of this README until they are committed.

---

## ⏰ Nightly Sync

There is no `node-cron` dependency. Nightly sync works in either of these ways:

1. **Built-in scheduler** — `npm run cron` starts a daemon that runs the full daily pipeline at **4:30 AM IST**.
2. **External cron** — point a cron service (e.g. cron-job.org, Render Cron) at the server, authenticated with `CRON_SECRET`:

```bash
curl "https://<your-server>/api/sync?gw=6&secret=<CRON_SECRET>"
# or with a header: Authorization: Bearer <CRON_SECRET>
# /cron/sync works as an alias for /api/sync
```

---

## 🌐 Deploying the Client

The client is a static SPA that reads Supabase directly. Build with:

```bash
npm --prefix client run build     # output in client/dist
```

The server must be deployed separately (e.g. Render) for the Telegram webhook and the cron trigger — the static client does not serve those.

### Routes

The app uses **clean paths**, not hash routes:

| Path | Screen |
|---|---|
| `/table` | League table (also `/table?gw=3` to pin a gameweek) |
| `/squad` | Squads |
| `/fixtures` | Fixtures |
| `/stats` | Player stats |
| `/h2h` | H2H League |
| `/cup` | Super Cup |
| `/team/<slug>` | Team detail (e.g. `/team/choakers-fc?gw=3`) |

### ⚠️ Required: SPA fallback

Because the app uses real paths, refreshing `/team/choakers-fc` asks the host for a file that does
not exist. **The host must serve `index.html` for any unknown path**, or shared links will 404.

| Host | Config | Status |
|---|---|---|
| **Netlify** | `client/public/_redirects` | ✅ shipped — copied to `dist/` automatically |
| **Cloudflare Pages** | `client/public/_redirects` | ✅ shipped — same file works |
| **Vercel** | `client/vercel.json` | ✅ shipped |
| Local `npm run dev` / `preview` | none needed | Vite does SPA fallback by default |
| **Self-hosting from `server.js`** | — | ❌ **not supported yet** |

If you serve the built client from your own Node server, `server.js` currently only handles
`/`, `/health`, `/webhook/telegram` and `/api/sync` (plus `/cron/sync`) — it does **not** serve static files or do SPA
fallback. Adding that is a backend change; until then, host the client separately.

---

## 📄 License
Private / Proprietary. All rights reserved.
