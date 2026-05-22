import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { rotateRefreshToken, signAccessToken, revokeAllRefreshTokens } from '@/lib/auth/jwt';
import { verifyAccessToken } from '@/lib/auth/jwt';
import type { User } from '@/types';

// Explicitly use Node.js runtime — this route uses crypto/pg which
// are not available in the Edge Runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── POST /api/auth/refresh ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('ap_refresh_token')?.value;

  if (!refreshToken) {
    return json({ ok: false, error: 'No refresh token.', code: 'NO_TOKEN' }, 401);
  }

  // Get user_id from the (possibly expired) access token if present.
  let userId: string | null = null;
  const accessToken = req.cookies.get('ap_access_token')?.value
    ?? req.headers.get('authorization')?.slice(7);

  if (accessToken) {
    try {
      const payload = verifyAccessToken(accessToken);
      userId = payload.sub;
    } catch {
      // Access token expired — that's fine, refresh token handles it.
    }
  }

  // We need the user_id to rotate — require it in the body as fallback.
  if (!userId) {
    const body = await req.json().catch(() => ({}));
    userId = body.user_id ?? null;
  }

  if (!userId) {
    return json({ ok: false, error: 'Cannot identify user.', code: 'MISSING_USER_ID' }, 400);
  }

  const newRefreshToken = await rotateRefreshToken(refreshToken, userId);

  if (!newRefreshToken) {
    return json({ ok: false, error: 'Invalid or expired refresh token.', code: 'INVALID_REFRESH' }, 401);
  }

  // Load user to re-sign access token with latest data.
  const { rows } = await query<User>(
    `SELECT * FROM users WHERE id = $1 AND is_active = TRUE LIMIT 1`,
    [userId],
  );
  const user = rows[0];
  if (!user) {
    return json({ ok: false, error: 'User not found.', code: 'NOT_FOUND' }, 404);
  }

  const newAccessToken = signAccessToken(user);

  const res = json({
    ok:   true,
    data: { access_token: newAccessToken },
  }, 200);

  res.cookies.set('ap_refresh_token', newRefreshToken, {
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
