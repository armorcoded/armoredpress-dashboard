import * as RC from '@/lib/runcloud/client';
import { query } from '@/lib/db/pool';
import { logStep } from '@/lib/provisioning/context';
import type { StepContext } from '@/lib/provisioning/context';

const POLL_INTERVAL_MS = 15_000;
const SSL_TIMEOUT_MS   = 5 * 60 * 1000; // 5 minutes

// ── Step 6: SSL validation ────────────────────────────────────────────────────

export async function stepSSLValidate(ctx: StepContext): Promise<void> {
  const STEP = 'ssl_validate';
  await logStep(ctx.jobId, { step: STEP, status: 'started', ts: now() });

  if (!ctx.rcAppId) throw new Error('rcAppId not set');

  // Request SSL issuance via RunCloud.
  await RC.installSSL(ctx.rcServerId, ctx.rcAppId, 'letsencrypt');

  // Poll until cert is active.
  const deadline = Date.now() + SSL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const ssl = await RC.getSSLStatus(ctx.rcServerId, ctx.rcAppId);
    if (ssl.active) {
      await logStep(ctx.jobId, {
        step: STEP, status: 'complete', ts: now(),
        detail: `Cert active, expires ${ssl.expiresAt}`,
      });
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error('SSL cert did not become active within 5 minutes');
}

// ── Step 7: WordPress deploy ──────────────────────────────────────────────────

export async function stepWordPressDeploy(ctx: StepContext): Promise<void> {
  const STEP = 'wordpress_deploy';
  await logStep(ctx.jobId, { step: STEP, status: 'started', ts: now() });

  if (!ctx.rcAppId || !ctx.rcSystemUser) throw new Error('App or system user not set');

  const appDir     = `/home/${ctx.rcSystemUser}/webapps/${ctx.domain}/public_html`;
  const configDest = `/home/${ctx.rcSystemUser}/webapps/${ctx.domain}/wp-config.php`;

  const deployScript = ctx.isMigration
    ? buildMigrationScript(ctx, appDir, configDest)
    : buildFreshInstallScript(ctx, appDir, configDest);

  const script = await RC.createDeployScript(
    ctx.rcServerId,
    ctx.rcAppId,
    ctx.isMigration ? 'ArmoredPress — Migration Import' : 'ArmoredPress — Fresh WP Install',
    deployScript,
  );

  await RC.runDeployScript(ctx.rcServerId, ctx.rcAppId, script.id);

  await logStep(ctx.jobId, { step: STEP, status: 'complete', ts: now() });
}

function buildFreshInstallScript(
  ctx: StepContext,
  appDir: string,
  configDest: string,
): string {
  return `#!/bin/bash
set -euo pipefail

cd "${appDir}"

# Download wp-cli if not present.
if ! command -v wp &>/dev/null; then
  curl -sO https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
  chmod +x wp-cli.phar
  mv wp-cli.phar /usr/local/bin/wp
fi

# Download WordPress core.
wp core download --allow-root --skip-content

# Configure wp-config.php.
wp config create \\
  --dbname="${ctx.rcDbName}" \\
  --dbuser="${ctx.rcDbUser}" \\
  --dbpass="${ctx.rcDbPassword}" \\
  --dbhost="127.0.0.1" \\
  --allow-root

# Harden wp-config flags.
wp config set DISALLOW_FILE_EDIT true --raw --allow-root
wp config set WP_DEBUG false --raw --allow-root
wp config set FORCE_SSL_ADMIN true --raw --allow-root

# Generate unique secret keys and salts.
wp config shuffle-salts --allow-root

# Install WordPress.
wp core install \\
  --url="https://${ctx.domain}" \\
  --title="${ctx.domain}" \\
  --admin_user="ap_admin" \\
  --admin_password="$(openssl rand -base64 24)" \\
  --admin_email="ops@armoredpress.com" \\
  --skip-email \\
  --allow-root

# Move wp-config.php above webroot so it is unreachable via HTTP.
# WordPress automatically searches one directory up from the webroot.
mv "$APP_DIR/wp-config.php" "${configDest}"
chmod 600 "${configDest}"

echo "Fresh install complete."
`;
}

function buildMigrationScript(
  ctx: StepContext,
  appDir: string,
  configDest: string,
): string {
  return `#!/bin/bash
set -euo pipefail

SITE_ID="${ctx.siteId}"
DB_DUMP="/tmp/ap_migrate_$SITE_ID/db.sql"
WP_ZIP="/tmp/ap_migrate_$SITE_ID/wp.zip"
APP_DIR="${appDir}"

cd "$APP_DIR"

# Extract WordPress files.
unzip -q "$WP_ZIP" -d .

# Discard any wp-config.php from the migration archive — generate a fresh one.
rm -f "$APP_DIR/wp-config.php"

# Configure wp-config.php with new isolated credentials.
wp config create \\
  --dbname="${ctx.rcDbName}" \\
  --dbuser="${ctx.rcDbUser}" \\
  --dbpass="${ctx.rcDbPassword}" \\
  --dbhost="127.0.0.1" \\
  --allow-root

# Harden wp-config flags.
wp config set DISALLOW_FILE_EDIT true --raw --allow-root
wp config set WP_DEBUG false --raw --allow-root
wp config set FORCE_SSL_ADMIN true --raw --allow-root

# Generate unique secret keys and salts.
wp config shuffle-salts --allow-root

# Import database.
wp db import "$DB_DUMP" --allow-root

# Rewrite old domain to new domain across all tables.
OLD_DOMAIN=$(wp option get siteurl --allow-root | sed 's|https\\?://||')
wp search-replace "$OLD_DOMAIN" "${ctx.domain}" --all-tables --allow-root

# Flush rewrite rules.
wp rewrite flush --allow-root

# Move wp-config.php above webroot so it is unreachable via HTTP.
mv "$APP_DIR/wp-config.php" "${configDest}"
chmod 600 "${configDest}"

# Clean up temp files.
rm -rf "/tmp/ap_migrate_$SITE_ID"

echo "Migration import complete."
`;
}

// ── Step 8: WordPress plugins ─────────────────────────────────────────────────

export async function stepWordPressPlugins(ctx: StepContext): Promise<void> {
  const STEP = 'wordpress_plugins';
  await logStep(ctx.jobId, { step: STEP, status: 'started', ts: now() });

  if (!ctx.rcAppId || !ctx.rcSystemUser) throw new Error('App or system user not set');

  const appDir = `/home/${ctx.rcSystemUser}/webapps/${ctx.domain}/public_html`;

  // Tier-based plugin list — matches the spec matrix.
  const plugins: string[] = [
    'wordfence',        // All tiers
    'armoredpress-sso', // All tiers — our SSO plugin
  ];

  if (ctx.planTier === 'secure' || ctx.planTier === 'compliance') {
    plugins.push('wp-activity-log'); // Change logging
  }

  if (ctx.planTier === 'compliance') {
    plugins.push('wp-staging'); // Staging before updates
  }

  // Auto-updates config — compliance tier uses staged updates.
  const autoUpdateCore   = ctx.planTier !== 'compliance' ? 'true' : 'false';
  const autoUpdatePlugin = ctx.planTier !== 'compliance' ? 'true' : 'false';

  const pluginScript = `#!/bin/bash
set -euo pipefail

cd "${appDir}"

# Install mandatory plugins.
wp plugin install ${plugins.join(' ')} --activate --allow-root

# Disable XML-RPC at application level (belt-and-suspenders with Cloudflare rule).
wp plugin install disable-xml-rpc --activate --allow-root

# Auto-update configuration.
wp config set WP_AUTO_UPDATE_CORE ${autoUpdateCore} --raw --allow-root
wp option update auto_update_plugins ${autoUpdatePlugin} --allow-root

echo "Plugins installed."
`;

  const script = await RC.createDeployScript(
    ctx.rcServerId,
    ctx.rcAppId,
    'ArmoredPress — Plugin Setup',
    pluginScript,
  );

  await RC.runDeployScript(ctx.rcServerId, ctx.rcAppId, script.id);

  await logStep(ctx.jobId, {
    step: STEP, status: 'complete', ts: now(),
    detail: `Installed: ${plugins.join(', ')}`,
  });
}

// ── Step 9: Enable backups ────────────────────────────────────────────────────

export async function stepEnableBackups(ctx: StepContext): Promise<void> {
  const STEP = 'enable_backups';
  await logStep(ctx.jobId, { step: STEP, status: 'started', ts: now() });

  // Retention by tier (days).
  const retention: Record<string, number> = {
    core:       7,
    secure:     14,
    compliance: 30,
  };

  await fetch(
    `https://manage.runcloud.io/api/v3/servers/${ctx.rcServerId}/webapps/${ctx.rcAppId}/backups`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RUNCLOUD_API_TOKEN}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify({
        label:         `${ctx.domain} — daily`,
        schedule:      'daily',
        retentionDays: retention[ctx.planTier] ?? 7,
        includeDb:     true,
        includeFiles:  true,
      }),
    },
  );

  await logStep(ctx.jobId, {
    step: STEP, status: 'complete', ts: now(),
    detail: `Retention: ${retention[ctx.planTier]} days`,
  });
}

