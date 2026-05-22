import * as RC from '@/lib/runcloud/client';
import { query } from '@/lib/db/pool';
import { logStep } from '@/lib/provisioning/context';
import type { StepContext } from '@/lib/provisioning/context';

/**
 * Rollback as much of the provisioning as possible.
 * Called when any step throws. Best-effort — individual rollback
 * failures are logged but don't block the others.
 */
export async function rollback(ctx: StepContext, failedStep: string): Promise<void> {
  console.error(`[provisioning] Rolling back after failure at step: ${failedStep}`);

  const ops: Array<{ name: string; fn: () => Promise<void> }> = [];

  // Delete RunCloud app if it was created.
  if (ctx.rcAppId) {
    ops.push({
      name: 'delete_runcloud_app',
      fn:   () => RC.deleteWebApp(ctx.rcServerId, ctx.rcAppId!),
    });
  }

  // Cloudflare: we deliberately don't remove the customer's zone —
  // it belongs to them. We only remove rules we added.
  // (Zone removal would be disruptive if they use it for other things.)

  // Mark site as failed.
  ops.push({
    name: 'mark_site_failed',
    fn:   async () => {
      await query(
        `UPDATE sites SET status = 'failed', updated_at = NOW() WHERE id = $1`,
        [ctx.siteId],
      );
    },
  });

  for (const op of ops) {
    try {
      await op.fn();
      await logStep(ctx.jobId, {
        step:   `rollback:${op.name}`,
        status: 'complete',
        ts:     new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[rollback] ${op.name} failed:`, err);
      await logStep(ctx.jobId, {
        step:   `rollback:${op.name}`,
        status: 'failed',
        ts:     new Date().toISOString(),
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await query(
    `UPDATE provisioning_jobs
     SET status       = 'rolled_back',
         completed_at = NOW()
     WHERE id = $1`,
    [ctx.jobId],
  );
}
