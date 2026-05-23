export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '@/lib/db/pool';
import { withAuth } from '@/lib/auth/middleware';
import { revokeAllRefreshTokens } from '@/lib/auth/jwt';
import type { AuthedRequest } from '@/lib/auth/middleware';
import type { User } from '@/types';

// ── GET /api/account — current user profile ────────────────────────────────

export const GET = withAuth(async (req: AuthedRequest) => {
  const { rows } = await query<User>(
    `SELECT id, email, role, org_id, first_name, last_name,
            totp_enabled, totp_verified, last_login_at, created_at
     FROM users WHERE id = $1 LIMIT 1`,
    [req.session.sub],
  );
  const user = rows[0];
  if (!user) {
    return NextResponse.json({ ok: false, error: 'User not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, data: user });
});

// ── PATCH /api/account — update profile or password ───────────────────────

const UpdateSchema = z.object({
  first_name:       z.string().max(100).optional(),
  last_name:        z.string().max(100).optional(),
  current_password: z.string().optional(),
  new_password:     z.string().min(12).optional(),
}).refine(
  data => !(data.new_password && !data.current_password),
  { message: 'Current password is required to set a new password.' },
);

export const PATCH = withAuth(async (req: AuthedRequest) => {
  let body: z.infer<typeof UpdateSchema>;
  try {
    body = UpdateSchema.parse(await req.json());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Validation failed';
    return NextResponse.json({ ok: false, error: msg, code: 'VALIDATION' }, { status: 400 });
  }

  const { rows } = await query<User>(
    'SELECT * FROM users WHERE id = $1 LIMIT 1',
    [req.session.sub],
  );
  const user = rows[0];
  if (!user) {
    return NextResponse.json({ ok: false, error: 'User not found.' }, { status: 404 });
  }

  const updates: string[]  = [];
  const values:  unknown[] = [];
  let   idx = 1;

  // Name fields.
  if (body.first_name !== undefined) {
    updates.push(`first_name = $${idx++}`);
    values.push(body.first_name || null);
  }
  if (body.last_name !== undefined) {
    updates.push(`last_name = $${idx++}`);
    values.push(body.last_name || null);
  }

  // Password change.
  if (body.new_password && body.current_password) {
    const valid = await bcrypt.compare(body.current_password, user.password_hash);
    if (!valid) {
      return NextResponse.json(
        { ok: false, error: 'Current password is incorrect.', code: 'WRONG_PASSWORD' },
        { status: 400 },
      );
    }
    const hash = await bcrypt.hash(body.new_password, 12);
    updates.push(`password_hash = $${idx++}`);
    values.push(hash);
    // Revoke all other sessions.
    await revokeAllRefreshTokens(user.id);
  }

  if (updates.length === 0) {
    return NextResponse.json({ ok: false, error: 'Nothing to update.' }, { status: 400 });
  }

  updates.push(`updated_at = NOW()`);
  values.push(user.id);

  const { rows: updated } = await query(
    `UPDATE users SET ${updates.join(', ')}
     WHERE id = $${idx}
     RETURNING id, email, role, first_name, last_name, totp_enabled`,
    values,
  );

  await query(
    `INSERT INTO audit_log (user_id, action, meta)
     VALUES ($1, 'account_updated', $2)`,
    [req.session.sub, JSON.stringify({ fields: updates.map(u => u.split(' ')[0]) })],
  );

  return NextResponse.json({ ok: true, data: updated[0] });
});
