export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { revokeAllRefreshTokens } from '@/lib/auth/jwt';
import type { AuthedRequest } from '@/lib/auth/middleware';

export const POST = withAuth(async (req: AuthedRequest) => {
  await revokeAllRefreshTokens(req.session.sub);

  const res = NextResponse.json({ ok: true, data: { message: 'Logged out.' } });

  // Clear both cookies.
  res.cookies.set('ap_refresh_token', '', { maxAge: 0, path: '/api/auth' });
  res.cookies.set('ap_access_token',  '', { maxAge: 0, path: '/' });

  return res;
});
