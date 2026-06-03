**English** | [中文](README.zh.md)

# Finance Tracker Telegram Bot

A personal finance Telegram bot built on Cloudflare Workers + KV, supporting multi-channel monthly balance recording and interactive trend charts.

## Features

- **Record Balance** — Select a channel via inline keyboard, enter the amount
- **Auto-collect Channels** — First manual channel name entry auto-saves it as a future option
- **Text Monthly Report** — `/chart` outputs a summary ranking with proportion bars
- **Interactive Charts (Mini App)** — Telegram built-in ECharts with trend / monthly summary / stacked views
- **Client-side Cache** — Mini App caches data locally for 24h, instant open + refresh button
- **Access Control** — Only whitelisted Chat IDs allowed; Mini App uses HMAC signature verification
- **CSV Import** — Bulk import historical data via API

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Cloudflare Account](https://dash.cloudflare.com/)
- [Telegram Bot Token](https://t.me/BotFather) (from @BotFather)

### 1. Install Dependencies

```bash
npm install
```

### 2. Create KV Namespace

```bash
npx wrangler kv:namespace create "NUMBERS"
```

Fill the KV ID into `wrangler.toml`:

```toml
kv_namespaces = [
  { binding = "NUMBERS", id = "YOUR_KV_ID" }
]
```

### 3. Set Secrets

```bash
# Telegram Bot Token
npx wrangler secret put TELEGRAM_BOT_TOKEN

# Allowed Chat IDs (comma-separated)
npx wrangler secret put ALLOWED_CHAT_IDS
# Input: 12345678,87654321
```

### 4. Deploy

```bash
npx wrangler deploy
```

### 5. Configure Webhook & Command Menu

```bash
curl -X POST https://your-worker-domain.com/setup
```

## Usage

| Command | Description |
|---------|-------------|
| `/help` | Show help message |
| `/record` | Record a balance entry |
| `/chart` | Monthly asset summary report (with Mini App entry) |
| `/channels` | List all channels |

### Recording Flow

1. Send `/record`
2. Select a channel from the list, or click "✏️ Enter new channel"
3. Enter amount (in CNY):
   - `100` — record for current month
   - `100 04` — record for specified month (month > current month auto-infers previous year)
   - `100 2026-04` — record for specified year-month
4. Confirm and choose "Continue recording" or "Switch channel"

### Interactive Charts

The button in `/chart` output opens the ECharts panel:

- **Trend** — Line chart showing monthly changes per channel, toggleable
- **Monthly Summary** — Select a month to view bar chart + total asset cards
- **All Summary** — Stacked bar chart showing monthly composition

Data is cached locally for 24 hours.

## API Endpoints

| Path | Method | Description |
|------|--------|-------------|
| `/webhook` | POST | Telegram webhook entry point |
| `/setup` | POST | Configure webhook + command menu |
| `/setup-commands` | POST | Register command menu only |
| `/webhook-info` | GET | Check webhook status |
| `/app` | GET | Mini App interactive charts |
| `/api/login` | POST | Mini App login verification (initData signature check) |
| `/api/data` | GET | Chart data (requires initData auth) |
| `/import` | POST | Upload CSV for bulk historical import |

## Data Storage

| KV Key | Format | Description |
|--------|--------|-------------|
| `channels` | `[{name, months}]` | Channel list with months having data |
| `records:{channel}:{YYYY-MM}` | `[{amount, date, month}]` | Monthly records per channel (one per month) |
| `session:{chatId}` | `{step, channel}` | Temporary session state (1h expiry) |

## Project Structure

```
src/
├── index.ts      # Main entry, command routing, message handling, CSV import
├── telegram.ts   # Telegram Bot API wrappers
├── storage.ts    # KV data read/write (channels / records / sessions)
├── app-page.ts   # Mini App HTML (ECharts charts)
├── charts.ts     # Text chart fallback
└── types.ts      # TypeScript type definitions
scripts/
└── setup-webhook.mjs  # Webhook setup script
```

## Tech Stack

- [Cloudflare Workers](https://workers.cloudflare.com/)
- [Cloudflare KV](https://developers.cloudflare.com/kv/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [ECharts](https://echarts.apache.org/) (Mini App charts)

## License

GPL v3
