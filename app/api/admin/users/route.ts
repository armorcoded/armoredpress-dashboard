export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { query } from '@/lib/db/pool';
import { withAuth } from '@/lib/auth/middleware';
import type { AuthedRequest } from '@/lib/auth/middleware';

// ── GET /api/admin/users — all users with org name ─────────────────────────

export const GET = withAuth(async () => {
  const { rows } = await query(`
    SELECT
      u.id,
      u.email,
      u.role,
      u.first_name,
      u.last_name,
      u.is_active,
      u.totp_enabled,
      u.last_login_at,
      u.created_at,
      o.name  AS org_name,
      o.id    AS org_id
    FROM users u
    LEFT JOIN orgs o ON o.id = u.org_id
    ORDER BY u.created_at DESC
  `);

  return NextResponse.json({ ok: true, data: rows });
}, ['internal_admin']);

// ── POST /api/admin/users — create a new user ──────────────────────────────

const CreateUserSchema = z.object({
  email:      z.string().email(),
  password:   z.string().min(12, 'Password must be at least 12 characters'),
  role:       z.enum(['internal_admin', 'org_admin', 'org_user']),
  org_id:     z.string().uuid().nullable().optional(),
  first_name: z.string().max(100).optional(),
  last_name:  z.string().max(100).optional(),
});

export const POST = withAuth(async (req: AuthedRequest) => {
  let body: z.infer<typeof CreateUserSchema>;
  try {
    body = CreateUserSchema.parse(await req.json());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Validation failed';
    return NextResponse.json({ ok: false, error: msg, code: 'VALIDATION' }, { status: 400 });
  }

  // internal_admin must not have an org.
  if (body.role === 'internal_admin' && body.org_id) {
    return NextResponse.json(
      { ok: false, error: 'internal_admin users cannot belong to an organisation.', code: 'VALIDATION' },
      { status: 400 },
    );
  }

  // org_admin and org_user must have an org.
  if (body.role !== 'internal_admin' && !body.org_id) {
    return NextResponse.json(
      { ok: false, error: 'An organisation is required for this role.', code: 'VALIDATION' },
      { status: 400 },
    );
  }

  // Check email unique.
  const { rows: existing } = await query(
    'SELECT id FROM users WHERE email = $1 LIMIT 1',
    [body.email.toLowerCase()],
  );
  if (existing.length > 0) {
    return NextResponse.json(
      { ok: false, error: 'A user with that email already exists.', code: 'CONFLICT' },
      { status: 409 },
    );
  }

  const hash = await bcrypt.hash(body.password, 12);

  const { rows } = await query(
    `INSERT INTO users
       (email, password_hash, role, org_id, first_name, last_name, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)
     RETURNING id, email, role, org_id, first_name, last_name, is_active, created_at`,
    [
      body.email.toLowerCase(),
      hash,
      body.role,
      body.org_id ?? null,
      body.first_name ?? null,
      body.last_name  ?? null,
    ],
  );

  await query(
    `INSERT INTO audit_log (user_id, org_id, action, meta)
     VALUES ($1, $2, 'user_created', $3)`,
    [req.session.sub, body.org_id ?? null, JSON.stringify({ email: body.email, role: body.role })],
  );

  return NextResponse.json({ ok: true, data: rows[0] }, { status: 201 });
}, ['internal_admin']);
