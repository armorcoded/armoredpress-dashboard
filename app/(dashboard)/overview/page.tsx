import { cookies } from 'next/headers';
import { verifySessionToken } from '@/lib/auth/session';
import { query } from '@/lib/db/pool';
import { PageHeader } from '@/components/layout/shell';
import { Card, CardHeader, CardTitle, CardBody, TierBadge, Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus, ExternalLink, ArrowUpRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

async function getOverviewData(isAdmin: boolean, orgId: string | null) {
  const siteWhere = isAdmin ? '' : 'WHERE s.org_id = $1';
  const params    = isAdmin ? [] : [orgId];

  const [sites, jobs, activity] = await Promise.all([
    query(`
      SELECT s.id, s.domain, s.status, s.plan_tier, s.org_id, o.name AS org_name
      FROM sites s
      JOIN orgs o ON o.id = s.org_id
      ${siteWhere}
      ORDER BY s.updated_at DESC LIMIT 10
    `, params),
    isAdmin ? query(`
      SELECT pj.id, pj.status, pj.current_step, pj.created_at, s.domain
      FROM provisioning_jobs pj
      JOIN sites s ON s.id = pj.site_id
      WHERE pj.status IN ('queued','running')
      ORDER BY pj.created_at DESC LIMIT 5
    `) : { rows: [] },
    query(`
      SELECT al.action, al.meta, al.created_at, al.ip_address,
             u.email AS user_email
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.user_id
      ${isAdmin ? '' : 'WHERE al.org_id = $1'}
      ORDER BY al.created_at DESC LIMIT 8
    `, isAdmin ? [] : [orgId]),
  ]);

  const counts = isAdmin
    ? await query(`
        SELECT
          COUNT(*) FILTER (WHERE s.status = 'active')       AS active,
          COUNT(*) FILTER (WHERE s.status != 'active')      AS other,
          COUNT(*)                                           AS total,
          COUNT(*) FILTER (WHERE s.status = 'provisioning') AS provisioning
        FROM sites s
      `)
    : { rows: [{ active: 0, other: 0, total: 0, provisioning: 0 }] };

  return {
    sites:    sites.rows,
    jobs:     jobs.rows,
    activity: activity.rows,
    counts:   counts.rows[0],
  };
}

const STATUS_DOT: Record<string, string> = {
  active:       'status-dot status-dot-green',
  provisioning: 'status-dot status-dot-blue',
  failed:       'status-dot status-dot-red',
  pending:      'status-dot status-dot-gray',
  suspended:    'status-dot status-dot-amber',
};

const ACTION_LABEL: Record<string, string> = {
  sso_token_issued:      'WP login',
  site_provision_queued: 'Site queued',
  site_active:           'Site live',
};

export default async function OverviewPage() {
  const cookieStore = await cookies();
  const token   = cookieStore.get('ap_access_token')?.value!;
  const session = await verifySessionToken(token);
  if (!session) return null;
  const isAdmin = session.role === 'internal_admin';

  const { sites, jobs, activity, counts } = await getOverviewData(isAdmin, session.org_id);

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Site health, activity and pending work"
        action={
          isAdmin
            ? <Link href="/sites/new"><Button size="sm"><Plus size={14} />New site</Button></Link>
            : undefined
        }
      />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total sites',  value: counts.total },
            { label: 'Active',       value: counts.active },
            { label: 'Provisioning', value: counts.provisioning },
            { label: 'Other',        value: counts.other },
          ].map(m => (
            <div key={m.label} className="ap-card px-4 py-3">
              <p className="text-xs text-slate-500">{m.label}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{m.value}</p>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Site health</CardTitle>
                <Link href="/sites" className="text-xs text-brand-600 hover:text-brand-700">
                  View all →
                </Link>
              </CardHeader>
              <div className="divide-y divide-slate-100">
                {sites.length === 0 && (
                  <p className="px-5 py-8 text-center text-sm text-slate-400">No sites yet.</p>
                )}
                {sites.map((site: any) => (
                  <div key={site.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                    <span className={STATUS_DOT[site.status] ?? 'status-dot status-dot-gray'} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{site.domain}</p>
                      {isAdmin && <p className="text-xs text-slate-400 truncate">{site.org_name}</p>}
                    </div>
                    <TierBadge tier={site.plan_tier} />
                    <Link
                      href={`/sites/${site.id}/wp-login`}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-brand-600 border border-slate-200 hover:border-brand-300 rounded-md px-2 py-1 transition-colors"
                    >
                      <ExternalLink size={11} /> WP login
                    </Link>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
                <Link href="/activity" className="text-xs text-brand-600 hover:text-brand-700">
                  Full log →
                </Link>
              </CardHeader>
              <div className="divide-y divide-slate-100">
                {activity.length === 0 && (
                  <p className="px-5 py-6 text-center text-xs text-slate-400">No activity yet.</p>
                )}
                {activity.map((a: any, i: number) => (
                  <div key={i} className="px-5 py-2.5 flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-brand-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <ArrowUpRight size={10} className="text-brand-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-slate-700 truncate">
                        {ACTION_LABEL[a.action] ?? a.action}
                        {a.meta?.domain && ` — ${a.meta.domain}`}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {a.user_email ?? 'System'} · {relativeTime(a.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle>Pending jobs</CardTitle>
                  <Link href="/jobs" className="text-xs text-brand-600 hover:text-brand-700">
                    View all →
                  </Link>
                </CardHeader>
                <div className="divide-y divide-slate-100">
                  {jobs.length === 0 && (
                    <p className="px-5 py-6 text-center text-xs text-slate-400">No pending jobs.</p>
                  )}
                  {jobs.map((job: any) => (
                    <div key={job.id} className="px-5 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-slate-700 truncate">{job.domain}</p>
                        <Badge variant={job.status === 'running' ? 'blue' : 'gray'}>
                          {job.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400">{job.current_step ?? 'Queued'}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function relativeTime(date: Date | string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
