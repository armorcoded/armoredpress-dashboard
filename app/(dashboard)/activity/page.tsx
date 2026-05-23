'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Clock, Filter, ChevronLeft, ChevronRight,
  LogIn, Globe, Building2, Users, Shield,
  AlertTriangle, RefreshCw, X,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/shell';
import { Card, CardHeader, CardTitle, Alert, Spinner } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';

interface LogEntry {
  id:          string;
  action:      string;
  meta:        Record<string, unknown>;
  ip_address:  string | null;
  created_at:  string;
  user_email:  string | null;
  user_id:     string | null;
  org_name:    string | null;
  org_id:      string | null;
  site_domain: string | null;
  site_id:     string | null;
}

interface Org { id: string; name: string; }

// ── Action metadata ───────────────────────────────────────────────────────

const ACTION_META: Record<string, {
  label:  string;
  icon:   React.ElementType;
  color:  string;
}> = {
  site_provision_queued: { label: 'Site queued',       icon: Globe,      color: 'text-brand-500 bg-brand-50'  },
  site_active:           { label: 'Site live',          icon: Globe,      color: 'text-green-600 bg-green-50'  },
  site_suspended:        { label: 'Site suspended',     icon: Globe,      color: 'text-yellow-600 bg-yellow-50' },
  sso_token_issued:      { label: 'WP login',           icon: LogIn,      color: 'text-brand-500 bg-brand-50'  },
  org_created:           { label: 'Org created',        icon: Building2,  color: 'text-purple-600 bg-purple-50' },
  org_deleted:           { label: 'Org deleted',        icon: Building2,  color: 'text-red-600 bg-red-50'      },
  user_created:          { label: 'User created',       icon: Users,      color: 'text-green-600 bg-green-50'  },
  user_updated:          { label: 'User updated',       icon: Users,      color: 'text-brand-500 bg-brand-50'  },
  user_deleted:          { label: 'User deleted',       icon: Users,      color: 'text-red-600 bg-red-50'      },
  user_login:            { label: 'Login',              icon: LogIn,      color: 'text-slate-500 bg-slate-100' },
  user_logout:           { label: 'Logout',             icon: LogIn,      color: 'text-slate-500 bg-slate-100' },
};

const DEFAULT_ACTION = { label: 'Event', icon: AlertTriangle, color: 'text-slate-500 bg-slate-100' };

