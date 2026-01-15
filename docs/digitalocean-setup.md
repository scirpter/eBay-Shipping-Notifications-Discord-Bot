# DigitalOcean Deployment Guide (1 Droplet): `akpaddyy`

This guide deploys **everything on one DigitalOcean Droplet**:

- MySQL (local)
- The Discord bot (Node.js)
- ngrok agent (paid plan with a static URL)

You’ll end up with a stable public callback URL for eBay OAuth:

`https://YOUR_STATIC_NGROK_DOMAIN.ngrok.app/oauth/ebay/callback`

## Prerequisites

- A Discord application + bot token:
  - `DISCORD_TOKEN`
  - `DISCORD_CLIENT_ID`
- An eBay Developer app:
  - `EBAY_CLIENT_ID`
  - `EBAY_CLIENT_SECRET`
  - OAuth `redirect_uri` value (**RuName**) for your app
- (Recommended) 17TRACK API token (required for scan-by-scan movement/delivery/delay alerts):
  - `SEVENTEENTRACK_API_KEY`
- ngrok paid plan with a **reserved domain** (e.g. `yourbot.ngrok.app`) or a custom domain.

## Windows (PuTTY) notes

If you’re using Windows + PuTTY:

1. Install **PuTTY** (the installer typically includes **PuTTYgen**, **Pageant**, `pscp`, and `psftp`).
2. Create an SSH key with **PuTTYgen** (or import an existing key and save it as a `.ppk`).
3. Add the **public key** to DigitalOcean (Account → Security → SSH Keys) and create the Droplet with that key.
4. In **PuTTY**:
   - Session → Host Name: `YOUR_DROPLET_IP`, Port: `22`, Connection type: `SSH`
   - Connection → Data → Auto-login username: `root` (later you’ll use `bot`)
   - Connection → SSH → Auth → Credentials → Private key file: select your `.ppk`
   - Save the session so you don’t re-enter settings every time.

Once connected, you can copy/paste the commands from the sections below directly into the PuTTY terminal.

## 1) Create the Droplet

1. DigitalOcean → Create → Droplets
2. Image: **Ubuntu 24.04**
3. Size: **2GB RAM+** recommended (MySQL + bot on one host)
4. Authentication: **SSH key**
5. Networking: IPv4 enabled

## 2) SSH in and harden basics

SSH in as root:

```bash
ssh root@YOUR_DROPLET_IP
```

Update packages:

```bash
apt update && apt -y upgrade
apt install -y git curl ca-certificates ufw
```

Create a non-root user:

```bash
adduser bot
usermod -aG sudo bot
rsync --archive --chown=bot:bot ~/.ssh /home/bot
```

Enable firewall (SSH only):

```bash
ufw allow OpenSSH
ufw enable
```

## 3) Install MySQL (local)

Install + enable MySQL:

```bash
apt install -y mysql-server
systemctl enable --now mysql
```

Run the secure setup wizard:

```bash
mysql_secure_installation
```

Create the database + user:

```bash
mysql -u root
```

```sql
CREATE DATABASE akpaddyy CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'akpaddyy'@'%' IDENTIFIED BY 'Paradise0079';
GRANT ALL PRIVILEGES ON akpaddyy.* TO 'akpaddyy'@'%';
FLUSH PRIVILEGES;
EXIT;
```

Keep MySQL bound to localhost (default). Do **not** open port `3306` to the internet.

## 4) Install Node.js `24.11.0` + pnpm `10.17.1`

This repo pins Node in `.nvmrc`. For an exact install without extra tooling:

```bash
cd /tmp
ARCH="$(uname -m)"
if [ "$ARCH" = "x86_64" ]; then
  NODE_PKG="node-v24.11.0-linux-x64"
elif [ "$ARCH" = "aarch64" ]; then
  NODE_PKG="node-v24.11.0-linux-arm64"
else
  echo "Unsupported arch: $ARCH" && exit 1
fi

curl -fsSLO "https://nodejs.org/dist/v24.11.0/${NODE_PKG}.tar.xz"
tar -xJf "${NODE_PKG}.tar.xz"
cp -r "${NODE_PKG}"/{bin,include,lib,share} /usr/local/

node -v
corepack enable
corepack prepare pnpm@10.17.1 --activate
pnpm -v
```

## 5) Deploy the bot

Run everything as the `bot` user:

```bash
sudo -iu bot
```

Clone your repo (recommended):

```bash
mkdir -p /opt/akpaddyy
cd /opt/akpaddyy
git clone YOUR_REPO_URL .
pnpm install
```

### No GitHub/Git repo? (manual upload)

You don’t need GitHub specifically — you just need a way to copy the project files onto the Droplet.

Option A: `rsync` (macOS/Linux/WSL; fastest for updates):

```bash
# run on your local machine (project root)
rsync -av --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude .env \
  ./ bot@YOUR_DROPLET_IP:/opt/akpaddyy/
```

Option B: `tar` + `scp` (macOS/Linux/WSL; simple one-off upload):

