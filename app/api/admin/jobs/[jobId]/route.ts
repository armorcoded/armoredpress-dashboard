export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { withAuth } from '@/lib/auth/middleware';
import type { AuthedRequest } from '@/lib/auth/middleware';
import type { ProvisioningJob } from '@/types';

type Params = { jobId: string };

export const GET = withAuth<Params>(async (
  req: AuthedRequest,
  ctx: { params: Promise<Params> },
) => {
  const { jobId } = await ctx.params;

  const { rows } = await query<ProvisioningJob>(
    `SELECT pj.*, s.domain, s.org_id
     FROM provisioning_jobs pj
     JOIN sites s ON s.id = pj.site_id
     WHERE pj.id = $1 LIMIT 1`,
    [jobId],
  );

  const job = rows[0];
  if (!job) {
    return NextResponse.json(
      { ok: false, error: 'Job not found.', code: 'NOT_FOUND' },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, data: job });
}, ['internal_admin']);