function getActionMeta(action: string) {
  return ACTION_META[action] ?? { ...DEFAULT_ACTION, label: action.replace(/_/g, ' ') };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDate(d: string) {
  const date = new Date(d);
  return date.toLocaleDateString('en-CA') + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function buildDescription(entry: LogEntry): string {
  const meta = entry.meta ?? {};
  switch (entry.action) {
    case 'site_provision_queued': return `${meta.domain ?? entry.site_domain ?? ''}  ·  ${meta.plan_tier ?? ''}`;
    case 'site_active':           return entry.site_domain ?? '';
    case 'site_suspended':        return meta.domain as string ?? entry.site_domain ?? '';
    case 'sso_token_issued':      return entry.site_domain ?? '';
    case 'org_created':           return `${meta.name ?? ''} (${meta.slug ?? ''})`;
    case 'org_deleted':           return String(meta.org_id ?? '');
    case 'user_created':          return `${meta.email ?? ''}  ·  ${meta.role ?? ''}`;
    case 'user_updated':          return `${entry.user_email ?? ''}  ·  Changed: ${(meta.changes as string[] ?? []).join(', ')}`;
    case 'user_deleted':          return String(meta.deleted_user_id ?? '');
    default:                      return Object.keys(meta).length > 0
      ? Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join('  ·  ')
      : '';
  }
}

// ── Page component ────────────────────────────────────────────────────────

export default function ActivityPage() {
  const [entries,      setEntries]      = useState<LogEntry[]>([]);
  const [orgs,         setOrgs]         = useState<Org[]>([]);
  const [actionTypes,  setActionTypes]  = useState<string[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [totalPages,   setTotalPages]   = useState(1);
  const [showFilters,  setShowFilters]  = useState(false);
  const [isAdmin,      setIsAdmin]      = useState(false);

  // Filter state
  const [filterAction,  setFilterAction]  = useState('');
  const [filterOrg,     setFilterOrg]     = useState('');
  const [filterFrom,    setFilterFrom]    = useState('');
  const [filterTo,      setFilterTo]      = useState('');
  const [activeFilters, setActiveFilters] = useState(0);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (filterAction) params.set('action',  filterAction);
      if (filterOrg)    params.set('org_id',  filterOrg);
      if (filterFrom)   params.set('from',    filterFrom);
      if (filterTo)     params.set('to',      filterTo);

      const res  = await fetch(`/api/admin/activity?${params}`);
      const data = await res.json();
      if (!data.ok) { setError(data.error); return; }

      setEntries(data.data.entries);
      setTotal(data.data.total);
      setPage(data.data.page);
      setTotalPages(data.data.total_pages);
      setActionTypes(data.data.action_types);

      // Infer admin from presence of org data
      const hasOrgs = data.data.entries.some((e: LogEntry) => e.org_name);
      setIsAdmin(hasOrgs);
    } catch { setError('Failed to load activity log.'); }
    finally   { setLoading(false); }
  }, [filterAction, filterOrg, filterFrom, filterTo]);

  // Load orgs for filter dropdown (admin only).
  useEffect(() => {
    fetch('/api/admin/orgs')
      .then(r => r.json())
      .then(d => { if (d.ok) setOrgs(d.data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);

  useEffect(() => {
    setActiveFilters(
      [filterAction, filterOrg, filterFrom, filterTo].filter(Boolean).length,
    );
  }, [filterAction, filterOrg, filterFrom, filterTo]);

  function clearFilters() {
    setFilterAction(''); setFilterOrg('');
    setFilterFrom('');   setFilterTo('');
  }

  return (
    <div>
      <PageHeader
        title="Activity log"
        description="Full audit trail of all dashboard and provisioning events"
      />

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-5">

        {error && <Alert variant="error">{error}</Alert>}

        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {loading ? 'Loading…' : `${total.toLocaleString()} events`}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(page)}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
              Refresh
            </button>
            <button
              onClick={() => setShowFilters(f => !f)}
              className={cn(
                'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors',
                showFilters || activeFilters > 0
                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300',
              )}
            >
              <Filter size={12} />
              Filters
              {activeFilters > 0 && (
                <span className="bg-brand-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {activeFilters}
                </span>
              )}
            </button>
            {activeFilters > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
              >
                <X size={12} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* ── Filter panel ── */}
        {showFilters && (
          <Card>
            <div className="px-5 py-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1.5">Event type</p>
                  <Select value={filterAction} onChange={e => setFilterAction(e.target.value)}>
                    <option value="">All events</option>
                    {actionTypes.map(a => (
                      <option key={a} value={a}>
                        {getActionMeta(a).label}
                      </option>
                    ))}
                  </Select>
                </div>

                {isAdmin && (
                  <div>
                    <p className="text-xs font-medium text-slate-600 mb-1.5">Organisation</p>
                    <Select value={filterOrg} onChange={e => setFilterOrg(e.target.value)}>
                      <option value="">All orgs</option>
                      {orgs.map(o => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </Select>
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1.5">From date</p>
                  <Input
                    type="date"
                    value={filterFrom}
                    onChange={e => setFilterFrom(e.target.value)}
                  />
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1.5">To date</p>
                  <Input
                    type="date"
                    value={filterTo}
                    onChange={e => setFilterTo(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* ── Log entries ── */}
        <Card>
          {loading && entries.length === 0 ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : entries.length === 0 ? (
            <div className="py-16 text-center">
              <Clock size={32} className="mx-auto text-slate-200 mb-3" />
              <p className="text-sm text-slate-400">No activity found.</p>
              {activeFilters > 0 && (
                <button onClick={clearFilters} className="mt-2 text-sm text-brand-600 hover:text-brand-700">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {entries.map(entry => {
                const meta = getActionMeta(entry.action);
                const Icon = meta.icon;
                const desc = buildDescription(entry);

                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors"
                  >
                    {/* Icon */}
                    <div className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                      meta.color,
                    )}>
                      <Icon size={13} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-800">
                          {meta.label}
                        </span>
                        {entry.org_name && (
                          <span className="text-xs text-slate-400">
                            {entry.org_name}
                          </span>
                        )}
                      </div>
                      {desc && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate font-mono">
                          {desc}
                        </p>
                      )}
                      <p className="text-xs text-slate-400 mt-1">
                        {entry.user_email ?? 'System'}
                        {entry.ip_address && (
                          <span className="ml-2 font-mono">{entry.ip_address}</span>
                        )}
                      </p>
                    </div>

                    {/* Timestamp */}
                    <div className="text-xs text-slate-400 flex-shrink-0 text-right">
                      {formatDate(entry.created_at)}
                    </div>
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
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={13} /> Previous
                </button>
                <button
                  onClick={() => load(page + 1)}
                  disabled={page >= totalPages || loading}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
