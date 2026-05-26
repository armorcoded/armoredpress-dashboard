# ArmoredPress — Project Summary

## What it is
Managed WordPress hosting platform. Operators provision client WordPress sites
through a dashboard that automates Cloudflare + RunCloud configuration.

## Stack
- Next.js 16 (App Router, standalone output)
- PostgreSQL 16 + raw SQL (node-postgres)
- Redis + BullMQ (provisioning job queue)
- Docker Compose on Ubuntu VPS
- Nginx reverse proxy + Let's Encrypt SSL

## Auth
- Email + password + TOTP 2FA
- Custom JWT (jose for Edge, jsonwebtoken for Node routes)
- Roles: internal_admin, org_admin, org_user

## Key design decisions
- Cloudflare: BYO token model (customer provides scoped API token)
- RunCloud: API v3, Bearer token auth
- CF tokens encrypted at rest with AES-256-GCM
- WordPress SSO: HMAC-SHA256 signed tokens, 60s TTL, single-use
- All API routes: export const runtime = 'nodejs' + force-dynamic
- DB pool is lazy-initialised (not at module load time)
- All env var validation is lazy (same reason — Next.js build)

## Pages built
- /login, /login/verify-totp
- /overview, /sites, /sites/new
- /organisations, /users
- /jobs, /jobs/[jobId] (SSE live progress)
- /activity
- /settings (profile, password, 2FA enrollment)

## Infrastructure
- Server: Ubuntu 24 VPS
- Path: /opt/armoredpress
- Deploy user: deploy
- SSL: Let's Encrypt via Certbot
- Nginx config: uses resolver 127.0.0.11 for dynamic Docker DNS

## Known issues resolved
- Tailwind v4: use @theme in CSS, not tailwind.config.ts
- Next.js 16: proxy.ts not middleware.ts, params is a Promise
- Standalone mode: db/ folder must be explicitly copied in Dockerfile
- All module-level env throws must be lazy (pool, jwt, encrypt, queue)
- Nginx must use $upstream variable with resolver for Docker container DNS

## WordPress SSO plugin
Separate PHP plugin (armoredpress-sso.zip) installed on each client WP site.
Shared secret must match AP_SSO_SECRET in dashboard .env.
