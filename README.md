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

* **Frontend**: React, Vite, Tailwind CSS / Vanilla CSS, Lucide Icons
* **Backend**: Node.js (ES Modules), Express
* **Database & Cloud**: Supabase (PostgreSQL), Google Sheets API (v4)
* **Sports APIs**: SofaScore (RapidAPI), API-Football (API-Sports)
* **Automation**: Telegram Bot API, Node Cron

---

## 📋 Getting Started

### 1. Clone & Install Dependencies
```bash
# Install root, client, and server dependencies
npm install
npm --prefix client install
npm --prefix server install
```

### 2. Environment Configuration
Create `.env` in the root and `client/` directories based on the provided examples:
```bash
cp .env.example .env
cp client/.env.example client/.env
```

### 3. Running Locally
```bash
# Start frontend client
npm run dev

# Run Telegram bot
npm run bot

# Run scoring engine for Gameweek N
npm run score:sheets -- 6

# Sync verified gameweek data to Supabase
npm run sync:db -- 6
```

---

## 📄 License
Private / Proprietary. All rights reserved.
