import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { requestPasswordReset, signIn, type WhsUser } from '../services/auth.ts';

const inputClass =
  'w-full h-12 px-3.5 bg-white text-[15px] rounded-lg border border-[#D6D2CC] focus:border-finlay outline-none';

export function LoginScreen({ onSignedIn }: { onSignedIn: (user: WhsUser) => void }) {
  const [mode, setMode] = useState<'signin' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim()) return setError('Please enter your email address.');
    if (mode === 'signin' && !password) return setError('Please enter your password.');
    setBusy(true);
    try {
      if (mode === 'reset') {
        const res = await requestPasswordReset(email);
        if (res.error) setError(res.error);
        else setInfo('If that email has an account, a reset link is on its way.');
        return;
      }
      const res = await signIn(email, password);
      if (res.user) onSignedIn(res.user);
      else setError(res.error || 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-canvas">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col gap-3">
          <img src="/finlay-banner.jpg" alt="Finlay: Screening & Crushing, Waste & Recycling, Washing Systems" className="w-full max-w-[360px] h-auto block" />
          <div className="text-xs font-semibold tracking-[0.14em] text-finlay">WORK HEALTH &amp; SAFETY</div>
        </div>
        <form onSubmit={submit} className="bg-white border border-line rounded-xl p-6 flex flex-col gap-4">
          <div>
            <h1 className="m-0 text-xl font-bold">{mode === 'signin' ? 'Sign in' : 'Reset your password'}</h1>
            <p className="mt-1.5 mb-0 text-sm text-muted">
              {mode === 'signin' ? 'Use the same email and password as the Fleet Hub.' : 'We will email you a link to set a new password.'}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
          </div>
          {mode === 'signin' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} />
            </div>
          )}
          {error && <p role="alert" className="m-0 text-sm text-[#8E0F15] bg-[#FBE3E4] rounded-lg px-3 py-2.5">{error}</p>}
          {info && <p role="status" className="m-0 text-sm text-[#1E6B3A] bg-[#E3F3E8] rounded-lg px-3 py-2.5">{info}</p>}
          <button type="submit" disabled={busy} className="h-12 rounded-lg bg-finlay hover:bg-finlay-dark text-white font-semibold text-[15px] flex items-center justify-center gap-2 disabled:opacity-70">
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {mode === 'signin' ? 'Sign in' : 'Send reset link'}
          </button>
          <button
            type="button"
            onClick={() => { setMode(mode === 'signin' ? 'reset' : 'signin'); setError(null); setInfo(null); }}
            className="text-sm text-muted hover:text-finlay self-center bg-transparent border-0 cursor-pointer"
          >
            {mode === 'signin' ? 'Forgot your password?' : 'Back to sign in'}
          </button>
        </form>
        <p className="mt-5 text-xs text-muted text-center">Authorised Finlay personnel only</p>
      </div>
    </div>
  );
}
