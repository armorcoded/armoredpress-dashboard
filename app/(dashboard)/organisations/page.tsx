'use client';
import { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, Trash2, Users, Globe, ChevronRight, X, Check } from 'lucide-react';
import { PageHeader } from '@/components/layout/shell';
import { Card, CardHeader, CardTitle } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, FormField } from '@/components/ui/input';
import { Alert, Spinner } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';

interface Org {
  id:         string;
  name:       string;
  slug:       string;
  created_at: string;
  site_count: number;
  user_count: number;
}

export default function OrganisationsPage() {
  const [orgs,        setOrgs]        = useState<Org[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [deleting,    setDeleting]    = useState<string | null>(null);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');
  const [name,        setName]        = useState('');
  const [slug,        setSlug]        = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/admin/orgs');
      const data = await res.json();
      if (data.ok) setOrgs(data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-derive slug from name unless user has manually edited it.
  useEffect(() => {
    if (!slugTouched) {
      setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    }
  }, [name, slugTouched]);

  function resetForm() {
    setName('');
    setSlug('');
    setSlugTouched(false);
    setError('');
    setShowForm(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res  = await fetch('/api/admin/orgs', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, slug }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error); return; }
      setSuccess(`Organisation "${name}" created.`);
      resetForm();
      load();
      setTimeout(() => setSuccess(''), 4000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(org: Org) {
    if (!confirm(`Delete "${org.name}"? This cannot be undone.`)) return;
    setDeleting(org.id);
    try {
      const res  = await fetch(`/api/admin/orgs/${org.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setOrgs(prev => prev.filter(o => o.id !== org.id));
      setSuccess(`"${org.name}" deleted.`);
      setTimeout(() => setSuccess(''), 4000);
    } catch {
      setError('Delete failed. Please try again.');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Organisations"
        description="Manage client organisations and their access"
        action={
          !showForm
            ? <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus size={14} /> New organisation
              </Button>
            : undefined
        }
      />

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Feedback banners */}
        {success && <Alert variant="success">{success}</Alert>}
        {error   && <Alert variant="error">{error}</Alert>}

        {/* ── Inline create form ── */}
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle>New organisation</CardTitle>
              <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </CardHeader>
            <form onSubmit={handleCreate} className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  label="Organisation name"
                  hint="e.g. Acme Corp"
                >
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Acme Corp"
                    autoFocus
                    required
                  />
                </FormField>

                <FormField
                  label="Slug"
                  hint="URL-safe identifier — auto-derived from name"
                >
                  <Input
                    value={slug}
                    onChange={e => { setSlug(e.target.value); setSlugTouched(true); }}
                    placeholder="acme-corp"
                    pattern="^[a-z0-9-]+$"
                    required
                  />
                </FormField>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" loading={submitting}>
                  <Check size={14} /> Create organisation
                </Button>
                <Button type="button" variant="ghost" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* ── Org list ── */}
        <Card>
          <CardHeader>
            <CardTitle>
              All organisations
              <span className="ml-2 text-xs font-normal text-slate-400">
                {orgs.length} total
              </span>
            </CardTitle>
          </CardHeader>

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : orgs.length === 0 ? (
            <div className="py-16 text-center">
              <Building2 size={32} className="mx-auto text-slate-200 mb-3" />
              <p className="text-sm text-slate-400">No organisations yet.</p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-3 text-sm text-brand-600 hover:text-brand-700"
              >
                Create the first one →
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {orgs.map(org => (
                <div
                  key={org.id}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                  {/* Icon */}
                  <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                    <Building2 size={16} className="text-brand-500" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{org.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      <code className="font-mono">{org.slug}</code>
                      {' · '}
                      Created {new Date(org.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-5 flex-shrink-0">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Globe size={13} className="text-slate-400" />
                      {org.site_count} {org.site_count === 1 ? 'site' : 'sites'}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Users size={13} className="text-slate-400" />
                      {org.user_count} {org.user_count === 1 ? 'user' : 'users'}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleDelete(org)}
                      disabled={deleting === org.id || Number(org.site_count) > 0}
                      title={Number(org.site_count) > 0 ? 'Cannot delete — has active sites' : 'Delete organisation'}
                      className={cn(
                        'p-1.5 rounded-md transition-colors',
                        Number(org.site_count) > 0 || deleting === org.id
                          ? 'text-slate-200 cursor-not-allowed'
                          : 'text-slate-400 hover:text-red-500 hover:bg-red-50',
                      )}
                    >
                      {deleting === org.id
                        ? <Spinner size={14} />
                        : <Trash2 size={14} />
                      }
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

      </div>
    </div>
  );
}
