import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/auth/jwt';
import type { Role, SessionPayload } from '@/types';

export type AuthedRequest = NextRequest & { session: SessionPayload };

// Generic over the params shape so callers can use specific or broad types.
type RouteContext<P = Record<string, string>> = { params: Promise<P> };
type RouteHandler<P = Record<string, string>> = (
  req: AuthedRequest,
  ctx: RouteContext<P>,
) => Promise<NextResponse>;

export function withAuth<P = Record<string, string>>(
  handler: RouteHandler<P>,
  allowedRoles?: Role[],
) {
  return async (req: NextRequest, ctx: RouteContext<P>) => {
    const token = extractToken(req);

    if (!token) {
      return json({ ok: false, error: 'Unauthenticated.', code: 'NO_TOKEN' }, 401);
    }

    let session: SessionPayload;
    try {
      session = verifyAccessToken(token);
    } catch {
      return json({ ok: false, error: 'Invalid or expired token.', code: 'INVALID_TOKEN' }, 401);
    }

    if (allowedRoles && !allowedRoles.includes(session.role)) {
      return json({ ok: false, error: 'Insufficient permissions.', code: 'FORBIDDEN' }, 403);
    }

    (req as AuthedRequest).session = session;
    return handler(req as AuthedRequest, ctx);
  };
}

export function assertOrgAccess(session: SessionPayload, orgId: string): boolean {
  if (session.role === 'internal_admin') return true;
  return session.org_id === orgId;
}

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return req.cookies.get('ap_access_token')?.value ?? null;
}

function json(body: object, status: number) {
  return NextResponse.json(body, { status });
}
