/**
 * Server-side JWT verification using jose.
 *
 * Use this in Server Components and Route Handlers instead of
 * lib/auth/jwt.ts (which uses Node.js crypto and cannot run in
 * the Edge Runtime or be statically analysed by Turbopack when
 * imported from Server Components).
 */
import { jwtVerify, type JWTPayload } from 'jose';
import type { SessionPayload } from '@/types';

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const secret = new TextEncoder().encode(
      process.env.JWT_ACCESS_SECRET ?? '',
    );
    const { payload } = await jwtVerify(token, secret);
    return payload as JWTPayload & SessionPayload;
  } catch {
    return null;
  }
}
