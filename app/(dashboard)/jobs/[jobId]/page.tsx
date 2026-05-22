'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle, XCircle, Clock, Loader2, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/shell';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import type { StepLogEntry, JobStatus } from '@/types';

interface JobState {
  status:       JobStatus;
  current_step: string | null;
  steps_log:    StepLogEntry[];
  error:        string | null;
  domain:       string;
}

const STEP_LABELS: Record<string, string> = {
  validate_inputs:           'Validate inputs',
  validate_cloudflare_token: 'Validate Cloudflare token',
  runcloud_create_app:       'Create RunCloud web app',
  runcloud_hardening:        'Apply server hardening',
  cloudflare_baseline:       'Apply Cloudflare baseline',
  ssl_validate:              'Issue & validate SSL',
  wordpress_deploy:          'Deploy WordPress',
  wordpress_plugins:         'Install security plugins',
  enable_backups:            'Enable backups',
  mark_active:               'Mark site active',
};

const ALL_STEPS = Object.keys(STEP_LABELS);

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job,      setJob]      = useState<JobState | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [terminal, setTerminal] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/admin/jobs/${jobId}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setJob(d.data);
          setTerminal(['complete', 'failed', 'rolled_back'].includes(d.data.status));
        }
        setLoading(false);
      });
  }, [jobId]);

  // ── SSE stream ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (terminal) return;

    const es = new EventSource(`/api/admin/jobs/${jobId}/stream`);

    es.addEventListener('update', (e) => {
      const data = JSON.parse(e.data);
      setJob(prev => prev ? { ...prev, ...data } : data);
    });

    es.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      setJob(prev => prev ? { ...prev, ...data } : data);
      setTerminal(true);
      es.close();
    });

    es.addEventListener('error', () => es.close());

    return () => es.close();
  }, [jobId, terminal]);

  // ── Auto-scroll log ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [job?.steps_log]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-brand-500" />
      </div>
    );
  }

  if (!job) {
    return <div className="p-8 text-center text-slate-500">Job not found.</div>;
  }

  const completedSteps = new Set(
    job.steps_log.filter(e => e.status === 'complete').map(e => e.step),
  );
  const failedSteps = new Set(
    job.steps_log.filter(e => e.status === 'failed').map(e => e.step),
  );

  const statusVariant: Record<string, 'green' | 'blue' | 'red' | 'amber' | 'gray'> = {
    complete:    'green',
    running:     'blue',
    failed:      'red',
    rolled_back: 'amber',
    queued:      'gray',
  };

  return (
    <div>
      <PageHeader
        title={job.domain ?? 'Provisioning job'}
        description={`Job ID: ${jobId}`}
      />

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Status banner */}
        <div className="ap-card px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {job.status === 'running' && <Loader2 size={18} className="animate-spin text-brand-500" />}
            {job.status === 'complete' && <CheckCircle size={18} className="text-green-500" />}
            {job.status === 'failed'   && <XCircle    size={18} className="text-red-500" />}
            {job.status === 'queued'   && <Clock      size={18} className="text-slate-400" />}
            <div>
              <p className="text-sm font-medium text-slate-800">
                {job.status === 'running'  && `Running — ${STEP_LABELS[job.current_step ?? ''] ?? job.current_step}`}
                {job.status === 'complete' && 'Site is live!'}
                {job.status === 'failed'   && 'Provisioning failed'}
                {job.status === 'queued'   && 'Queued — starting soon'}
                {job.status === 'rolled_back' && 'Rolled back'}
              </p>
              {job.error && (
                <p className="text-xs text-red-600 mt-0.5">{job.error}</p>
              )}
            </div>
          </div>
          <Badge variant={statusVariant[job.status] ?? 'gray'}>{job.status}</Badge>
        </div>

        {/* Step progress */}
        <div className="ap-card divide-y divide-slate-100">
          {ALL_STEPS.map((stepKey, idx) => {
            const done    = completedSteps.has(stepKey);
            const failed  = failedSteps.has(stepKey);
            const active  = job.current_step === stepKey && job.status === 'running';
            const pending = !done && !failed && !active;

            // Find log entry for this step
            const logEntry = job.steps_log.findLast(e => e.step === stepKey);

            return (
              <div key={stepKey} className="flex items-start gap-4 px-5 py-3.5">
                {/* Step indicator */}
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-semibold',
                  done    && 'bg-green-100 text-green-600',
                  failed  && 'bg-red-100 text-red-600',
                  active  && 'bg-brand-100 text-brand-600',
                  pending && 'bg-slate-100 text-slate-400',
                )}>
                  {done   && <CheckCircle size={13} />}
                  {failed && <XCircle     size={13} />}
                  {active && <Loader2     size={13} className="animate-spin" />}
                  {pending && <span>{idx + 1}</span>}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-sm',
                    done    && 'text-slate-700',
                    failed  && 'text-red-700 font-medium',
                    active  && 'text-brand-700 font-medium',
                    pending && 'text-slate-400',
                  )}>
                    {STEP_LABELS[stepKey] ?? stepKey}
                  </p>
                  {logEntry?.detail && (
                    <p className="text-xs text-slate-400 mt-0.5 font-mono truncate">
                      {logEntry.detail}
                    </p>
                  )}
                </div>

                {logEntry && (
                  <span className="text-xs text-slate-400 flex-shrink-0">
                    {new Date(logEntry.ts).toLocaleTimeString()}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Raw event log */}
        {job.steps_log.length > 0 && (
          <div className="ap-card">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-700">Event log</h3>
              <AlertCircle size={14} className="text-slate-300" />
            </div>
            <div
              ref={logRef}
              className="px-5 py-3 font-mono text-xs text-slate-600 space-y-1 max-h-48 overflow-y-auto ap-scroll bg-slate-50 rounded-b-xl"
            >
              {job.steps_log.map((entry, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-slate-400 flex-shrink-0">
                    {new Date(entry.ts).toLocaleTimeString()}
                  </span>
                  <span className={cn(
                    entry.status === 'complete' && 'text-green-700',
                    entry.status === 'failed'   && 'text-red-700',
                    entry.status === 'started'  && 'text-brand-700',
                  )}>
                    [{entry.status.toUpperCase()}] {entry.step}
                    {entry.detail ? ` — ${entry.detail}` : ''}
                  </span>
                </div>
              ))}
              {job.status === 'running' && (
                <div className="flex gap-2 text-slate-400">
                  <Loader2 size={11} className="animate-spin mt-px" />
                  <span>Waiting for next step…</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
