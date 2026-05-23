'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ClipboardList, CheckCircle, XCircle, Clock,
  Loader2, RotateCcw, ChevronLeft, ChevronRight,
  RefreshCw, ExternalLink, AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/shell';
import { Card, Badge, Alert, Spinner } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';
import type { StepLogEntry } from '@/types';

interface Job {
  id:                  string;
  status:              'queued' | 'running' | 'complete' | 'failed' | 'rolled_back';
  current_step:        string | null;
  steps_log:           StepLogEntry[];
  error:               string | null;
  started_at:          string | null;
  completed_at:        string | null;
  created_at:          string;
  domain:              string;
  plan_tier:           'core' | 'secure' | 'compliance';
  site_id:             string;
  org_name:            string;
  triggered_by_email:  string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, {
  icon:    React.ElementType;
  color:   string;
  badge:   'green' | 'blue' | 'red' | 'amber' | 'gray';
  label:   string;
}> = {
  complete:    { icon: CheckCircle,   color: 'text-green-500',  badge: 'green', label: 'Complete'    },
  running:     { icon: Loader2,       color: 'text-brand-500',  badge: 'blue',  label: 'Running'     },
  queued:      { icon: Clock,         color: 'text-slate-400',  badge: 'gray',  label: 'Queued'      },
  failed:      { icon: XCircle,       color: 'text-red-500',    badge: 'red',   label: 'Failed'      },
  rolled_back: { icon: RotateCcw,     color: 'text-yellow-500', badge: 'amber', label: 'Rolled back' },
};

const STEP_LABELS: Record<string, string> = {
  validate_inputs:           'Validate inputs',
  validate_cloudflare_token: 'Validate Cloudflare token',
  runcloud_create_app:       'Create RunCloud app',
  runcloud_hardening:        'Apply hardening',
  cloudflare_baseline:       'Cloudflare baseline',
  ssl_validate:              'SSL certificate',
  wordpress_deploy:          'Deploy WordPress',
  wordpress_plugins:         'Install plugins',
  enable_backups:            'Enable backups',
  mark_active:               'Mark active',
};

const TOTAL_STEPS = Object.keys(STEP_LABELS).length;

function stepProgress(log: StepLogEntry[]): number {
  const completed = new Set(
    log.filter(e => e.status === 'complete').map(e => e.step),
  ).size;
  return Math.round((completed / TOTAL_STEPS) * 100);
}

function duration(start: string | null, end: string | null): string {
  if (!start) return '—';
  const ms   = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60)  return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60)  return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const [jobs,       setJobs]       = useState<Job[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expanded,   setExpanded]   = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (statusFilter) params.set('status', statusFilter);
      const res  = await fetch(`/api/admin/jobs?${params}`);
      const data = await res.json();
      if (!data.ok) { setError(data.error); return; }
      setJobs(data.data.jobs);
      setTotal(data.data.total);
      setPage(data.data.page);
      setTotalPages(data.data.total_pages);
    } catch { setError('Failed to load jobs.'); }
    finally   { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(1); }, [load]);

  // Auto-refresh if any job is running or queued.
  useEffect(() => {
    const interval = setInterval(() => {
      const hasLive = jobs.some(j => j.status === 'running' || j.status === 'queued');
      if (hasLive) load(page);
    }, 5_000);
    return () => clearInterval(interval);
  }, [jobs, page, load]);

  return (
    <div>
      <PageHeader
        title="Provisioning jobs"
        description="All site provisioning runs — history, status and step logs"
        action={
          <Link href="/sites/new">
            <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              + New site
            </button>
          </Link>
        }
      />

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-5">

        {error && <Alert variant="error">{error}</Alert>}

        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {loading ? 'Loading…' : `${total.toLocaleString()} jobs`}
          </p>
          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="text-xs h-8 w-36"
            >
              <option value="">All statuses</option>
              <option value="running">Running</option>
              <option value="queued">Queued</option>
              <option value="complete">Complete</option>
              <option value="failed">Failed</option>
              <option value="rolled_back">Rolled back</option>
            </Select>
            <button
              onClick={() => load(page)}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Jobs list ── */}
        <Card>
          {loading && jobs.length === 0 ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : jobs.length === 0 ? (
            <div className="py-16 text-center">
              <ClipboardList size={32} className="mx-auto text-slate-200 mb-3" />
              <p className="text-sm text-slate-400">No provisioning jobs yet.</p>
              <Link href="/sites/new" className="mt-2 inline-block text-sm text-brand-600 hover:text-brand-700">
                Provision a site →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {jobs.map(job => {
                const cfg      = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.queued;
                const Icon     = cfg.icon;
                const isExp    = expanded === job.id;
                const progress = stepProgress(job.steps_log ?? []);

                return (
                  <div key={job.id}>
                    {/* ── Job row ── */}
                    <div
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => setExpanded(isExp ? null : job.id)}
                    >
                      {/* Status icon */}
                      <Icon
                        size={16}
                        className={cn(
                          cfg.color,
                          job.status === 'running' && 'animate-spin',
                        )}
                      />

                      {/* Domain + org */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {job.domain}
                          </p>
                          <span className="text-xs text-slate-400">{job.org_name}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {job.status === 'running' && job.current_step
                            ? STEP_LABELS[job.current_step] ?? job.current_step
                            : job.status === 'failed' && job.error
                            ? <span className="text-red-500">{job.error}</span>
                            : formatDate(job.created_at)
                          }
                        </p>
                      </div>

                      {/* Progress bar — running jobs only */}
                      {job.status === 'running' && (
                        <div className="w-24 flex-shrink-0">
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand-500 rounded-full transition-all duration-500"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5 text-right">{progress}%</p>
                        </div>
                      )}

                      {/* Duration */}
                      <div className="text-xs text-slate-400 flex-shrink-0 w-16 text-right">
                        {duration(job.started_at, job.completed_at)}
                      </div>

                      {/* Status badge */}
                      <Badge variant={cfg.badge}>{cfg.label}</Badge>

                      {/* Live view link for running/failed */}
                      {(job.status === 'running' || job.status === 'failed') && (
                        <Link
                          href={`/jobs/${job.id}`}
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 flex-shrink-0"
                        >
                          <ExternalLink size={11} />
                          {job.status === 'running' ? 'Live' : 'Details'}
                        </Link>
                      )}
                    </div>

                    {/* ── Expanded step log ── */}
                    {isExp && (
                      <div className="bg-slate-50 border-t border-slate-100 px-5 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-medium text-slate-600">
                            Step log · {job.triggered_by_email ?? 'System'}
                          </p>
                          <Link
                            href={`/jobs/${job.id}`}
                            className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1"
                          >
                            Full view <ExternalLink size={10} />
                          </Link>
                        </div>

                        {!job.steps_log || job.steps_log.length === 0 ? (
                          <p className="text-xs text-slate-400">No steps logged yet.</p>
                        ) : (
                          <div className="space-y-1 font-mono text-xs">
                            {job.steps_log.map((entry, i) => (
                              <div key={i} className="flex items-start gap-3">
                                <span className="text-slate-400 flex-shrink-0 w-16 text-right">
                                  {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                                <span className={cn(
                                  'flex-shrink-0 w-14',
                                  entry.status === 'complete' && 'text-green-600',
                                  entry.status === 'failed'   && 'text-red-600',
                                  entry.status === 'started'  && 'text-brand-600',
                                )}>
                                  [{entry.status}]
                                </span>
                                <span className="text-slate-600 flex-1 truncate">
                                  {STEP_LABELS[entry.step] ?? entry.step}
                                  {entry.detail && <span className="text-slate-400"> — {entry.detail}</span>}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {job.error && (
                          <div className="mt-3 flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                            <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                            {job.error}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                Page {page} of {totalPages} · {total.toLocaleString()} total
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => load(page - 1)}
                  disabled={page <= 1 || loading}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={13} /> Previous
                </button>
                <button
                  onClick={() => load(page + 1)}
                  disabled={page >= totalPages || loading}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </Card>

      </div>
    </div>
  );
}
