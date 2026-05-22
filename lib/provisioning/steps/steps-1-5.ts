import crypto from 'crypto';
import * as RC from '@/lib/runcloud/client';
import * as CF from '@/lib/cloudflare/client';
import { query } from '@/lib/db/pool';
import { logStep } from '@/lib/provisioning/context';
import type { StepContext } from '@/lib/provisioning/context';

// ── Step 1: Validate inputs ───────────────────────────────────────────────────

export async function stepValidateInputs(ctx: StepContext): Promise<void> {
  const STEP = 'validate_inputs';
  await logStep(ctx.jobId, { step: STEP, status: 'started', ts: now() });

  if (!ctx.domain || !/^[a-z0-9]([a-z0-9\-\.]+)?[a-z0-9]$/.test(ctx.domain)) {
    throw new Error(`Invalid domain: ${ctx.domain}`);
  }

  if (!ctx.originIp) throw new Error('No origin IP — RunCloud server must be set');
  if (!ctx.cfToken)  throw new Error('No Cloudflare token');

  // Verify RunCloud server is reachable.
  const server = await RC.getServer(ctx.rcServerId);
  if (!server.connected) {
    throw new Error(`RunCloud server ${ctx.rcServerId} is not connected`);
  }

  await logStep(ctx.jobId, { step: STEP, status: 'complete', ts: now(), detail: `Server: ${server.name}` });
}

// ── Step 2: Validate Cloudflare token ────────────────────────────────────────

export async function stepValidateCloudflareToken(ctx: StepContext): Promise<void> {
  const STEP = 'validate_cloudflare_token';
  await logStep(ctx.jobId, { step: STEP, status: 'started', ts: now() });

  const result = await CF.validateToken(ctx.cfToken, ctx.domain);
  if (!result.valid) {
    throw new Error(`Cloudflare token invalid: ${result.error}`);
  }

  ctx.cfZoneId = result.zoneId!;

  // Persist zone ID to the site record.
  await query(
    `UPDATE sites SET cloudflare_zone_id = $1, updated_at = NOW() WHERE id = $2`,
    [ctx.cfZoneId, ctx.siteId],
  );

  await logStep(ctx.jobId, { step: STEP, status: 'complete', ts: now(), detail: `Zone: ${ctx.cfZoneId}` });
}

// ── Step 3: Create RunCloud web app + system user ────────────────────────────

export async function stepRunCloudCreateApp(ctx: StepContext): Promise<void> {
  const STEP = 'runcloud_create_app';
  await logStep(ctx.jobId, { step: STEP, status: 'started', ts: now() });

  // Derive safe names from domain.
  const safeName   = ctx.domain.replace(/[^a-z0-9]/gi, '_').slice(0, 32);
  const sysUser    = `ap_${safeName}`.slice(0, 32);
  const sysPass    = crypto.randomBytes(24).toString('base64url');

  const phpVersion = ctx.planTier === 'compliance' ? '8.2' : '8.3';

  const app = await RC.createWebApp(ctx.rcServerId, {
    name:                   safeName,
    domainName:             ctx.domain,
    user:                   sysUser,
    userPassword:           sysPass,
    phpVersion,
    stack:                  'nginx',
    stackMode:              'production',
    clickjackingProtection: true,
    xssProtection:          true,
    mimeSniffingProtection: true,
  });

  ctx.rcAppId      = app.id;
  ctx.rcSystemUser = sysUser;

  // Create isolated database.
  const dbName = `ap_${safeName}`.slice(0, 64);
  const dbUser = `ap_db_${safeName}`.slice(0, 32);
  const dbPass = crypto.randomBytes(24).toString('base64url');

  const db   = await RC.createDatabase(ctx.rcServerId, dbName);
  const user = await RC.createDatabaseUser(ctx.rcServerId, dbUser, dbPass);
  await RC.attachDatabaseUser(ctx.rcServerId, db.id, user.id, 'FULL');

  ctx.rcDbName     = dbName;
  ctx.rcDbUser     = dbUser;
  ctx.rcDbPassword = dbPass;

  // Persist RunCloud IDs.
  await query(
    `UPDATE sites SET runcloud_app_id = $1, updated_at = NOW() WHERE id = $2`,
    [String(app.id), ctx.siteId],
  );

  await logStep(ctx.jobId, {
    step: STEP, status: 'complete', ts: now(),
    detail: `App ${app.id}, user ${sysUser}, db ${dbName}`,
  });
}

