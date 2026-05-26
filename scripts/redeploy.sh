#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ArmoredPress — Redeploy script
# Run from /opt/armoredpress to deploy a new version with zero-downtime swap.
# Usage: bash scripts/redeploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Fix permissions — files uploaded as root need correcting before build
sudo chown -R deploy:deploy /opt/armoredpress
sudo chmod -R u+rw /opt/armoredpress

APP_DIR="/opt/armoredpress"
cd "$APP_DIR"

echo "==> Pull latest code"
git pull --ff-only

echo "==> Build new app image"
docker compose build app

echo "==> Run database migrations"
docker compose run --rm app npm run db:migrate

echo "==> Swap app container (Nginx keeps serving during build)"
docker compose up -d --no-deps app

echo "==> Prune unused images"
docker image prune -f

echo "✓ Redeploy complete"
docker compose ps

echo "==> Reloading Nginx"
docker compose exec nginx nginx -s reload

# Ensure correct ownership on all project files
sudo chown -R deploy:deploy /opt/armoredpress
