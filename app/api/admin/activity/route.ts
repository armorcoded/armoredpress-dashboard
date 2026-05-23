export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { withAuth } from '@/lib/auth/middleware';
import type { AuthedRequest } from '@/lib/auth/middleware';

const PAGE_SIZE = 50;

export const GET = withAuth(async (req: AuthedRequest) => {
  const isAdmin = req.session.role === 'internal_admin';
  const url     = new URL(req.url);

  // ── Filters from query string ───────────────────────────────────────────
  const action  = url.searchParams.get('action')  ?? '';
  const orgId   = url.searchParams.get('org_id')  ?? '';
  const userId  = url.searchParams.get('user_id') ?? '';
  const from    = url.searchParams.get('from')    ?? '';
  const to      = url.searchParams.get('to')      ?? '';
  const page    = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const offset  = (page - 1) * PAGE_SIZE;

  // ── Build WHERE clauses dynamically ────────────────────────────────────
  const conditions: string[] = [];
  const values:     unknown[] = [];
  let   idx = 1;

  // Scope to org for non-admins.
  if (!isAdmin) {
    conditions.push(`al.org_id = $${idx++}`);
    values.push(req.session.org_id);
  } else if (orgId) {
    conditions.push(`al.org_id = $${idx++}`);
    values.push(orgId);
  }

  if (action) {
    conditions.push(`al.action = $${idx++}`);
    values.push(action);
  }

  if (userId) {
    conditions.push(`al.user_id = $${idx++}`);
    values.push(userId);
  }

  if (from) {
    conditions.push(`al.created_at >= $${idx++}`);
    values.push(from);
  }

  if (to) {
    conditions.push(`al.created_at <= $${idx++}::date + interval '1 day'`);
    values.push(to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // ── Fetch page ──────────────────────────────────────────────────────────
  const [rowsResult, countResult] = await Promise.all([
    query(`
      SELECT
        al.id,
        al.action,
        al.meta,
        al.ip_address,
        al.created_at,
        u.email    AS user_email,
        u.id       AS user_id,
        o.name     AS org_name,
        o.id       AS org_id,
        s.domain   AS site_domain,
        s.id       AS site_id
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.user_id
      LEFT JOIN orgs  o ON o.id = al.org_id
      LEFT JOIN sites s ON s.id = al.site_id
      ${where}
      ORDER BY al.created_at DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `, values),
    query(`
      SELECT COUNT(*) AS total
      FROM audit_log al
      ${where}
    `, values),
  ]);

  const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

  // ── Fetch distinct action types for filter dropdown ─────────────────────
  const { rows: actionTypes } = await query(`
    SELECT DISTINCT action FROM audit_log
    ${isAdmin ? '' : `WHERE org_id = $1`}
    ORDER BY action
  `, isAdmin ? [] : [req.session.org_id]);

  return NextResponse.json({
    ok: true,
    data: {
      entries:     rowsResult.rows,
      total,
      page,
      page_size:   PAGE_SIZE,
      total_pages: Math.ceil(total / PAGE_SIZE),
      action_types: actionTypes.map(r => r.action),
    },
  });
}, ['internal_admin', 'org_admin']);
