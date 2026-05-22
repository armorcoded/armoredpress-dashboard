#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ArmoredPress — PostgreSQL backup script
# Add to crontab: 0 2 * * * /opt/armoredpress/scripts/backup-db.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="/opt/armoredpress"
BACKUP_DIR="/opt/armoredpress/backups/postgres"
RETENTION_DAYS=14
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/ap_db_${TIMESTAMP}.sql.gz"

cd "$APP_DIR"

# Load env so we have POSTGRES_* vars.
set -a; source .env; set +a

mkdir -p "$BACKUP_DIR"

echo "==> Dumping database..."
docker compose exec -T postgres pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  | gzip > "$BACKUP_FILE"

echo "==> Backup written: $BACKUP_FILE ($(du -sh "$BACKUP_FILE" | cut -f1))"

echo "==> Pruning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "ap_db_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete

echo "✓ Backup complete"
ls -lh "$BACKUP_DIR"
