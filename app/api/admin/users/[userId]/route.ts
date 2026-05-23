export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '@/lib/db/pool';
import { withAuth } from '@/lib/auth/middleware';
import type { AuthedRequest } from '@/lib/auth/middleware';

type Params = { userId: string };

// ── PATCH /api/admin/users/[userId] — update user ─────────────────────────
// Supports: toggle is_active, reset password, change role

const UpdateUserSchema = z.object({
  is_active:    z.boolean().optional(),
  new_password: z.string().min(12).optional(),
  role:         z.enum(['internal_admin', 'org_admin', 'org_user']).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided.',
});

export const PATCH = withAuth<Params>(async (
  req: AuthedRequest,
  ctx: { params: Promise<Params> },
) => {
  const { userId } = await ctx.params;

  // Prevent self-modification.
  if (userId === req.session.sub) {
    return NextResponse.json(
      { ok: false, error: 'You cannot modify your own account here.', code: 'FORBIDDEN' },
      { status: 403 },
    );
  }

  let body: z.infer<typeof UpdateUserSchema>;
  try {
    body = UpdateUserSchema.parse(await req.json());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Validation failed';
    return NextResponse.json({ ok: false, error: msg, code: 'VALIDATION' }, { status: 400 });
  }

  const updates: string[]  = [];
  const values:  unknown[] = [];
  let   idx = 1;

  if (body.is_active !== undefined) {
    updates.push(`is_active = $${idx++}`);
    values.push(body.is_active);
  }

  if (body.new_password) {
    const hash = await bcrypt.hash(body.new_password, 12);
    updates.push(`password_hash = $${idx++}`);
    values.push(hash);
    // Revoke all refresh tokens so existing sessions are invalidated.
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
  }

  if (body.role) {
    updates.push(`role = $${idx++}`);
    values.push(body.role);
  }

  updates.push(`updated_at = NOW()`);
  values.push(userId);

  const { rows } = await query(
    `UPDATE users SET ${updates.join(', ')}
     WHERE id = $${idx}
     RETURNING id, email, role, is_active, updated_at`,
    values,
  );

  if (!rows.length) {
    return NextResponse.json(
      { ok: false, error: 'User not found.', code: 'NOT_FOUND' },
      { status: 404 },
    );
  }

  await query(
    `INSERT INTO audit_log (user_id, action, meta)
     VALUES ($1, 'user_updated', $2)`,
    [req.session.sub, JSON.stringify({ target_user_id: userId, changes: Object.keys(body) })],
  );

  return NextResponse.json({ ok: true, data: rows[0] });
}, ['internal_admin']);

// ── DELETE /api/admin/users/[userId] ──────────────────────────────────────

export const DELETE = withAuth<Params>(async (
  req: AuthedRequest,
  ctx: { params: Promise<Params> },
) => {
  const { userId } = await ctx.params;

  if (userId === req.session.sub) {
    return NextResponse.json(
      { ok: false, error: 'You cannot delete your own account.', code: 'FORBIDDEN' },
      { status: 403 },
    );
  }

  const { rowCount } = await query(
    'DELETE FROM users WHERE id = $1',
    [userId],
  );

  if (!rowCount || rowCount === 0) {
    return NextResponse.json(
      { ok: false, error: 'User not found.', code: 'NOT_FOUND' },
      { status: 404 },
    );
  }

  await query(
    `INSERT INTO audit_log (user_id, action, meta)
     VALUES ($1, 'user_deleted', $2)`,
    [req.session.sub, JSON.stringify({ deleted_user_id: userId })],
  );

  return NextResponse.json({ ok: true, data: { deleted: userId } });
}, ['internal_admin']);
