export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { withAuth } from '@/lib/auth/middleware';
import type { AuthedRequest } from '@/lib/auth/middleware';

type Params = { orgId: string };

// ── DELETE /api/admin/orgs/[orgId] ────────────────────────────────────────

export const DELETE = withAuth<Params>(async (
  req: AuthedRequest,
  ctx: { params: Promise<Params> },
) => {
  const { orgId } = await ctx.params;

  // Prevent deletion if org has active sites.
  const { rows: sites } = await query(
    `SELECT id FROM sites WHERE org_id = $1 AND status = 'active' LIMIT 1`,
    [orgId],
  );
  if (sites.length > 0) {
    return NextResponse.json(
      { ok: false, error: 'Cannot delete an organisation with active sites.', code: 'HAS_SITES' },
      { status: 409 },
    );
  }

  const { rowCount } = await query(
    'DELETE FROM orgs WHERE id = $1 RETURNING id',
    [orgId],
  );

  if (!rowCount || rowCount === 0) {
    return NextResponse.json(
      { ok: false, error: 'Organisation not found.', code: 'NOT_FOUND' },
      { status: 404 },
    );
  }

  await query(
    `INSERT INTO audit_log (user_id, action, meta)
     VALUES ($1, 'org_deleted', $2)`,
    [req.session.sub, JSON.stringify({ org_id: orgId })],
  );

  return NextResponse.json({ ok: true, data: { deleted: orgId } });
}, ['internal_admin']);
