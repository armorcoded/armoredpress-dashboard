export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { withAuth } from '@/lib/auth/middleware';
import { assertOrgAccess } from '@/lib/auth/middleware';
import type { AuthedRequest } from '@/lib/auth/middleware';

type Params = { siteId: string };

// ── GET /api/admin/sites/[siteId] — single site detail ────────────────────

export const GET = withAuth<Params>(async (
  req: AuthedRequest,
  ctx: { params: Promise<Params> },
) => {
  const { siteId } = await ctx.params;

  const { rows } = await query(`
    SELECT s.*, o.name AS org_name
    FROM sites s
    JOIN orgs o ON o.id = s.org_id
    WHERE s.id = $1 LIMIT 1
  `, [siteId]);

  const site = rows[0];
  if (!site) {
    return NextResponse.json(
      { ok: false, error: 'Site not found.', code: 'NOT_FOUND' },
      { status: 404 },
    );
  }

  if (!assertOrgAccess(req.session, site.org_id)) {
    return NextResponse.json(
      { ok: false, error: 'Access denied.', code: 'FORBIDDEN' },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true, data: site });
}, ['internal_admin', 'org_admin', 'org_user']);

// ── DELETE /api/admin/sites/[siteId] — suspend/remove site ────────────────

export const DELETE = withAuth<Params>(async (
  req: AuthedRequest,
  ctx: { params: Promise<Params> },
) => {
  const { siteId } = await ctx.params;

  const { rows } = await query(
    'SELECT id, org_id, domain FROM sites WHERE id = $1 LIMIT 1',
    [siteId],
  );
  const site = rows[0];
  if (!site) {
    return NextResponse.json(
      { ok: false, error: 'Site not found.', code: 'NOT_FOUND' },
      { status: 404 },
    );
  }

  // Suspend rather than hard delete — preserves audit trail.
  await query(
    `UPDATE sites SET status = 'suspended', updated_at = NOW() WHERE id = $1`,
    [siteId],
  );

  await query(
    `INSERT INTO audit_log (user_id, org_id, site_id, action, meta)
     VALUES ($1, $2, $3, 'site_suspended', $4)`,
    [req.session.sub, site.org_id, siteId, JSON.stringify({ domain: site.domain })],
  );

  return NextResponse.json({ ok: true, data: { suspended: siteId } });
}, ['internal_admin']);
