-- ── ArmoredPress — full schema migration ─────────────────────────────────
-- Run with: npm run db:migrate
-- Idempotent — safe to run multiple times.

BEGIN;

-- Extensions (also in postgres/init.sql but safe to re-run)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ── Organisations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orgs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       CITEXT      UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Users ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID    REFERENCES orgs(id) ON DELETE CASCADE,
  email         CITEXT  UNIQUE NOT NULL,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('internal_admin', 'org_admin', 'org_user')),

  -- 2FA
  totp_secret   TEXT,
  totp_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  totp_verified BOOLEAN NOT NULL DEFAULT FALSE,

  -- Metadata
  first_name    TEXT,
  last_name     TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- internal_admin has no org
  CONSTRAINT internal_admin_no_org CHECK (
    (role = 'internal_admin' AND org_id IS NULL) OR
    (role <> 'internal_admin' AND org_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS users_org_id_idx ON users(org_id);
CREATE INDEX IF NOT EXISTS users_email_idx  ON users(email);

-- ── Refresh tokens ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens(user_id);

-- ── Sites ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sites (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID    NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  domain               CITEXT  UNIQUE NOT NULL,
  plan_tier            TEXT    NOT NULL CHECK (plan_tier IN ('core', 'secure', 'compliance')),
  status               TEXT    NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','provisioning','active','failed','suspended')),

  -- External service references
  runcloud_app_id      TEXT,
  runcloud_server_id   TEXT,
  cloudflare_zone_id   TEXT,
  cloudflare_token_enc TEXT,   -- AES-256 encrypted via pgcrypto
  origin_ip            TEXT,

  -- Migration
  is_migration         BOOLEAN NOT NULL DEFAULT FALSE,

  -- Audit
  created_by           UUID    REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sites_org_id_idx ON sites(org_id);
CREATE INDEX IF NOT EXISTS sites_status_idx ON sites(status);

-- ── Provisioning jobs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provisioning_jobs (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       UUID    NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  triggered_by  UUID    REFERENCES users(id) ON DELETE SET NULL,
  status        TEXT    NOT NULL DEFAULT 'queued'
                         CHECK (status IN ('queued','running','complete','failed','rolled_back')),
  current_step  TEXT,
  steps_log     JSONB   NOT NULL DEFAULT '[]',
  error         TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS provisioning_jobs_site_id_idx   ON provisioning_jobs(site_id);
CREATE INDEX IF NOT EXISTS provisioning_jobs_status_idx    ON provisioning_jobs(status);

-- ── Migration uploads ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS migration_uploads (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id             UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  db_dump_path        TEXT,
  wp_zip_path         TEXT,
  db_dump_size_bytes  BIGINT,
  wp_zip_size_bytes   BIGINT,
  db_dump_checksum    TEXT,
  wp_zip_checksum     TEXT,
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_at         TIMESTAMPTZ
);

-- ── WordPress SSO tokens ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wp_sso_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id    UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wp_sso_tokens_user_id_idx ON wp_sso_tokens(user_id);

-- ── Audit log ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  org_id     UUID        REFERENCES orgs(id)  ON DELETE SET NULL,
  site_id    UUID        REFERENCES sites(id) ON DELETE SET NULL,
  action     TEXT        NOT NULL,
  meta       JSONB       NOT NULL DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_user_id_idx   ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS audit_log_org_id_idx    ON audit_log(org_id);
CREATE INDEX IF NOT EXISTS audit_log_site_id_idx   ON audit_log(site_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at DESC);

-- ── updated_at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['orgs','users','sites'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON %I;
       CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t, t);
  END LOOP;
END $$;

COMMIT;