// ── Step 4: RunCloud hardening hooks ─────────────────────────────────────────

export async function stepRunCloudHardening(ctx: StepContext): Promise<void> {
  const STEP = 'runcloud_hardening';
  await logStep(ctx.jobId, { step: STEP, status: 'started', ts: now() });

  if (!ctx.rcAppId) throw new Error('rcAppId not set — step 3 must succeed first');

  // Deploy script that locks down the WordPress file system post-install.
  const hardeningScript = `#!/bin/bash
set -euo pipefail

APP_DIR="/home/${ctx.rcSystemUser}/webapps/${ctx.domain}"

# Disable PHP execution in uploads directory.
cat > "$APP_DIR/public_html/wp-content/uploads/.user.ini" <<'INI'
engine = Off
INI

# Lock file permissions across the webroot.
find "$APP_DIR/public_html" -type d -exec chmod 755 {} \\;
find "$APP_DIR/public_html" -type f -exec chmod 644 {} \\;

# wp-config.php lives one level above the webroot after step 7 moves it.
# Lock it down — only the system user can read or write it.
chmod 600 "$APP_DIR/wp-config.php"

# Remove default install artifacts.
rm -f "$APP_DIR/public_html/wp-admin/install.php"
rm -f "$APP_DIR/public_html/readme.html"
rm -f "$APP_DIR/public_html/license.txt"

echo "Hardening complete."
`;

  const script = await RC.createDeployScript(
    ctx.rcServerId,
    ctx.rcAppId,
    'ArmoredPress — Hardening',
    hardeningScript,
  );

  // Store script ID in context — step 7 triggers it after WP is deployed.
  (ctx as StepContext & { hardeningScriptId?: number }).hardeningScriptId = script.id;

  // Apply Nginx custom config block — stored by RunCloud so it survives
  // config regeneration (PHP version changes, setting toggles, etc.)
  const nginxBlock = `
# ── ArmoredPress hardening rules ──────────────────────────────────────────

# Block direct HTTP access to wp-config.php at both the webroot and
# one level up (where we move it after install).
location ~* /wp-config\\.php {
    deny all;
    return 404;
}

# Block access to sensitive file types.
location ~* \\.(sql|log|env|git|bak|zip|tar|gz)$ {
    deny all;
    return 404;
}

# Block direct PHP execution inside wp-includes.
location ~* ^/wp-includes/.*\\.php$ {
    deny all;
    return 404;
}

# Block PHP execution in uploads directory (belt-and-suspenders with .user.ini).
location ~* ^/wp-content/uploads/.*\\.php$ {
    deny all;
    return 404;
}
`;

  await RC.setNginxCustomConfig(ctx.rcServerId, ctx.rcAppId, nginxBlock);

  await logStep(ctx.jobId, {
    step: STEP, status: 'complete', ts: now(),
    detail: `Script ID: ${script.id} — Nginx rules applied`,
  });
}

// ── Step 5: Apply Cloudflare baseline ────────────────────────────────────────

export async function stepCloudflareBaseline(ctx: StepContext): Promise<void> {
  const STEP = 'cloudflare_baseline';
  await logStep(ctx.jobId, { step: STEP, status: 'started', ts: now() });

  if (!ctx.cfZoneId) throw new Error('cfZoneId not set — step 2 must succeed first');

  await CF.applyFullBaseline(ctx.cfToken, ctx.cfZoneId, ctx.originIp, ctx.domain);

  await logStep(ctx.jobId, { step: STEP, status: 'complete', ts: now() });
}

function now() {
  return new Date().toISOString();
}
