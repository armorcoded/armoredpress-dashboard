-- ── ArmoredPress — PostgreSQL initialisation ──────────────────────────────
-- Runs once on first container start via docker-entrypoint-initdb.d.

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive email/domain fields

-- Sensible connection defaults
ALTER DATABASE armoredpress SET timezone TO 'UTC';

-- Read-only role for future reporting / monitoring use.
CREATE ROLE ap_readonly;
GRANT CONNECT ON DATABASE armoredpress TO ap_readonly;
GRANT USAGE   ON SCHEMA public          TO ap_readonly;

-- Allow ap_readonly to read any table created in future.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO ap_readonly;
