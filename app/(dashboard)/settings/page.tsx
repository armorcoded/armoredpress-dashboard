'use client';
import { useState, useEffect, useRef } from 'react';
import {
  User, Lock, Shield, ShieldCheck, ShieldOff,
  Eye, EyeOff, Check, X, Copy, CheckCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/shell';
import { Card, CardHeader, CardTitle, Alert, Badge, Spinner } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, FormField } from '@/components/ui/input';

interface Profile {
  id:           string;
  email:        string;
  role:         string;
  first_name:   string | null;
  last_name:    string | null;
  totp_enabled: boolean;
  last_login_at: string | null;
  created_at:   string;
}

const ROLE_LABEL: Record<string, string> = {
  internal_admin: 'Internal Admin',
  org_admin:      'Org Admin',
  org_user:       'Org User',
};

export default function SettingsPage() {
  const [profile,    setProfile]    = useState<Profile | null>(null);
  const [loading,    setLoading]    = useState(true);

  // Profile form
  const [firstName,  setFirstName]  = useState('');
  const [lastName,   setLastName]   = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password form
  const [currentPw,  setCurrentPw]  = useState('');
  const [newPw,      setNewPw]      = useState('');
  const [confirmPw,  setConfirmPw]  = useState('');
  const [showCurr,   setShowCurr]   = useState(false);
  const [showNew,    setShowNew]    = useState(false);
  const [savingPw,   setSavingPw]   = useState(false);
  const [pwMsg,      setPwMsg]      = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 2FA setup
  const [totpStep,   setTotpStep]   = useState<'idle' | 'qr' | 'verify' | 'disable'>('idle');
  const [qrUrl,      setQrUrl]      = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode,   setTotpCode]   = useState('');
  const [totp2FAMsg, setTotp2FAMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [savingTotp, setSavingTotp] = useState(false);
  const [copied,     setCopied]     = useState(false);
  const codeInputs  = useRef<(HTMLInputElement | null)[]>([]);
  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', '']);

  useEffect(() => {
    fetch('/api/account')
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setProfile(d.data);
          setFirstName(d.data.first_name ?? '');
          setLastName(d.data.last_name ?? '');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function showMsg(
    setter: (v: { type: 'success' | 'error'; text: string } | null) => void,
    type: 'success' | 'error',
    text: string,
  ) {
    setter({ type, text });
    if (type === 'success') setTimeout(() => setter(null), 4000);
  }

  // ── Profile save ────────────────────────────────────────────────────────

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res  = await fetch('/api/account', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ first_name: firstName, last_name: lastName }),
      });
      const data = await res.json();
      if (!data.ok) { showMsg(setProfileMsg, 'error', data.error); return; }
      setProfile(p => p ? { ...p, first_name: firstName, last_name: lastName } : p);
      showMsg(setProfileMsg, 'success', 'Profile updated.');
    } catch { showMsg(setProfileMsg, 'error', 'Network error.'); }
    finally   { setSavingProfile(false); }
  }

  // ── Password change ─────────────────────────────────────────────────────

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPw !== confirmPw) {
      showMsg(setPwMsg, 'error', 'New passwords do not match.');
      return;
    }
    setSavingPw(true);
    try {
      const res  = await fetch('/api/account', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      const data = await res.json();
      if (!data.ok) { showMsg(setPwMsg, 'error', data.error); return; }
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      showMsg(setPwMsg, 'success', 'Password changed. All other sessions have been signed out.');
    } catch { showMsg(setPwMsg, 'error', 'Network error.'); }
    finally   { setSavingPw(false); }
  }

  // ── 2FA setup ───────────────────────────────────────────────────────────

  async function startTotpSetup() {
    setSavingTotp(true);
    setTotp2FAMsg(null);
    try {
      const res  = await fetch('/api/account/totp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'setup' }),
      });
      const data = await res.json();
      if (!data.ok) { showMsg(setTotp2FAMsg, 'error', data.error); return; }
      setQrUrl(data.data.qr_url);
      setTotpSecret(data.data.secret);
      setTotpStep('qr');
    } catch { showMsg(setTotp2FAMsg, 'error', 'Setup failed.'); }
    finally   { setSavingTotp(false); }
  }

  function handleCodeChange(idx: number, val: string) {
    const digit = val.replace(/\D/, '').slice(-1);
    const next  = [...codeDigits];
    next[idx]   = digit;
    setCodeDigits(next);
    setTotpCode(next.join(''));
    if (digit && idx < 5) codeInputs.current[idx + 1]?.focus();
  }

  function handleCodeKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !codeDigits[idx] && idx > 0) {
      codeInputs.current[idx - 1]?.focus();
    }
  }

  function handleCodePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setCodeDigits(pasted.split(''));
      setTotpCode(pasted);
      codeInputs.current[5]?.focus();
    }
  }

  async function handleEnableTotp() {
    if (totpCode.length !== 6) return;
    setSavingTotp(true);
    setTotp2FAMsg(null);
    try {
      const res  = await fetch('/api/account/totp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'enable', code: totpCode }),
      });
      const data = await res.json();
      if (!data.ok) {
        showMsg(setTotp2FAMsg, 'error', data.error);
        setCodeDigits(['', '', '', '', '', '']);
        setTotpCode('');
        codeInputs.current[0]?.focus();
        return;
      }
      setProfile(p => p ? { ...p, totp_enabled: true } : p);
      setTotpStep('idle');
      setCodeDigits(['', '', '', '', '', '']);
      setTotpCode('');
      showMsg(setTotp2FAMsg, 'success', '2FA enabled successfully.');
    } catch { showMsg(setTotp2FAMsg, 'error', 'Verification failed.'); }
    finally   { setSavingTotp(false); }
  }

  async function handleDisableTotp() {
    if (totpCode.length !== 6) return;
    setSavingTotp(true);
    setTotp2FAMsg(null);
    try {
      const res  = await fetch('/api/account/totp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'disable', code: totpCode }),
      });
      const data = await res.json();
      if (!data.ok) { showMsg(setTotp2FAMsg, 'error', data.error); return; }
      setProfile(p => p ? { ...p, totp_enabled: false } : p);
      setTotpStep('idle');
      setCodeDigits(['', '', '', '', '', '']);
      setTotpCode('');
      showMsg(setTotp2FAMsg, 'success', '2FA disabled.');
    } catch { showMsg(setTotp2FAMsg, 'error', 'Failed to disable 2FA.'); }
    finally   { setSavingTotp(false); }
  }

  function copySecret() {
    navigator.clipboard.writeText(totpSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24"><Spinner /></div>
    );
  }

  return (
    <div>
      <PageHeader title="Settings" description="Manage your account, password and security" />

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* ── Profile ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User size={15} className="text-slate-400" />
              <CardTitle>Profile</CardTitle>
            </div>
          </CardHeader>
          <div className="px-5 py-4 space-y-4">
            {/* Read-only fields */}
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-xs text-slate-500">Email</span>
              <span className="text-sm text-slate-800 font-mono">{profile?.email}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-xs text-slate-500">Role</span>
              <Badge variant={profile?.role === 'internal_admin' ? 'purple' : 'blue'}>
                {ROLE_LABEL[profile?.role ?? ''] ?? profile?.role}
              </Badge>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-xs text-slate-500">Member since</span>
              <span className="text-sm text-slate-600">
                {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
              </span>
            </div>

            {/* Editable name */}
            {profileMsg && (
              <Alert variant={profileMsg.type === 'success' ? 'success' : 'error'}>
                {profileMsg.text}
              </Alert>
            )}
            <form onSubmit={handleSaveProfile} className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="First name">
                  <Input
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="Jamie"
                  />
                </FormField>
                <FormField label="Last name">
                  <Input
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Smith"
                  />
                </FormField>
              </div>
              <Button type="submit" variant="secondary" size="sm" loading={savingProfile}>
                <Check size={13} /> Save name
              </Button>
            </form>
          </div>
        </Card>

        {/* ── Password ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock size={15} className="text-slate-400" />
              <CardTitle>Change password</CardTitle>
            </div>
          </CardHeader>
          <div className="px-5 py-4">
            {pwMsg && (
              <Alert variant={pwMsg.type === 'success' ? 'success' : 'error'} className="mb-4">
                {pwMsg.text}
              </Alert>
            )}
            <form onSubmit={handleChangePassword} className="space-y-3">
              <FormField label="Current password">
                <div className="relative">
                  <Input
                    type={showCurr ? 'text' : 'password'}
                    value={currentPw}
                    onChange={e => setCurrentPw(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="pr-10"
                  />
                  <button type="button" onClick={() => setShowCurr(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                    {showCurr ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </FormField>
              <FormField label="New password" hint="Minimum 12 characters">
                <div className="relative">
                  <Input
                    type={showNew ? 'text' : 'password'}
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="pr-10"
                  />
                  <button type="button" onClick={() => setShowNew(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                    {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </FormField>
              <FormField label="Confirm new password">
                <Input
                  type="password"
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  placeholder="••••••••••••"
                  required
                />
              </FormField>
              <Button type="submit" variant="secondary" size="sm" loading={savingPw}>
                <Check size={13} /> Update password
              </Button>
            </form>
          </div>
        </Card>

        {/* ── Two-factor authentication ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              {profile?.totp_enabled
                ? <ShieldCheck size={15} className="text-green-500" />
                : <Shield      size={15} className="text-slate-400" />
              }
              <CardTitle>Two-factor authentication</CardTitle>
            </div>
            <Badge variant={profile?.totp_enabled ? 'green' : 'gray'}>
              {profile?.totp_enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </CardHeader>

          <div className="px-5 py-4 space-y-4">
            {totp2FAMsg && (
              <Alert variant={totp2FAMsg.type === 'success' ? 'success' : 'error'}>
                {totp2FAMsg.text}
              </Alert>
            )}

            {/* ── Idle state ── */}
            {totpStep === 'idle' && !profile?.totp_enabled && (
              <div>
                <p className="text-sm text-slate-500 mb-4">
                  Add an extra layer of security. You'll need an authenticator app
                  like Google Authenticator or Authy.
                </p>
                <Button variant="secondary" size="sm" onClick={startTotpSetup} loading={savingTotp}>
                  <Shield size={13} /> Set up 2FA
                </Button>
              </div>
            )}

            {totpStep === 'idle' && profile?.totp_enabled && (
              <div>
                <p className="text-sm text-slate-500 mb-4">
                  2FA is active on your account. To disable it, enter a code from your authenticator app.
                </p>
                <Button
                  variant="danger-outline"
                  size="sm"
                  onClick={() => { setTotpStep('disable'); setCodeDigits(['','','','','','']); setTotpCode(''); }}
                >
                  <ShieldOff size={13} /> Disable 2FA
                </Button>
              </div>
            )}

            {/* ── QR code step ── */}
            {totpStep === 'qr' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.
                </p>
                <div className="flex justify-center">
                  {qrUrl
                    ? <img src={qrUrl} alt="2FA QR code" className="w-44 h-44 rounded-lg border border-slate-200" />
                    : <div className="w-44 h-44 bg-slate-100 rounded-lg flex items-center justify-center"><Spinner /></div>
                  }
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Can't scan? Enter this key manually:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-slate-100 rounded-lg px-3 py-2 font-mono tracking-widest break-all">
                      {totpSecret}
                    </code>
                    <button onClick={copySecret} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors flex-shrink-0">
                      {copied ? <CheckCheck size={14} className="text-green-500" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
                <Button size="sm" onClick={() => { setTotpStep('verify'); setTimeout(() => codeInputs.current[0]?.focus(), 100); }}>
                  Continue →
                </Button>
                <button onClick={() => setTotpStep('idle')} className="ml-3 text-xs text-slate-400 hover:text-slate-600">Cancel</button>
              </div>
            )}

            {/* ── Verify / Disable code entry ── */}
            {(totpStep === 'verify' || totpStep === 'disable') && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  {totpStep === 'verify'
                    ? 'Enter the 6-digit code from your authenticator app to confirm setup.'
                    : 'Enter a current 6-digit code from your authenticator app to disable 2FA.'}
                </p>
                <div className="flex gap-2 justify-center" onPaste={handleCodePaste}>
                  {codeDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={el => { codeInputs.current[idx] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleCodeChange(idx, e.target.value)}
                      onKeyDown={e => handleCodeKeyDown(idx, e)}
                      className="w-11 h-13 text-center text-lg font-semibold rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors"
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant={totpStep === 'disable' ? 'danger' : 'primary'}
                    onClick={totpStep === 'verify' ? handleEnableTotp : handleDisableTotp}
                    loading={savingTotp}
                    disabled={totpCode.length !== 6}
                  >
                    {totpStep === 'verify' ? 'Enable 2FA' : 'Disable 2FA'}
                  </Button>
                  <button
                    onClick={() => { setTotpStep('idle'); setCodeDigits(['','','','','','']); setTotpCode(''); }}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </Card>

      </div>
    </div>
  );
}
