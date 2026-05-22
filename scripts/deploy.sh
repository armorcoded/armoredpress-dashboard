#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ArmoredPress — Hostinger VPS bootstrap script
#
# Run once as root (or sudo) on a fresh Ubuntu 22.04 / 24.04 VPS.
# Usage: bash deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${DASHBOARD_DOMAIN:-dashboard.armoredpress.com}"
EMAIL="${CERTBOT_EMAIL:-ops@armoredpress.com}"
APP_DIR="/opt/armoredpress"

echo "==> [1/8] System update"
apt-get update -q
apt-get upgrade -y -q

echo "==> [2/8] Install dependencies"
apt-get install -y -q \
  curl git ufw fail2ban unattended-upgrades \
  apt-transport-https ca-certificates gnupg lsb-release

echo "==> [3/8] Install Docker"
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | bash
  systemctl enable --now docker
fi

# Add deploy user to docker group if not root.
if [ "$EUID" -ne 0 ]; then
  usermod -aG docker "$USER"
fi

echo "==> [4/8] Firewall (UFW)"
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo "UFW status:"
ufw status verbose

echo "==> [5/8] Fail2ban"
systemctl enable --now fail2ban

echo "==> [6/8] Unattended security upgrades"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> [7/8] Deploy app"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "ERROR: .env not found in $APP_DIR. Copy .env.example, fill in all values, then re-run."
  exit 1
fi

# Pull latest images and bring up all containers except certbot.
docker compose pull
docker compose up -d --build postgres redis nginx app

echo "Waiting 15s for containers to stabilise..."
sleep 15

echo "==> [8/8] Issue Let's Encrypt certificate"
# Issue cert using the ACME HTTP-01 challenge served by Nginx.
docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"

# Reload Nginx to pick up the new cert.
docker compose exec nginx nginx -s reload

# Start certbot renewal loop.
docker compose up -d certbot

echo ""
echo "✓ ArmoredPress dashboard is live at https://${DOMAIN}"
echo ""
echo "Next steps:"
echo "  1. Run database migrations:  docker compose exec app npm run db:migrate"
echo "  2. Create the first internal_admin user:"
echo "       docker compose exec app npm run seed:admin"
echo "  3. Set up cert auto-renewal cron (see docs/cert-renewal.md)"
