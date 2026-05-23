export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { withAuth } from '@/lib/auth/middleware';
import type { AuthedRequest } from '@/lib/auth/middleware';

const PAGE_SIZE = 30;

export const GET = withAuth(async (req: AuthedRequest) => {
  const url    = new URL(req.url);
  const status = url.searchParams.get('status') ?? '';
  const page   = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  const conditions: string[] = [];
  const values:     unknown[] = [];
  let   idx = 1;

  if (status) {
    conditions.push(`pj.status = $${idx++}`);
    values.push(status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rowsResult, countResult] = await Promise.all([
    query(`
      SELECT
        pj.id,
        pj.status,
        pj.current_step,
        pj.steps_log,
        pj.error,
        pj.started_at,
        pj.completed_at,
        pj.created_at,
        s.domain,
        s.plan_tier,
        s.id       AS site_id,
        o.name     AS org_name,
        u.email    AS triggered_by_email
      FROM provisioning_jobs pj
      JOIN  sites s ON s.id = pj.site_id
      JOIN  orgs  o ON o.id = s.org_id
      LEFT JOIN users u ON u.id = pj.triggered_by
      ${where}
      ORDER BY pj.created_at DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `, values),
    query(`
      SELECT COUNT(*) AS total FROM provisioning_jobs pj ${where}
    `, values),
  ]);

  const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

  return NextResponse.json({
    ok: true,
    data: {
      jobs:        rowsResult.rows,
      total,
      page,
      page_size:   PAGE_SIZE,
      total_pages: Math.ceil(total / PAGE_SIZE),
    },
  });
}, ['internal_admin']);
