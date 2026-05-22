import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { query } from '@/lib/db/pool';
import { decryptToken } from '@/lib/cloudflare/encrypt';
import { logStep, failJob, completeJob } from '@/lib/provisioning/context';
import { rollback } from '@/lib/provisioning/rollback';
import {
  stepValidateInputs,
  stepValidateCloudflareToken,
  stepRunCloudCreateApp,
  stepRunCloudHardening,
  stepCloudflareBaseline,
} from '@/lib/provisioning/steps/steps-1-5';
import {
  stepSSLValidate,
  stepWordPressDeploy,
  stepWordPressPlugins,
  stepEnableBackups,
  stepMarkActive,
} from '@/lib/provisioning/steps/steps-6-10';
import type { StepContext } from '@/lib/provisioning/context';
import type { Site, PlanTier } from '@/types';

// ── Redis connection (lazy) ───────────────────────────────────────────────────

let _connection: IORedis | null = null;
let _queue: Queue | null = null;

function getConnection(): IORedis {
  if (_connection) return _connection;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL must be set');
  _connection = new IORedis(url, { maxRetriesPerRequest: null });
  return _connection;
}

function getQueue(): Queue {
  if (_queue) return _queue;
  _queue = new Queue('provisioning', {
    connection: getConnection(),
    defaultJobOptions: {
      attempts:    3,
      backoff:     { type: 'exponential', delay: 10_000 },
      removeOnComplete: { count: 100 },
      removeOnFail:     { count: 200 },
    },
  });
  return _queue;
}

// Keep named export for backward compat — resolves lazily on access.
export const provisioningQueue = new Proxy({} as Queue, {
  get: (_t, prop) => getQueue()[prop as keyof Queue],
});

export interface ProvisioningJobData {
  jobId:  string;
  siteId: string;
}

/**
 * Enqueue a new provisioning job.
 * Returns the BullMQ job ID.
 */
export async function enqueueProvisioningJob(
  jobId: string,
  siteId: string,
): Promise<string> {
  const job = await getQueue().add(
    'provision-site',
    { jobId, siteId } satisfies ProvisioningJobData,
    { jobId },
  );
  return job.id!;
}

// ── Worker ────────────────────────────────────────────────────────────────────

const STEPS: Array<{
  name: string;
  fn: (ctx: StepContext) => Promise<void>;
}> = [
  { name: 'validate_inputs',            fn: stepValidateInputs           },
  { name: 'validate_cloudflare_token',  fn: stepValidateCloudflareToken  },
  { name: 'runcloud_create_app',        fn: stepRunCloudCreateApp         },
  { name: 'runcloud_hardening',         fn: stepRunCloudHardening         },
  { name: 'cloudflare_baseline',        fn: stepCloudflareBaseline        },
  { name: 'ssl_validate',               fn: stepSSLValidate               },
  { name: 'wordpress_deploy',           fn: stepWordPressDeploy           },
  { name: 'wordpress_plugins',          fn: stepWordPressPlugins          },
  { name: 'enable_backups',             fn: stepEnableBackups             },
  { name: 'mark_active',               fn: stepMarkActive                },
];

export function startProvisioningWorker(): Worker {
  const worker = new Worker<ProvisioningJobData>(
    'provisioning',
    async (job: Job<ProvisioningJobData>) => {      const { jobId, siteId } = job.data;
      console.log(`[provisioning] Starting job ${jobId} for site ${siteId}`);

      // ── Load site record ────────────────────────────────────────────────
      const { rows } = await query<Site & { cloudflare_token_enc: string; runcloud_server_id: string; origin_ip: string }>(
        `SELECT s.*, s.cloudflare_token_enc, s.runcloud_server_id, s.origin_ip
         FROM sites s WHERE s.id = $1 LIMIT 1`,
        [siteId],
      );
      const site = rows[0];
      if (!site) throw new Error(`Site ${siteId} not found`);

      // ── Mark job running ────────────────────────────────────────────────
      await query(
        `UPDATE provisioning_jobs
         SET status = 'running', started_at = NOW()
         WHERE id = $1`,
        [jobId],
      );

      // ── Build step context ──────────────────────────────────────────────
      const ctx: StepContext = {
        jobId,
        siteId,
        domain:       site.domain,
        planTier:     site.plan_tier as PlanTier,
        isMigration:  site.is_migration,
        originIp:     site.origin_ip,
        rcServerId:   Number(site.runcloud_server_id),
        rcAppId:      null,
        rcSystemUser: null,
        rcDbName:     null,
        rcDbUser:     null,
        rcDbPassword: null,
        cfZoneId:     null,
        cfToken:      decryptToken(site.cloudflare_token_enc),
      };

      // ── Execute steps sequentially ──────────────────────────────────────
      let failedStep = '';
      try {
        for (const step of STEPS) {
          await step.fn(ctx);
          // Report progress to BullMQ (visible in Bull Board UI).
          const pct = Math.round((STEPS.indexOf(step) + 1) / STEPS.length * 100);
          await job.updateProgress(pct);
        }

        await completeJob(jobId);
        console.log(`[provisioning] Job ${jobId} complete ✓`);

      } catch (err) {
        failedStep = (err as Error & { step?: string }).step ?? 'unknown';
        const message = err instanceof Error ? err.message : String(err);

        console.error(`[provisioning] Job ${jobId} failed at ${failedStep}:`, message);
        await failJob(jobId, failedStep, message);

        // Rollback what we can.
        await rollback(ctx, failedStep).catch(rb =>
          console.error('[provisioning] Rollback error:', rb),
        );

        // Re-throw so BullMQ records the failure and retries if attempts remain.
        throw err;
      } finally {
        // Always scrub the plaintext CF token from memory.
        (ctx as StepContext).cfToken = '[cleared]';
      }
    },
    {
      connection: getConnection(),
      concurrency: 3,
      lockDuration: 10 * 60 * 1000,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[provisioning] BullMQ job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.log(`[provisioning] BullMQ job ${job.id} completed`);
  });

  return worker;
}
