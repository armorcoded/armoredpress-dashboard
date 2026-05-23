export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query, transaction } from '@/lib/db/pool';
import type { QueryFn } from '@/lib/db/pool';
import { withAuth } from '@/lib/auth/middleware';
import { encryptToken } from '@/lib/cloudflare/encrypt';
import { validateToken } from '@/lib/cloudflare/client';
import { enqueueProvisioningJob } from '@/lib/queue/provisioning';
import type { AuthedRequest } from '@/lib/auth/middleware';

// ── GET /api/admin/sites — list all sites ─────────────────────────────────

export const GET = withAuth(async (req: AuthedRequest) => {
  const isAdmin = req.session.role === 'internal_admin';

  const { rows } = await query(`
    SELECT
      s.id,
      s.domain,
      s.status,
      s.plan_tier,
      s.is_migration,
      s.origin_ip,
      s.runcloud_app_id,
      s.cloudflare_zone_id,
      s.created_at,
      s.updated_at,
      o.id   AS org_id,
      o.name AS org_name,
      pj.status       AS job_status,
      pj.current_step AS job_step,
      pj.id           AS job_id
    FROM sites s
    JOIN orgs o ON o.id = s.org_id
    LEFT JOIN LATERAL (
      SELECT id, status, current_step
      FROM provisioning_jobs
      WHERE site_id = s.id
      ORDER BY created_at DESC
      LIMIT 1
    ) pj ON true
    ${isAdmin ? '' : 'WHERE s.org_id = $1'}
    ORDER BY s.created_at DESC
  `, isAdmin ? [] : [req.session.org_id]);

  return NextResponse.json({ ok: true, data: rows });
}, ['internal_admin', 'org_admin', 'org_user']);

const CreateSiteSchema = z.object({
  org_id:            z.string().uuid(),
  domain:            z.string().min(3).max(253),
  plan_tier:         z.enum(['core', 'secure', 'compliance']),
  runcloud_server_id: z.string(),
  origin_ip:         z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'Must be a valid IPv4 address'),
  cf_token:          z.string().min(10),   // raw BYO token — encrypted before storage
  is_migration:      z.boolean().default(false),
});

export const POST = withAuth(async (req: AuthedRequest) => {
  let body: z.infer<typeof CreateSiteSchema>;
  try {
    body = CreateSiteSchema.parse(await req.json());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Validation failed';
    return json({ ok: false, error: msg, code: 'VALIDATION' }, 400);
  }

  // ── Verify org exists ─────────────────────────────────────────────────────
  const { rows: orgs } = await query(
    'SELECT id FROM orgs WHERE id = $1 LIMIT 1',
    [body.org_id],
  );
  if (!orgs.length) {
    return json({ ok: false, error: 'Organisation not found.', code: 'NOT_FOUND' }, 404);
  }

  // ── Check domain not already taken ───────────────────────────────────────
  const { rows: existing } = await query(
    'SELECT id FROM sites WHERE domain = $1 LIMIT 1',
    [body.domain.toLowerCase()],
  );
  if (existing.length) {
    return json({ ok: false, error: 'Domain already exists.', code: 'CONFLICT' }, 409);
  }

  // ── Live Cloudflare token validation ─────────────────────────────────────
  const cfCheck = await validateToken(body.cf_token, body.domain);
  if (!cfCheck.valid) {
    return json({
      ok: false,
      error: `Cloudflare token invalid: ${cfCheck.error}`,
      code: 'CF_TOKEN_INVALID',
    }, 422);
  }

  // ── Encrypt CF token before storage ──────────────────────────────────────
  const encryptedToken = encryptToken(body.cf_token);

  // ── Create site + provisioning job in one transaction ────────────────────
  const { siteId, jobId } = await transaction(async (q) => {
    const { rows: siteRows } = await q(
      `INSERT INTO sites
         (org_id, domain, plan_tier, status, runcloud_server_id, origin_ip,
          cloudflare_zone_id, cloudflare_token_enc, is_migration, created_by)
       VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        body.org_id,
        body.domain.toLowerCase(),
        body.plan_tier,
        body.runcloud_server_id,
        body.origin_ip,
        cfCheck.zoneId,
        encryptedToken,
        body.is_migration,
        req.session.sub,
      ],
    );
    const siteId = siteRows[0].id as string;

    const { rows: jobRows } = await q(
      `INSERT INTO provisioning_jobs (site_id, triggered_by, status)
       VALUES ($1,$2,'queued')
       RETURNING id`,
      [siteId, req.session.sub],
    );
    const jobId = jobRows[0].id as string;

    return { siteId, jobId };
  });

  // ── Enqueue the BullMQ job ────────────────────────────────────────────────
  await enqueueProvisioningJob(jobId, siteId);

  // ── Audit log ─────────────────────────────────────────────────────────────
  await query(
    `INSERT INTO audit_log (user_id, org_id, site_id, action, meta)
     VALUES ($1,$2,$3,'site_provision_queued',$4)`,
    [
      req.session.sub,
      body.org_id,
      siteId,
      JSON.stringify({ domain: body.domain, plan_tier: body.plan_tier, job_id: jobId }),
    ],
  );

  return json({
    ok: true,
    data: { site_id: siteId, job_id: jobId, status: 'queued' },
  }, 201);
}, ['internal_admin']);

function json(body: object, status: number) {
  return NextResponse.json(body, { status });
}
