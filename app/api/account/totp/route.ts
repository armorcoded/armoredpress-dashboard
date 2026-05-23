export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { z } from 'zod';
import { query } from '@/lib/db/pool';
import { withAuth } from '@/lib/auth/middleware';
import type { AuthedRequest } from '@/lib/auth/middleware';
import type { User } from '@/types';

const APP_NAME = 'ArmoredPress';

// ── POST /api/account/totp — three actions via `action` field ─────────────
//
//  action: "setup"   → generate secret + QR code URI (not yet active)
//  action: "enable"  → verify code and activate 2FA
//  action: "disable" → verify code and deactivate 2FA

const Schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setup') }),
  z.object({ action: z.literal('enable'),  code: z.string().length(6).regex(/^\d+$/) }),
  z.object({ action: z.literal('disable'), code: z.string().length(6).regex(/^\d+$/) }),
]);

export const POST = withAuth(async (req: AuthedRequest) => {
  let body: z.infer<typeof Schema>;
  try {
    body = Schema.parse(await req.json());
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

  // ── Setup: generate a new TOTP secret ────────────────────────────────────
  if (body.action === 'setup') {
    const secret = speakeasy.generateSecret({
      name:   `${APP_NAME} (${user.email})`,
      issuer: APP_NAME,
      length: 20,
    });

    // Store the pending secret (not yet verified/active).
    await query(
      `UPDATE users SET totp_secret = $1, totp_verified = FALSE, updated_at = NOW()
       WHERE id = $2`,
      [secret.base32, user.id],
    );

    // Generate QR code as a data URI.
    const otpauthUrl = secret.otpauth_url!;
    const qrDataUrl  = await QRCode.toDataURL(otpauthUrl);

    return NextResponse.json({
      ok: true,
      data: {
        secret:     secret.base32,
        qr_url:     qrDataUrl,
        otpauth_url: otpauthUrl,
      },
    });
  }

  // ── Enable: verify code then activate ────────────────────────────────────
  if (body.action === 'enable') {
    if (!user.totp_secret) {
      return NextResponse.json(
        { ok: false, error: 'Run setup first to generate a secret.', code: 'NO_SECRET' },
        { status: 400 },
      );
    }

    const valid = speakeasy.totp.verify({
      secret:   user.totp_secret,
      encoding: 'base32',
      token:    body.code,
      window:   1,
    });

    if (!valid) {
      return NextResponse.json(
        { ok: false, error: 'Invalid code. Please check your authenticator app.', code: 'INVALID_TOTP' },
        { status: 400 },
      );
    }

    await query(
      `UPDATE users
       SET totp_enabled = TRUE, totp_verified = TRUE, updated_at = NOW()
       WHERE id = $1`,
      [user.id],
    );

    await query(
      `INSERT INTO audit_log (user_id, action, meta)
       VALUES ($1, '2fa_enabled', '{}')`,
      [user.id],
    );

    return NextResponse.json({ ok: true, data: { totp_enabled: true } });
  }

  // ── Disable: verify code then deactivate ─────────────────────────────────
  if (body.action === 'disable') {
    if (!user.totp_enabled || !user.totp_secret) {
      return NextResponse.json(
        { ok: false, error: '2FA is not currently enabled.', code: 'NOT_ENABLED' },
        { status: 400 },
      );
    }

    const valid = speakeasy.totp.verify({
      secret:   user.totp_secret,
      encoding: 'base32',
      token:    body.code,
      window:   1,
    });

    if (!valid) {
      return NextResponse.json(
        { ok: false, error: 'Invalid code.', code: 'INVALID_TOTP' },
        { status: 400 },
      );
    }

    await query(
      `UPDATE users
       SET totp_enabled = FALSE, totp_verified = FALSE,
           totp_secret = NULL, updated_at = NOW()
       WHERE id = $1`,
      [user.id],
    );

    await query(
      `INSERT INTO audit_log (user_id, action, meta)
       VALUES ($1, '2fa_disabled', '{}')`,
      [user.id],
    );

    return NextResponse.json({ ok: true, data: { totp_enabled: false } });
  }

  return NextResponse.json(
    { ok: false, error: 'Invalid action.', code: 'INVALID_ACTION' },
    { status: 400 },
  );
});