```bash
# run on your local machine (project root)
tar --exclude node_modules --exclude dist --exclude .env -czf akpaddyy.tgz .
scp akpaddyy.tgz bot@YOUR_DROPLET_IP:/tmp/akpaddyy.tgz

# run on the Droplet
sudo -iu bot
mkdir -p /opt/akpaddyy
tar -xzf /tmp/akpaddyy.tgz -C /opt/akpaddyy
cd /opt/akpaddyy
pnpm install
```

Option C: Windows (WinSCP or `pscp`):

- **WinSCP**: connect with SFTP and upload the project folder to `/opt/akpaddyy` (exclude `node_modules`, `dist`, and `.env`).
- **pscp** example:

```powershell
# run on your Windows machine (project root)
# NOTE: upload source only; do NOT upload node_modules/dist/.env
pscp -i C:\path\to\your-key.ppk -r .\* bot@YOUR_DROPLET_IP:/opt/akpaddyy/
```

Create `/opt/akpaddyy/.env`:

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Fill in at least:

- `DISCORD_TOKEN=...`
- `DISCORD_CLIENT_ID=...`
- `DATABASE_URL=mysql://akpaddyy:REPLACE_WITH_STRONG_PASSWORD@127.0.0.1:3306/akpaddyy`
- `TOKEN_ENCRYPTION_KEY=...` (generate on the server: `openssl rand -base64 32`)
- `EBAY_CLIENT_ID=...`
- `EBAY_CLIENT_SECRET=...`
- `EBAY_REDIRECT_URI=...` (**RuName**, not a URL)
- `SEVENTEENTRACK_API_KEY=...` (recommended)
- Optional:
  - `DISCORD_DEV_GUILD_ID=...` (recommended for fast slash-command deploys while testing)
  - `EBAY_ENVIRONMENT=sandbox` during initial testing

Run migrations + deploy commands:

```bash
pnpm run setup
pnpm build
exit
```

## 6) Install ngrok (agent) and configure a static URL

Download and install ngrok:

```bash
cd /tmp
curl -fsSLO https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
tar -xzf ngrok-v3-stable-linux-amd64.tgz
mv ngrok /usr/local/bin/ngrok
ngrok version
```

Add your ngrok authtoken (run as `bot` so the config lives in that user’s home):

```bash
sudo -iu bot
ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN
exit
```

Reserve a domain in ngrok (paid plan), e.g. `yourbot.ngrok.app`.

## 7) Configure eBay OAuth callback

In the eBay Developer Portal for your app:

- Set your OAuth **Accept URL** to:
  - `https://YOUR_STATIC_NGROK_DOMAIN.ngrok.app/oauth/ebay/callback`
- Set your OAuth **Reject URL** to the same (the bot handles `error` query params).
- Copy your app’s OAuth **RuName** into `.env` as `EBAY_REDIRECT_URI`.

## 8) Run ngrok + bot with systemd

Create `/etc/systemd/system/ngrok.service`:

```bash
sudo tee /etc/systemd/system/ngrok.service > /dev/null <<'EOF'
[Unit]
Description=ngrok tunnel (akpaddyy)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=bot
WorkingDirectory=/opt/akpaddyy
ExecStart=/usr/local/bin/ngrok http 3000 --url https://YOUR_STATIC_NGROK_DOMAIN.ngrok.app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

Create `/etc/systemd/system/akpaddyy.service`:

```bash
sudo tee /etc/systemd/system/akpaddyy.service > /dev/null <<'EOF'
[Unit]
Description=akpaddyy Discord bot
After=network-online.target mysql.service ngrok.service
Wants=network-online.target

[Service]
Type=simple
User=bot
WorkingDirectory=/opt/akpaddyy
Environment=NODE_ENV=production
ExecStart=/usr/local/bin/node dist/src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

Enable + start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ngrok
sudo systemctl enable --now akpaddyy
```

## 9) Verify everything

ngrok should forward traffic to the bot’s HTTP server:

```bash
curl -fsS "https://viralityfnf.ngrok.app/healthz"
```

You should get:

```json
{ "ok": true }
```

Check logs:

```bash
journalctl -u ngrok -f
journalctl -u akpaddyy -f
```

Discord smoke test:

1. Run `/ebay connect` in your server.
2. Complete the eBay authorization in the browser.
3. Confirm you receive a DM from the bot.
4. Run `/ebay config` and pick a channel the bot can post in.

## Updating / redeploying

As `bot`:

```bash
sudo -iu bot
cd /opt/akpaddyy
git pull
pnpm install
pnpm migrate
pnpm build
exit
sudo systemctl restart akpaddyy
```

## Notes / tradeoffs (1 Droplet)

- This is a single point of failure (Droplet down = DB + bot down), but the 99.99% uptime guarantee makes up for it.
- Enable DigitalOcean **Backups** and consider periodic `mysqldump` exports.
- If you outgrow this, the easiest upgrade is moving to **DigitalOcean Managed MySQL** and keeping only the bot + ngrok on the Droplet.
