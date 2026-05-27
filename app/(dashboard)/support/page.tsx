'use client';
import { useState, useEffect } from 'react';
import { LifeBuoy, CheckCircle, ChevronDown } from 'lucide-react';
import { PageHeader } from '@/components/layout/shell';
import { Card, CardHeader, CardTitle, Alert } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, FormField, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';
import { SUB_ISSUES } from '@/lib/autotask/config';

interface Site {
  id:     string;
  domain: string;
}

const PRIORITIES = [
  { value: 'low',      label: 'Low',      desc: 'General question or minor issue'    },
  { value: 'medium',   label: 'Medium',   desc: 'Issue affecting functionality'      },
  { value: 'high',     label: 'High',     desc: 'Service degraded, workaround exists' },
  { value: 'critical', label: 'Critical', desc: 'Site down or data at risk'          },
] as const;

const PRIORITY_COLOUR: Record<string, string> = {
  low:      'border-slate-200 bg-white',
  medium:   'border-brand-300 bg-brand-50',
  high:     'border-yellow-300 bg-yellow-50',
  critical: 'border-red-300 bg-red-50',
};

const PRIORITY_DOT: Record<string, string> = {
  low:      'bg-slate-400',
  medium:   'bg-brand-500',
  high:     'bg-yellow-500',
  critical: 'bg-red-500',
};

export default function SupportPage() {
  const [sites,       setSites]       = useState<Site[]>([]);
  const [subject,     setSubject]     = useState('');
  const [description, setDescription] = useState('');
  const [subIssue,    setSubIssue]    = useState('wordpress');
  const [priority,    setPriority]    = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [siteId,      setSiteId]      = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const [submitted,   setSubmitted]   = useState<{ ticket_id: number; ticket_number: string } | null>(null);

  useEffect(() => {
    fetch('/api/admin/sites')
      .then(r => r.json())
      .then(d => { if (d.ok) setSites(d.data.map((s: Site) => ({ id: s.id, domain: s.domain }))); })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSubmitting(true);
    try {
      const res  = await fetch('/api/support', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          subject,
          description,
          sub_issue: subIssue,
          priority,
          site_id: siteId || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error); return; }
      setSubmitted(data.data);
    } catch { setError('Network error. Please try again.'); }
    finally   { setSubmitting(false); }
  }

  function resetForm() {
    setSubject(''); setDescription(''); setSubIssue('wordpress');
    setPriority('medium'); setSiteId(''); setSubmitted(null); setError('');
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div>
        <PageHeader title="Support" description="Submit a support request" />
        <div className="max-w-xl mx-auto px-6 py-16 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6">
            <CheckCircle size={32} className="text-green-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Ticket submitted</h2>
          <p className="text-sm text-slate-500 mb-2">
            Your support request has been received and a ticket has been created.
          </p>
          {submitted.ticket_number && (
            <p className="text-sm font-mono text-brand-600 mb-6">
              Ticket #{submitted.ticket_number}
            </p>
          )}
          <p className="text-xs text-slate-400 mb-8">
            Our team will respond to your request as soon as possible.
            You will receive updates via email.
          </p>
          <Button variant="secondary" onClick={resetForm}>
            Submit another request
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Support"
        description="Submit a support request — our team will respond via email"
      />

      <div className="max-w-2xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-5">

          {error && <Alert variant="error">{error}</Alert>}

          {/* ── Category ── */}
          <Card>
            <CardHeader>
              <CardTitle>Category</CardTitle>
            </CardHeader>
            <div className="px-5 py-4 space-y-4">
              {/* Issue type — always Hosting, shown read-only */}
              <div className="flex items-center gap-3 py-2 border-b border-slate-100">
                <span className="text-xs text-slate-500 w-24 flex-shrink-0">Issue type</span>
                <span className="text-sm font-medium text-slate-800">Hosting</span>
              </div>

              <FormField label="Sub-issue">
                <Select
                  value={subIssue}
                  onChange={e => setSubIssue(e.target.value)}
                >
                  {SUB_ISSUES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </Select>
              </FormField>

              <FormField
                label="Related site"
                hint="Optional — select the site this request is about"
              >
                <Select value={siteId} onChange={e => setSiteId(e.target.value)}>
                  <option value="">No specific site</option>
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>{s.domain}</option>
                  ))}
                </Select>
              </FormField>
            </div>
          </Card>

          {/* ── Priority ── */}
          <Card>
            <CardHeader>
              <CardTitle>Priority</CardTitle>
            </CardHeader>
            <div className="px-5 py-4">
              <div className="grid grid-cols-2 gap-2">
                {PRIORITIES.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 rounded-lg border text-left transition-colors',
                      priority === p.value
                        ? `${PRIORITY_COLOUR[p.value]} ring-1 ring-offset-0 ring-current`
                        : 'border-slate-200 hover:border-slate-300 bg-white',
                    )}
                  >
                    <div className={cn(
                      'w-2 h-2 rounded-full flex-shrink-0 mt-1.5',
                      PRIORITY_DOT[p.value],
                    )} />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{p.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{p.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* ── Details ── */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <div className="px-5 py-4 space-y-4">
              <FormField label="Subject" hint="Brief summary of the issue">
                <Input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. WordPress admin page not loading"
                  required
                  minLength={5}
                />
              </FormField>

              <FormField
                label="Description"
                hint="Include what you were doing, what happened, and any error messages"
              >
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Please describe the issue in as much detail as possible…"
                  required
                  minLength={10}
                  rows={6}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors resize-y"
                />
              </FormField>
            </div>
          </Card>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-slate-400">
              Tickets are monitored during business hours. Critical issues receive 24/7 attention.
            </p>
            <Button
              type="submit"
              loading={submitting}
              disabled={!subject || !description}
            >
              <LifeBuoy size={14} />
              Submit ticket
            </Button>
          </div>

        </form>
      </div>
    </div>
  );
}
