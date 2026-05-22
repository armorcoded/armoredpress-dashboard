import { query } from '@/lib/db/pool';
import type { StepLogEntry } from '@/types';

/**
 * Context passed to every provisioning step.
 * Steps read from and write to this object — it's the single source of truth
 * for state within a provisioning job run.
 */
export interface StepContext {
  jobId:        string;
  siteId:       string;
  domain:       string;
  planTier:     'core' | 'secure' | 'compliance';
  isMigration:  boolean;
  originIp:     string;

  // Populated progressively as steps succeed.
  rcServerId:   number;
  rcAppId:      number | null;
  rcSystemUser: string | null;
  rcDbName:     string | null;
  rcDbUser:     string | null;
  rcDbPassword: string | null;
  cfZoneId:     string | null;
  cfToken:      string;            // decrypted — never persisted
}

/**
 * Append a structured entry to provisioning_jobs.steps_log.
 * Called by each step on start, complete, and failure.
 */
export async function logStep(
  jobId: string,
  entry: StepLogEntry,
): Promise<void> {
  await query(
    `UPDATE provisioning_jobs
     SET steps_log    = steps_log || $1::jsonb,
         current_step = $2,
         updated_at   = NOW()
     WHERE id = $3`,
    [JSON.stringify([entry]), entry.step, jobId],
  );
}

/**
 * Mark a job as failed with an error message and final step.
 */
export async function failJob(
  jobId: string,
  step: string,
  error: string,
): Promise<void> {
  await query(
    `UPDATE provisioning_jobs
     SET status       = 'failed',
         current_step = $1,
         error        = $2,
         completed_at = NOW()
     WHERE id = $3`,
    [step, error, jobId],
  );
}

/**
 * Mark a job complete.
 */
export async function completeJob(jobId: string): Promise<void> {
  await query(
    `UPDATE provisioning_jobs
     SET status       = 'complete',
         current_step = 'done',
         completed_at = NOW()
     WHERE id = $1`,
    [jobId],
  );
}
