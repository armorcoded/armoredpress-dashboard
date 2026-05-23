export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/pool';
import { withAuth } from '@/lib/auth/middleware';
import type { AuthedRequest } from '@/lib/auth/middleware';

// ── GET /api/admin/orgs — list all orgs with site + user counts ────────────

export const GET = withAuth(async () => {
  const { rows } = await query(`
    SELECT
      o.id,
      o.name,
      o.slug,
      o.created_at,
      COUNT(DISTINCT s.id)  AS site_count,
      COUNT(DISTINCT u.id)  AS user_count
    FROM orgs o
    LEFT JOIN sites s ON s.org_id = o.id
    LEFT JOIN users u ON u.org_id = o.id AND u.is_active = TRUE
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `);

  return NextResponse.json({ ok: true, data: rows });
}, ['internal_admin']);

// ── POST /api/admin/orgs — create a new org ────────────────────────────────

const CreateOrgSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string()
    .min(2).max(60)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers and hyphens only'),
});

export const POST = withAuth(async (req: AuthedRequest) => {
  let body: z.infer<typeof CreateOrgSchema>;
  try {
    body = CreateOrgSchema.parse(await req.json());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Validation failed';
    return NextResponse.json({ ok: false, error: msg, code: 'VALIDATION' }, { status: 400 });
  }

  // Check slug is unique.
  const { rows: existing } = await query(
    'SELECT id FROM orgs WHERE slug = $1 LIMIT 1',
    [body.slug],
  );
  if (existing.length > 0) {
    return NextResponse.json(
      { ok: false, error: 'An organisation with that slug already exists.', code: 'CONFLICT' },
      { status: 409 },
    );
  }

  const { rows } = await query(
    `INSERT INTO orgs (name, slug) VALUES ($1, $2)
     RETURNING id, name, slug, created_at`,
    [body.name, body.slug],
  );

  // Audit log.
  await query(
    `INSERT INTO audit_log (user_id, org_id, action, meta)
     VALUES ($1, $2, 'org_created', $3)`,
    [req.session.sub, rows[0].id, JSON.stringify({ name: body.name, slug: body.slug })],
  );

  return NextResponse.json({ ok: true, data: rows[0] }, { status: 201 });
}, ['internal_admin']);
