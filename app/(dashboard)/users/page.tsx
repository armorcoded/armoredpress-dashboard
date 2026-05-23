'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Trash2, Eye, EyeOff, X, Check,
  ShieldCheck, ToggleLeft, ToggleRight, KeyRound,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/shell';
import { Card, CardHeader, CardTitle, Badge, Alert, Spinner } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, FormField, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';

interface User {
  id:            string;
  email:         string;
  role:          'internal_admin' | 'org_admin' | 'org_user';
  first_name:    string | null;
  last_name:     string | null;
  is_active:     boolean;
  totp_enabled:  boolean;
  last_login_at: string | null;
  created_at:    string;
  org_name:      string | null;
  org_id:        string | null;
}

interface Org { id: string; name: string; }

const ROLE_BADGE: Record<string, 'blue' | 'purple' | 'gray'> = {
  internal_admin: 'purple',
  org_admin:      'blue',
  org_user:       'gray',
};

const ROLE_LABEL: Record<string, string> = {
  internal_admin: 'Admin',
  org_admin:      'Org Admin',
  org_user:       'Org User',
};

export default function UsersPage() {
  const [users,       setUsers]       = useState<User[]>([]);
  const [orgs,        setOrgs]        = useState<Org[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');
  const [actionUser,  setActionUser]  = useState<string | null>(null);

  // Create form state
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [role,      setRole]      = useState<'internal_admin' | 'org_admin' | 'org_user'>('org_admin');
  const [orgId,     setOrgId]     = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');

  // Reset password modal state
  const [resetTarget,  setResetTarget]  = useState<User | null>(null);
  const [newPassword,  setNewPassword]  = useState('');
  const [showNewPw,    setShowNewPw]    = useState(false);
  const [resetting,    setResetting]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, orgsRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/orgs'),
      ]);
      const [usersData, orgsData] = await Promise.all([
        usersRes.json(),
        orgsRes.json(),
      ]);
      if (usersData.ok) setUsers(usersData.data);
      if (orgsData.ok)  setOrgs(orgsData.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setEmail(''); setPassword(''); setRole('org_admin');
    setOrgId(''); setFirstName(''); setLastName('');
    setShowPw(false); setError(''); setShowForm(false);
  }

  function showSuccess(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 4000);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSubmitting(true);
    try {
      const res  = await fetch('/api/admin/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email, password, role,
          org_id:     role === 'internal_admin' ? null : orgId || null,
          first_name: firstName || undefined,
          last_name:  lastName  || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error); return; }
      showSuccess(`User "${email}" created.`);
      resetForm();
      load();
    } catch { setError('Network error. Please try again.'); }
    finally   { setSubmitting(false); }
  }

  async function toggleActive(user: User) {
    setActionUser(user.id);
    try {
      const res  = await fetch(`/api/admin/users/${user.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ is_active: !user.is_active }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error); return; }
      setUsers(prev => prev.map(u =>
        u.id === user.id ? { ...u, is_active: !u.is_active } : u,
      ));
      showSuccess(`${user.email} ${user.is_active ? 'deactivated' : 'activated'}.`);
    } catch { setError('Action failed. Please try again.'); }
    finally   { setActionUser(null); }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetting(true);
    try {
      const res  = await fetch(`/api/admin/users/${resetTarget.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ new_password: newPassword }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error); return; }
      showSuccess(`Password reset for ${resetTarget.email}.`);
      setResetTarget(null);
      setNewPassword('');
    } catch { setError('Reset failed. Please try again.'); }
    finally   { setResetting(false); }
  }

  async function handleDelete(user: User) {
    if (!confirm(`Delete "${user.email}"? This cannot be undone.`)) return;
    setActionUser(user.id);
    try {
      const res  = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) { setError(data.error); return; }
      setUsers(prev => prev.filter(u => u.id !== user.id));
      showSuccess(`${user.email} deleted.`);
    } catch { setError('Delete failed. Please try again.'); }
    finally   { setActionUser(null); }
  }

  const needsOrg = role === 'org_admin' || role === 'org_user';

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage all dashboard users across organisations"
        action={
          !showForm
            ? <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus size={14} /> New user
              </Button>
            : undefined
        }
      />

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {success && <Alert variant="success">{success}</Alert>}
        {error   && <Alert variant="error">{error}<button onClick={() => setError('')} className="ml-2 underline text-xs">Dismiss</button></Alert>}

        {/* ── Create form ── */}
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle>New user</CardTitle>
              <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </CardHeader>
            <form onSubmit={handleCreate} className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="First name">
                  <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jamie" />
                </FormField>
                <FormField label="Last name">
                  <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Smith" />
                </FormField>
              </div>

              <FormField label="Email address">
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="jamie@client.com"
                  required
                />
              </FormField>

              <FormField label="Password" hint="Minimum 12 characters">
                <div className="relative">
                  <Input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Role">
                  <Select value={role} onChange={e => setRole(e.target.value as typeof role)}>
                    <option value="org_admin">Org Admin</option>
                    <option value="org_user">Org User</option>
                    <option value="internal_admin">Internal Admin</option>
                  </Select>
                </FormField>

                {needsOrg && (
                  <FormField label="Organisation">
                    <Select value={orgId} onChange={e => setOrgId(e.target.value)} required={needsOrg}>
                      <option value="">Select organisation…</option>
                      {orgs.map(o => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </Select>
                  </FormField>
                )}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" loading={submitting}>
                  <Check size={14} /> Create user
                </Button>
                <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
              </div>
            </form>
          </Card>
        )}

        {/* ── Reset password modal ── */}
        {resetTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-800">Reset password</h2>
                <button onClick={() => { setResetTarget(null); setNewPassword(''); }} className="text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Setting a new password for <strong>{resetTarget.email}</strong>. Their existing sessions will be revoked.
              </p>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <FormField label="New password" hint="Minimum 12 characters">
                  <div className="relative">
                    <Input
                      type={showNewPw ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="••••••••••••"
                      autoFocus
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {showNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </FormField>
                <div className="flex gap-3 pt-1">
                  <Button type="submit" loading={resetting}>Reset password</Button>
                  <Button type="button" variant="ghost" onClick={() => { setResetTarget(null); setNewPassword(''); }}>
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── User list ── */}
        <Card>
          <CardHeader>
            <CardTitle>
              All users
              <span className="ml-2 text-xs font-normal text-slate-400">{users.length} total</span>
            </CardTitle>
          </CardHeader>

          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center">
              <Users size={32} className="mx-auto text-slate-200 mb-3" />
              <p className="text-sm text-slate-400">No users yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {users.map(user => (
                <div
                  key={user.id}
                  className={cn(
                    'flex items-center gap-4 px-5 py-3.5 transition-colors',
                    user.is_active ? 'hover:bg-slate-50' : 'bg-slate-50 opacity-60',
                  )}
                >
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {(user.first_name?.[0] ?? user.email[0]).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {user.first_name || user.last_name
                          ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
                          : user.email}
                      </p>
                      {!user.is_active && (
                        <span className="text-xs text-slate-400 italic">inactive</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate">
                      {user.first_name ? user.email + ' · ' : ''}
                      {user.org_name ?? 'No organisation'}
                      {user.last_login_at
                        ? ` · Last login ${relativeTime(user.last_login_at)}`
                        : ' · Never logged in'}
                    </p>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={ROLE_BADGE[user.role]}>{ROLE_LABEL[user.role]}</Badge>
                    {user.totp_enabled && (
                      <span title="2FA enabled">
                        <ShieldCheck size={14} className="text-green-500" />
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Toggle active */}
                    <button
                      onClick={() => toggleActive(user)}
                      disabled={actionUser === user.id}
                      title={user.is_active ? 'Deactivate user' : 'Activate user'}
                      className="p-1.5 rounded-md text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40"
                    >
                      {actionUser === user.id
                        ? <Spinner size={14} />
                        : user.is_active
                          ? <ToggleRight size={16} className="text-green-500" />
                          : <ToggleLeft size={16} />
                      }
                    </button>

                    {/* Reset password */}
                    <button
                      onClick={() => setResetTarget(user)}
                      title="Reset password"
                      className="p-1.5 rounded-md text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                    >
                      <KeyRound size={14} />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(user)}
                      disabled={actionUser === user.id}
                      title="Delete user"
                      className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                    >
                      <Trash2 size={14} />
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

function relativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}
