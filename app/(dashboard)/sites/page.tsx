'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Globe, Plus, ExternalLink, Pause,
  RefreshCw, CheckCircle, XCircle, Clock, Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/shell';
import { Card, CardHeader, CardTitle, Badge, TierBadge, Alert, Spinner, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

interface Site {
  id:               string;
  domain:           string;
  status:           'pending' | 'provisioning' | 'active' | 'failed' | 'suspended';
  plan_tier:        'core' | 'secure' | 'compliance';
  is_migration:     boolean;
  origin_ip:        string | null;
  runcloud_app_id:  string | null;
  cloudflare_zone_id: string | null;
  created_at:       string;
  org_id:           string;
  org_name:         string;
  job_status:       string | null;
  job_step:         string | null;
  job_id:           string | null;
}

const STATUS_DOT: Record<string, string> = {
  active:       'status-dot status-dot-green',
  provisioning: 'status-dot status-dot-blue',
  failed:       'status-dot status-dot-red',
  pending:      'status-dot status-dot-gray',
  suspended:    'status-dot status-dot-amber',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  active:       <CheckCircle size={13} className="text-green-500" />,
  provisioning: <Loader2    size={13} className="text-brand-500 animate-spin" />,
  failed:       <XCircle    size={13} className="text-red-500" />,
  pending:      <Clock      size={13} className="text-slate-400" />,
  suspended:    <Pause      size={13} className="text-yellow-500" />,
};

export default function SitesPage() {
  const [sites,     setSites]     = useState<Site[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');
  const [suspending, setSuspending] = useState<string | null>(null);
  const [ssoLoading, setSsoLoading] = useState<string | null>(null);
  const [isAdmin,   setIsAdmin]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/admin/sites');
      const data = await res.json();
      if (data.ok) {
        setSites(data.data);
        // Infer admin from whether we see multiple orgs.
        const orgIds = new Set(data.data.map((s: Site) => s.org_id));
        setIsAdmin(orgIds.size > 1 || data.data.length === 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh every 15s if any site is provisioning.
    const interval = setInterval(() => {
      setSites(prev => {
        const hasActive = prev.some(s => s.status === 'provisioning' || s.status === 'pending');
        if (hasActive) load();
        return prev;
      });
    }, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  function showSuccess(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 4000);
  }

  async function handleWpLogin(site: Site) {
    setSsoLoading(site.id);
    try {
      const res  = await fetch('/api/sso', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ site_id: site.id }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error); return; }
      // Open in new tab.
      window.open(data.data.redirect_url, '_blank', 'noopener,noreferrer');
    } catch { setError('Login failed. Please try again.'); }
    finally   { setSsoLoading(null); }
  }

  async function handleSuspend(site: Site) {
    if (!confirm(`Suspend "${site.domain}"? It will remain in the database but be marked inactive.`)) return;
    setSuspending(site.id);
    try {
      const res  = await fetch(`/api/admin/sites/${site.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) { setError(data.error); return; }
      setSites(prev => prev.map(s =>
        s.id === site.id ? { ...s, status: 'suspended' } : s,
      ));
      showSuccess(`${site.domain} suspended.`);
    } catch { setError('Suspend failed. Please try again.'); }
    finally   { setSuspending(null); }
  }

  // Group by org for admin view.
  const grouped = sites.reduce<Record<string, { orgName: string; sites: Site[] }>>((acc, site) => {
    if (!acc[site.org_id]) acc[site.org_id] = { orgName: site.org_name, sites: [] };
    acc[site.org_id].sites.push(site);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="Sites"
        description="All provisioned WordPress sites"
        action={
          isAdmin
            ? <Link href="/sites/new"><Button size="sm"><Plus size={14} />New site</Button></Link>
            : undefined
        }
      />

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-5">

        {success && <Alert variant="success">{success}</Alert>}
        {error   && (
          <Alert variant="error">
            {error}
            <button onClick={() => setError('')} className="ml-2 underline text-xs">Dismiss</button>
          </Alert>
        )}

        {/* Refresh button */}
        <div className="flex justify-end">
          <button
            onClick={() => load()}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {loading && sites.length === 0 ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : sites.length === 0 ? (
          <div className="py-16 text-center">
            <Globe size={32} className="mx-auto text-slate-200 mb-3" />
            <p className="text-sm text-slate-400">No sites yet.</p>
            {isAdmin && (
              <Link href="/sites/new" className="mt-3 inline-block text-sm text-brand-600 hover:text-brand-700">
                Provision the first site →
              </Link>
            )}
          </div>
        ) : isAdmin ? (
          // Admin: grouped by org
          Object.values(grouped).map(({ orgName, sites: orgSites }) => (
            <Card key={orgName}>
              <CardHeader>
                <CardTitle>
                  {orgName}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {orgSites.length} {orgSites.length === 1 ? 'site' : 'sites'}
                  </span>
                </CardTitle>
              </CardHeader>
              <SiteRows
                sites={orgSites}
                isAdmin={isAdmin}
                ssoLoading={ssoLoading}
                suspending={suspending}
                onWpLogin={handleWpLogin}
                onSuspend={handleSuspend}
              />
            </Card>
          ))
        ) : (
          // Org view: flat list
          <Card>
            <SiteRows
              sites={sites}
              isAdmin={false}
              ssoLoading={ssoLoading}
              suspending={suspending}
              onWpLogin={handleWpLogin}
              onSuspend={handleSuspend}
            />
          </Card>
        )}

      </div>
    </div>
  );
}

// ── Site rows sub-component ───────────────────────────────────────────────

interface SiteRowsProps {
  sites:      Site[];
  isAdmin:    boolean;
  ssoLoading: string | null;
  suspending: string | null;
  onWpLogin:  (site: Site) => void;
  onSuspend:  (site: Site) => void;
}

function SiteRows({ sites, isAdmin, ssoLoading, suspending, onWpLogin, onSuspend }: SiteRowsProps) {
  return (
    <div className="divide-y divide-slate-100">
      {sites.map(site => (
        <div key={site.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors">

          {/* Status icon */}
          <div className="flex-shrink-0">
            {STATUS_ICON[site.status] ?? <Globe size={13} className="text-slate-400" />}
          </div>

          {/* Domain + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-slate-800 truncate">{site.domain}</p>
              {site.is_migration && (
                <span className="text-xs text-slate-400 italic">migrated</span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {site.origin_ip ?? '—'}
              {site.job_status && site.job_status !== 'complete' && (
                <span className="ml-2 text-brand-500">
                  {site.job_step ?? site.job_status}
                </span>
              )}
              {' · '}Added {new Date(site.created_at).toLocaleDateString()}
            </p>
          </div>

          {/* Tier */}
          <TierBadge tier={site.plan_tier} />

          {/* Status badge */}
          <StatusBadge status={site.status} />

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* WP login — only for active sites */}
            {site.status === 'active' ? (
              <button
                onClick={() => onWpLogin(site)}
                disabled={ssoLoading === site.id}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40"
              >
                {ssoLoading === site.id
                  ? <Spinner size={11} />
                  : <ExternalLink size={11} />
                }
                WP login
              </button>
            ) : site.status === 'provisioning' && site.job_id ? (
              <Link
                href={`/jobs/${site.job_id}`}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-brand-200 text-brand-600 bg-brand-50 hover:bg-brand-100 transition-colors"
              >
                <Loader2 size={11} className="animate-spin" />
                View progress
              </Link>
            ) : null}

            {/* Suspend — admin only, active sites */}
            {isAdmin && site.status === 'active' && (
              <button
                onClick={() => onSuspend(site)}
                disabled={suspending === site.id}
                title="Suspend site"
                className="p-1.5 rounded-md text-slate-400 hover:text-yellow-600 hover:bg-yellow-50 transition-colors disabled:opacity-40"
              >
                {suspending === site.id ? <Spinner size={13} /> : <Pause size={13} />}
              </button>
            )}
          </div>

        </div>
      ))}
    </div>
  );
}
