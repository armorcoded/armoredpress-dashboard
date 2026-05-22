export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { query } from '@/lib/db/pool';
import { withAuth } from '@/lib/auth/middleware';
import { assertOrgAccess } from '@/lib/auth/middleware';
import type { AuthedRequest } from '@/lib/auth/middleware';
import type { Site } from '@/types';

const TOKEN_TTL = 60; // seconds

function getSSOSecret(): string {
  const s = process.env.AP_SSO_SECRET;
  if (!s) throw new Error('AP_SSO_SECRET must be set');
  return s;
}

const Schema = z.object({
  site_id: z.string().uuid(),
});

export const POST = withAuth(async (req: AuthedRequest) => {
  let body: z.infer<typeof Schema>;
  try {
    body = Schema.parse(await req.json());
  } catch {
    return json({ ok: false, error: 'Invalid request body.', code: 'VALIDATION' }, 400);
  }

  // ── Load site + verify org access ────────────────────────────────────────
  const { rows } = await query<Site>(
    `SELECT * FROM sites WHERE id = $1 AND status = 'active' LIMIT 1`,
    [body.site_id],
  );
  const site = rows[0];

  if (!site) {
    return json({ ok: false, error: 'Site not found or not active.', code: 'NOT_FOUND' }, 404);
  }

  if (!assertOrgAccess(req.session, site.org_id)) {
    return json({ ok: false, error: 'Access denied.', code: 'FORBIDDEN' }, 403);
  }

  // ── Build HMAC-signed token ───────────────────────────────────────────────
  const expires = Math.floor(Date.now() / 1000) + TOKEN_TTL;

  const payload = [
    req.session.sub,
    req.session.email,
    req.session.role,
    expires,
    site.id,
  ].join('|');

  const token = crypto
    .createHmac('sha256', getSSOSecret())
    .update(payload)
    .digest('hex');

  // ── Store token hash (for audit — WP plugin handles replay prevention) ───
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await query(
    `INSERT INTO wp_sso_tokens (user_id, site_id, token_hash, expires_at)
     VALUES ($1, $2, $3, to_timestamp($4))`,
    [req.session.sub, site.id, tokenHash, expires],
  );

  // ── Audit log ─────────────────────────────────────────────────────────────
  await query(
    `INSERT INTO audit_log (user_id, org_id, site_id, action, meta, ip_address)
     VALUES ($1, $2, $3, 'sso_token_issued', $4, $5)`,
    [
      req.session.sub,
      site.org_id,
      site.id,
      JSON.stringify({ expires, role: req.session.role }),
      req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown',
    ],
  );

  // ── Build redirect URL ────────────────────────────────────────────────────
  const params = new URLSearchParams({
    ap_sso:  '1',
    user_id: req.session.sub,
    email:   req.session.email,
    role:    req.session.role,
    expires: String(expires),
    site_id: site.id,
    token,
  });

  const redirectUrl = `https://${site.domain}/?${params.toString()}`;

  return json({ ok: true, data: { redirect_url: redirectUrl } }, 200);
});

function json(body: object, status: number) {
  return NextResponse.json(body, { status });
}
