export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { query } from '@/lib/db/pool';
import type { ProvisioningJob } from '@/types';

const POLL_INTERVAL_MS = 1_500;
const MAX_DURATION_MS  = 15 * 60 * 1000; // 15 min max stream

/**
 * GET /api/admin/jobs/[jobId]/stream
 *
 * Server-Sent Events stream of live provisioning job progress.
 * The UI connects here and receives step log updates as they happen.
 *
 * Events emitted:
 *   - "update" — job state snapshot (status, current_step, steps_log)
 *   - "complete" — job finished (success or failure)
 *   - "ping" — keepalive every 10s
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ jobId: string }> },
) {
  // Auth — SSE doesn't send custom headers, so token comes from cookie.
  const token = req.cookies.get('ap_access_token')?.value;
  if (!token) {
    return new Response('Unauthenticated.', { status: 401 });
  }
  try {
    const session = verifyAccessToken(token);
    if (session.role !== 'internal_admin') {
      return new Response('Forbidden.', { status: 403 });
    }
  } catch {
    return new Response('Invalid token.', { status: 401 });
  }

  const { jobId } = await ctx.params;

  const stream = new ReadableStream({
    async start(controller) {
      const encode = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(new TextEncoder().encode(payload));
      };

      const deadline  = Date.now() + MAX_DURATION_MS;
      let lastLogLen  = 0;
      let pingCounter = 0;

      while (Date.now() < deadline) {
        try {
          const { rows } = await query<ProvisioningJob>(
            `SELECT * FROM provisioning_jobs WHERE id = $1 LIMIT 1`,
            [jobId],
          );
          const job = rows[0];
          if (!job) {
            encode('error', { message: 'Job not found.' });
            controller.close();
            return;
          }

          const log = job.steps_log ?? [];

          // Only send if there's new log data.
          if (log.length > lastLogLen) {
            encode('update', {
              status:       job.status,
              current_step: job.current_step,
              steps_log:    log,
              error:        job.error,
            });
            lastLogLen = log.length;
          }

          // Keepalive ping every ~10s.
          if (pingCounter % Math.round(10_000 / POLL_INTERVAL_MS) === 0) {
            encode('ping', { ts: new Date().toISOString() });
          }
          pingCounter++;

          // Terminal states — close stream.
          if (['complete', 'failed', 'rolled_back'].includes(job.status)) {
            encode('complete', {
              status:    job.status,
              steps_log: log,
              error:     job.error,
            });
            controller.close();
            return;
          }

          await sleep(POLL_INTERVAL_MS);
        } catch (err) {
          console.error('[SSE] Stream error:', err);
          controller.close();
          return;
        }
      }

      // Timed out.
      encode('error', { message: 'Stream timeout — job may still be running.' });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx buffering for SSE
    },
  });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
