import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '@/lib/db/pool';
import type { SessionPayload, User } from '@/types';

const ACCESS_TTL    = '15m';
const REFRESH_TTL_S = 60 * 60 * 24 * 7;

// Secrets are read lazily at call time — not at module load time —
// so Next.js can import this file during the build phase without
// JWT_ACCESS_SECRET / JWT_REFRESH_SECRET being present.
function getAccessSecret(): string {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s) throw new Error('JWT_ACCESS_SECRET must be set');
  return s;
}

function getRefreshSecret(): string {
  const s = process.env.JWT_REFRESH_SECRET;
  if (!s) throw new Error('JWT_REFRESH_SECRET must be set');
  return s;
}

// ── Access token ──────────────────────────────────────────────────────────────

export function signAccessToken(user: Pick<User, 'id' | 'email' | 'role' | 'org_id'>): string {
  return jwt.sign(
    {
      sub:    user.id,
      email:  user.email,
      role:   user.role,
      org_id: user.org_id,
    },
    getAccessSecret(),
    { expiresIn: ACCESS_TTL, algorithm: 'HS256' },
  );
}

export function verifyAccessToken(token: string): SessionPayload {
  return jwt.verify(token, getAccessSecret()) as SessionPayload;
}

// ── Refresh token ─────────────────────────────────────────────────────────────

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export async function storeRefreshToken(userId: string, token: string): Promise<void> {
  const hash      = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_S * 1000);

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hash, expiresAt],
  );
}

export async function rotateRefreshToken(
  oldToken: string,
  userId: string,
): Promise<string | null> {
  const oldHash = crypto.createHash('sha256').update(oldToken).digest('hex');

  const { rowCount } = await query(
    `DELETE FROM refresh_tokens
     WHERE token_hash = $1 AND user_id = $2 AND expires_at > NOW()`,
    [oldHash, userId],
  );

  if (!rowCount || rowCount === 0) return null;

  const newToken = generateRefreshToken();
  await storeRefreshToken(userId, newToken);
  return newToken;
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}