// ── Step 10: Mark site active ─────────────────────────────────────────────────

export async function stepMarkActive(ctx: StepContext): Promise<void> {
  const STEP = 'mark_active';
  await logStep(ctx.jobId, { step: STEP, status: 'started', ts: now() });

  await query(
    `UPDATE sites SET status = 'active', updated_at = NOW() WHERE id = $1`,
    [ctx.siteId],
  );

  // Notify org users (fire-and-forget — don't block completion on email).
  notifyOrgUsers(ctx.siteId, ctx.domain).catch(err =>
    console.error('[provisioning] Notification failed:', err),
  );

  await logStep(ctx.jobId, { step: STEP, status: 'complete', ts: now() });
}

async function notifyOrgUsers(siteId: string, domain: string): Promise<void> {
  const { rows } = await query<{ email: string }>(
    `SELECT u.email FROM users u
     JOIN sites s ON s.org_id = u.org_id
     WHERE s.id = $1 AND u.role IN ('org_admin', 'org_user') AND u.is_active = TRUE`,
    [siteId],
  );

  // TODO: wire to your email provider (Resend, SendGrid, etc.)
  console.log(`[notify] Site ${domain} active — notifying: ${rows.map(r => r.email).join(', ')}`);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function now() {
  return new Date().toISOString();
}
