'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/badge';

export default function VerifyTotpPage() {
  const router = useRouter();
  const [code,    setCode]    = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { inputs.current[0]?.focus(); }, []);

  function handleChange(idx: number, val: string) {
    const digit = val.replace(/\D/, '').slice(-1);
    const next  = [...code];
    next[idx]   = digit;
    setCode(next);
    if (digit && idx < 5) inputs.current[idx + 1]?.focus();
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !code[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(''));
      inputs.current[5]?.focus();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fullCode = code.join('');
    if (fullCode.length !== 6) return;

    setError('');
    setLoading(true);

    const partialToken = sessionStorage.getItem('ap_partial_token');
    if (!partialToken) {
      router.push('/login');
      return;
    }

    try {
      const res  = await fetch('/api/auth/verify-totp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ partial_token: partialToken, code: fullCode }),
      });
      const data = await res.json();

      if (!data.ok) {
        setError(data.error ?? '2FA verification failed.');
        setCode(['', '', '', '', '', '']);
        inputs.current[0]?.focus();
        return;
      }

      document.cookie = `ap_access_token=${data.data.access_token}; path=/; SameSite=Lax`;
      sessionStorage.removeItem('ap_partial_token');
      router.push('/overview');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-500 rounded-2xl mb-4">
            <KeyRound size={22} className="text-white" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Two-factor authentication</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter the 6-digit code from your authenticator app.
          </p>
        </div>

        <div className="ap-card p-6">
          {error && (
            <Alert variant="error" className="mb-4 text-xs">{error}</Alert>
          )}

          <form onSubmit={handleSubmit}>
            {/* OTP digit inputs */}
            <div className="flex gap-2 justify-center mb-6" onPaste={handlePaste}>
              {code.map((digit, idx) => (
                <input
                  key={idx}
                  ref={el => { inputs.current[idx] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleChange(idx, e.target.value)}
                  onKeyDown={e => handleKeyDown(idx, e)}
                  className="w-11 h-13 text-center text-lg font-semibold rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors"
                />
              ))}
            </div>

            <Button
              type="submit"
              loading={loading}
              disabled={code.join('').length !== 6}
              className="w-full"
            >
              Verify
            </Button>
          </form>

          <button
            onClick={() => router.push('/login')}
            className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            ← Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}
