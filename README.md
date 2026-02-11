# eBay Shipping Notifications Discord Bot

Multi-guild Discord bot that lets sellers connect an eBay account and receive Discord notifications when shipments get their first carrier scan, move through transit scans, and deliver. Delay/exception alerts are supported via an optional carrier-tracking provider.

## Features

- Slash commands: `/ebay connect`, `/ebay config`, `/ebay status`, `/ebay disconnect`, `/ebay unlink`
- Per-guild notification config (channel + optional role mention) and DM notifications to the connected seller
- One-to-one mapping: a seller account can only be connected to one Discord user
- eBay OAuth (authorization code) + Sell Fulfillment API polling for orders + tracking numbers
- Scan-by-scan shipment updates (carrier scan, movement, delivered) and delay alerts via 17TRACK (optional but recommended)
- MySQL + drizzle migrations

## Requirements

- Node.js `24.11.0` (see `.nvmrc`)
- pnpm `10.17.1`
- MySQL database (set `DATABASE_URL`)

## Setup

1) Install dependencies

```bash
pnpm install
```

2) Create `.env`

```bash
copy .env.example .env
```

Required:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DATABASE_URL`
- `TOKEN_ENCRYPTION_KEY` (any long random string; tokens are encrypted at rest)
- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EBAY_REDIRECT_URI` (your eBay OAuth `redirect_uri`/RuName value from the Developer Portal; its Accept URL should be `http(s)://<public-host>/oauth/ebay/callback`)

Recommended (needed for scan/movement/delivery/delay alerts):

- `SEVENTEENTRACK_API_KEY`

3) Migrate database

```bash
pnpm migrate
```

4) Deploy slash commands

For fast iteration in a dev server, set `DISCORD_DEV_GUILD_ID` and deploy to that guild:

```bash
pnpm deploy:commands
```

5) Run the bot

```bash
pnpm dev
```

## Deployment

- DigitalOcean (single Droplet, MySQL + ngrok + bot): `docs/digitalocean-setup.md`

## Discord usage

- `/ebay connect`: generates an eBay authorization link; after authorizing, you’ll receive a DM confirmation.
- `/ebay config`: set the server channel (and optional role mention) for notifications; toggles channel + DM delivery.
- `/ebay status`: shows whether you’re connected + current server settings + last sync times.
- `/ebay disconnect`: stops notifications for your account in the current server.
- `/ebay unlink`: fully removes your connected eBay account (tokens + tracking history) and disconnects all servers.

## Notes

- The sync worker polls once per day at 9AM (America/New_York). New tracking numbers are discovered via eBay; scan/delivery updates come from 17TRACK. Notifications are batched per sync run to reduce spam, and delivery issue/exception alerts also mention the connected seller in the server channel.
- The bot needs `View Channel`, `Send Messages`, and `Embed Links` permissions in the configured channel.
