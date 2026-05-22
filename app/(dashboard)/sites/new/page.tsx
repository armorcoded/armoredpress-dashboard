'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronRight, Globe, Shield, Upload, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, FormField, Select } from '@/components/ui/input';
import { Alert } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/shell';
import { cn } from '@/lib/utils/cn';

type PlanTier = 'core' | 'secure' | 'compliance';

interface FormState {
  // Step 1
  org_id:             string;
  domain:             string;
  plan_tier:          PlanTier;
  runcloud_server_id: string;
  origin_ip:          string;
  is_migration:       boolean;
  // Step 2
  cf_token:           string;
  cf_validated:       boolean;
  cf_zone_id:         string;
  // Step 3
  db_file:            File | null;
  wp_file:            File | null;
}

const STEPS = [
  { id: 1, label: 'Site details',   icon: Globe          },
  { id: 2, label: 'Cloudflare',     icon: Shield         },
  { id: 3, label: 'Migration',      icon: Upload         },
  { id: 4, label: 'Review',         icon: ClipboardCheck },
];

const TIER_INFO = {
  core:       { label: 'Core',       desc: '7-day backups, standard WAF, auto-updates' },
  secure:     { label: 'Secure',     desc: '14-day backups, enhanced WAF, change logging' },
  compliance: { label: 'Compliance', desc: '30-day backups, staged updates, full audit trail' },
};

