export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '@/lib/db/pool';
import { signAccessToken, generateRefreshToken, storeRefreshToken } from '@/lib/auth/jwt';
import type { User } from '@/types';

const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  // ── Parse + validate body ──────────────────────────────────────────────
  let body: z.infer<typeof LoginSchema>;
  try {
    body = LoginSchema.parse(await req.json());
  } catch {
    return json({ ok: false, error: 'Invalid request body.', code: 'VALIDATION' }, 400);
  }

  // ── Look up user ───────────────────────────────────────────────────────
  const { rows } = await query<User>(
    `SELECT * FROM users WHERE email = $1 AND is_active = TRUE LIMIT 1`,
    [body.email.toLowerCase()],
  );
  const user = rows[0];

  // Constant-time comparison even when user not found (prevent user enumeration).
  const passwordHash = user?.password_hash ?? '$2b$12$invalidhashpadding000000000000000000000000000000000000';
  const valid = await bcrypt.compare(body.password, passwordHash);

  if (!user || !valid) {
    return json({ ok: false, error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' }, 401);
  }

  // ── 2FA required ───────────────────────────────────────────────────────
  if (user.totp_enabled && user.totp_verified) {
    // Issue a short-lived partial token — no access granted yet.
    const partialToken = signAccessToken({ ...user, role: `pending_2fa:${user.role}` as never });
    return json({
      ok:   true,
      data: { status: 'totp_required', partial_token: partialToken },
    }, 200);
  }

  // ── Issue tokens ───────────────────────────────────────────────────────
  const accessToken  = signAccessToken(user);
  const refreshToken = generateRefreshToken();
  await storeRefreshToken(user.id, refreshToken);
  await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

  const res = json({
    ok:   true,
    data: {
      status:       'authenticated',
      access_token: accessToken,
      user: {
        id:     user.id,
        email:  user.email,
        role:   user.role,
        org_id: user.org_id,
      },
    },
  }, 200);

  // Refresh token in httpOnly cookie.
  res.cookies.set('ap_refresh_token', refreshToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/api/auth',
    maxAge:   60 * 60 * 24 * 7,
  });

  return res;
}

function json(body: object, status: number) {
  return NextResponse.json(body, { status });
}
