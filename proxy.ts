/**
 * Next.js 16 proxy (formerly middleware).
 * Export must be named "proxy" (not "middleware") in Next.js 16.
 * Uses jose for JWT verification — fully Edge Runtime compatible.
 */
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, type JWTPayload } from 'jose';

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/verify-totp',
  '/api/auth/refresh',
  '/api/health',
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icons')
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token =
    req.cookies.get('ap_access_token')?.value ??
    req.headers.get('authorization')?.slice(7);

  if (!token) {
    return unauthenticated(req);
  }

  try {
    const secret = new TextEncoder().encode(
      process.env.JWT_ACCESS_SECRET ?? '',
    );
    const { payload } = await jwtVerify(token, secret) as {
      payload: JWTPayload & { role?: string };
    };

    if (payload.role?.startsWith('pending_2fa:')) {
      if (!pathname.startsWith('/login/verify-totp')) {
        return NextResponse.redirect(new URL('/login/verify-totp', req.url));
      }
    }

    return NextResponse.next();
  } catch {
    return unauthenticated(req);
  }
}

function unauthenticated(req: NextRequest): NextResponse {
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { ok: false, error: 'Unauthenticated.', code: 'NO_TOKEN' },
      { status: 401 },
    );
  }
  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('from', req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