export default function NewSitePage() {
  const router = useRouter();
  const [step,    setStep]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [jobId,   setJobId]   = useState('');

  const [form, setForm] = useState<FormState>({
    org_id: '', domain: '', plan_tier: 'core',
    runcloud_server_id: '', origin_ip: '', is_migration: false,
    cf_token: '', cf_validated: false, cf_zone_id: '',
    db_file: null, wp_file: null,
  });

  const set = (key: keyof FormState, val: FormState[keyof FormState]) =>
    setForm(f => ({ ...f, [key]: val }));

  // ── Step 2: Validate CF token ────────────────────────────────────────────

  async function validateCFToken() {
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/admin/sites/validate-cf-token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ domain: form.domain, cf_token: form.cf_token }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error); return; }
      set('cf_validated', true);
      set('cf_zone_id', data.data.zone_id);
    } catch { setError('Validation failed.'); }
    finally { setLoading(false); }
  }

  // ── Step 3: Upload files ─────────────────────────────────────────────────

  async function uploadFiles() {
    if (!form.db_file || !form.wp_file) return;
    setLoading(true); setError('');
    // Real implementation: chunked upload to /api/admin/sites/:id/uploads
    // Placeholder for now — files uploaded after site record created
    setTimeout(() => setLoading(false), 800);
  }

  // ── Step 4: Submit ───────────────────────────────────────────────────────

  async function handleSubmit() {
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/admin/sites', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          org_id:             form.org_id,
          domain:             form.domain,
          plan_tier:          form.plan_tier,
          runcloud_server_id: form.runcloud_server_id,
          origin_ip:          form.origin_ip,
          cf_token:           form.cf_token,
          is_migration:       form.is_migration,
        }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error); return; }
      setJobId(data.data.job_id);
      router.push(`/jobs/${data.data.job_id}`);
    } catch { setError('Submission failed. Please try again.'); }
    finally { setLoading(false); }
  }

  // ── Step navigation ──────────────────────────────────────────────────────

  const canProceed: Record<number, boolean> = {
    1: !!form.org_id && !!form.domain && !!form.runcloud_server_id && !!form.origin_ip,
    2: form.cf_validated,
    3: !form.is_migration || (!!form.db_file && !!form.wp_file),
    4: true,
  };

  return (
    <div>
      <PageHeader title="New site" description="Provision a new ArmoredPress WordPress site" />

      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Step indicator */}
        <div className="flex items-center mb-8">
          {STEPS.map((s, idx) => {
            const done   = step > s.id;
            const active = step === s.id;
            const skip   = !form.is_migration && s.id === 3;
            return (
              <div key={s.id} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors',
                    done   && 'bg-brand-500 border-brand-500 text-white',
                    active && 'border-brand-500 text-brand-600 bg-brand-50',
                    !done && !active && 'border-slate-200 text-slate-400 bg-white',
                    skip   && 'opacity-40',
                  )}>
                    {done ? <Check size={14} /> : <s.icon size={14} />}
                  </div>
                  <span className={cn(
                    'text-xs font-medium hidden sm:block',
                    active ? 'text-slate-800' : 'text-slate-400',
                    skip   && 'opacity-40',
                  )}>
                    {s.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={cn(
                    'flex-1 h-px mx-3',
                    done ? 'bg-brand-400' : 'bg-slate-200',
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {error && <Alert variant="error" className="mb-5 text-xs">{error}</Alert>}

        <div className="ap-card p-6">

          {/* ── Step 1: Site details ── */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-medium text-slate-800 mb-4">Site details</h2>

              <FormField label="Organisation">
                <Select value={form.org_id} onChange={e => set('org_id', e.target.value)} required>
                  <option value="">Select organisation…</option>
                  {/* Populated from API in real app */}
                  <option value="org-1">Acme Corp</option>
                  <option value="org-2">Blue Horizon Ltd</option>
                </Select>
              </FormField>

              <FormField label="Domain" hint="e.g. client.com — no https:// prefix">
                <Input
                  value={form.domain}
                  onChange={e => set('domain', e.target.value.toLowerCase().trim())}
                  placeholder="clientsite.com"
                />
              </FormField>

              <FormField label="Plan tier">
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {(Object.keys(TIER_INFO) as PlanTier[]).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => set('plan_tier', t)}
                      className={cn(
                        'px-3 py-3 rounded-lg border text-left transition-colors',
                        form.plan_tier === t
                          ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                          : 'border-slate-200 hover:border-slate-300',
                      )}
                    >
                      <p className="text-xs font-semibold text-slate-800">{TIER_INFO[t].label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{TIER_INFO[t].desc}</p>
                    </button>
                  ))}
                </div>
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="RunCloud server">
                  <Select value={form.runcloud_server_id} onChange={e => set('runcloud_server_id', e.target.value)}>
                    <option value="">Select server…</option>
                    <option value="42">ap-prod-01 (Toronto)</option>
                    <option value="43">ap-prod-02 (Vancouver)</option>
                  </Select>
                </FormField>
                <FormField label="Origin IP" hint="Server's public IP">
                  <Input
                    value={form.origin_ip}
                    onChange={e => set('origin_ip', e.target.value.trim())}
                    placeholder="198.51.100.42"
                  />
                </FormField>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={form.is_migration}
                  onChange={e => set('is_migration', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-brand-500"
                />
                <span className="text-sm text-slate-700">This is a migration (I have a DB dump + WP ZIP)</span>
              </label>
            </div>
          )}

          {/* ── Step 2: Cloudflare ── */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-medium text-slate-800 mb-1">Cloudflare BYO token</h2>
              <p className="text-xs text-slate-500 mb-4">
                Paste a scoped Cloudflare API token for <strong>{form.domain}</strong>.
                The token needs Zone:Read and DNS:Edit permissions.
              </p>

              <FormField label="API token">
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={form.cf_token}
                    onChange={e => { set('cf_token', e.target.value); set('cf_validated', false); }}
                    placeholder="Cloudflare API token…"
                    className="font-mono"
                  />
                  <Button
                    variant="secondary"
                    onClick={validateCFToken}
                    loading={loading}
                    disabled={!form.cf_token || form.cf_validated}
                  >
                    {form.cf_validated ? '✓ Valid' : 'Validate'}
                  </Button>
                </div>
              </FormField>

              {form.cf_validated && (
                <Alert variant="success" className="text-xs">
                  Token validated. Zone ID: <code className="font-mono">{form.cf_zone_id}</code>
                </Alert>
              )}

              <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500 space-y-1">
                <p className="font-medium text-slate-700">Baseline rules that will be applied:</p>
                <ul className="mt-1 space-y-0.5 list-disc list-inside">
                  <li>Always-On HTTPS + TLS 1.2 minimum</li>
                  <li>XML-RPC blocked</li>
                  <li>wp-login.php rate limited (5 req / 60s)</li>
                  <li>Managed WAF rules enabled</li>
                </ul>
              </div>
            </div>
          )}

          {/* ── Step 3: Migration ── */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-medium text-slate-800 mb-1">Migration files</h2>
              <p className="text-xs text-slate-500 mb-4">
                Upload your database dump and WordPress file archive. Both will be imported automatically after provisioning.
              </p>

              <FormField
                label="Database dump"
                hint=".sql or .sql.gz — max 2 GB"
              >
                <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-slate-300 hover:border-brand-400 cursor-pointer transition-colors bg-white">
                  <Upload size={16} className="text-slate-400 flex-shrink-0" />
                  <span className="text-sm text-slate-500 flex-1 truncate">
                    {form.db_file ? form.db_file.name : 'Choose file or drag here…'}
                  </span>
                  <input
                    type="file"
                    accept=".sql,.gz,.sql.gz"
                    className="sr-only"
                    onChange={e => set('db_file', e.target.files?.[0] ?? null)}
                  />
                </label>
              </FormField>

              <FormField
                label="WordPress files"
                hint=".zip — max 5 GB"
              >
                <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-slate-300 hover:border-brand-400 cursor-pointer transition-colors bg-white">
                  <Upload size={16} className="text-slate-400 flex-shrink-0" />
                  <span className="text-sm text-slate-500 flex-1 truncate">
                    {form.wp_file ? form.wp_file.name : 'Choose file or drag here…'}
                  </span>
                  <input
                    type="file"
                    accept=".zip"
                    className="sr-only"
                    onChange={e => set('wp_file', e.target.files?.[0] ?? null)}
                  />
                </label>
              </FormField>
            </div>
          )}

          {/* ── Step 4: Review ── */}
          {step === 4 && (
            <div>
              <h2 className="font-medium text-slate-800 mb-4">Review & launch</h2>
              <div className="space-y-2 text-sm">
                {[
                  ['Domain',     form.domain],
                  ['Plan',       form.plan_tier],
                  ['Migration',  form.is_migration ? 'Yes' : 'No'],
                  ['CF Zone',    form.cf_zone_id || '—'],
                  ['Server ID',  form.runcloud_server_id],
                  ['Origin IP',  form.origin_ip],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2 border-b border-slate-100 last:border-0">
                    <span className="text-slate-500">{k}</span>
                    <span className="font-medium text-slate-800 font-mono text-xs">{v}</span>
                  </div>
                ))}
              </div>
              <Alert variant="info" className="mt-4 text-xs">
                Provisioning runs 10 automated steps. You can watch live progress on the next screen.
              </Alert>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-5 border-t border-slate-100">
            <Button
              variant="ghost"
              onClick={() => { setError(''); setStep(s => Math.max(1, s - 1)); }}
              disabled={step === 1}
            >
              Back
            </Button>

            {step < 4 ? (
              <Button
                onClick={() => {
                  setError('');
                  // Skip migration step if not migrating
                  const next = (!form.is_migration && step === 2) ? 4 : step + 1;
                  setStep(next);
                }}
                disabled={!canProceed[step]}
              >
                Continue <ChevronRight size={14} />
              </Button>
            ) : (
              <Button onClick={handleSubmit} loading={loading}>
                Launch provisioning
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
