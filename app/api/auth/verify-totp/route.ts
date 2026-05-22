export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import speakeasy from 'speakeasy';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '@/lib/db/pool';
import { signAccessToken, generateRefreshToken, storeRefreshToken } from '@/lib/auth/jwt';
import type { User } from '@/types';

const Schema = z.object({
  partial_token: z.string(),
  code:          z.string().length(6).regex(/^\d+$/),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof Schema>;
  try {
    body = Schema.parse(await req.json());
  } catch {
    return json({ ok: false, error: 'Invalid request body.', code: 'VALIDATION' }, 400);
  }

  // ── Verify partial token ───────────────────────────────────────────────
  let payload: { sub: string; role: string };
  try {
    payload = jwt.verify(body.partial_token, process.env.JWT_ACCESS_SECRET!) as typeof payload;
  } catch {
    return json({ ok: false, error: 'Invalid or expired partial token.', code: 'INVALID_TOKEN' }, 401);
  }

  if (!payload.role?.startsWith('pending_2fa:')) {
    return json({ ok: false, error: 'Token is not a partial 2FA token.', code: 'INVALID_TOKEN' }, 401);
  }

  // ── Load user ──────────────────────────────────────────────────────────
  const { rows } = await query<User>(
    `SELECT * FROM users WHERE id = $1 AND is_active = TRUE LIMIT 1`,
    [payload.sub],
  );
  const user = rows[0];

  if (!user || !user.totp_secret) {
    return json({ ok: false, error: 'User not found.', code: 'NOT_FOUND' }, 404);
  }

  // ── Verify TOTP code ───────────────────────────────────────────────────
  const valid = speakeasy.totp.verify({
    secret:   user.totp_secret,
    encoding: 'base32',
    token:    body.code,
    window:   1, // allow 1 step drift (30s either side)
  });

  if (!valid) {
    return json({ ok: false, error: 'Invalid 2FA code.', code: 'INVALID_TOTP' }, 401);
  }

  // ── Issue full tokens ──────────────────────────────────────────────────
  const accessToken  = signAccessToken(user);
  const refreshToken = generateRefreshToken();
  await storeRefreshToken(user.id, refreshToken);
  await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

  const res = json({
    ok:   true,
    data: {
      access_token: accessToken,
      user: {
        id:     user.id,
        email:  user.email,
        role:   user.role,
        org_id: user.org_id,
      },
    },
  }, 200);

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
