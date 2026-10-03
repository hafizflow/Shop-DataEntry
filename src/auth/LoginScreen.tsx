import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, LogIn, Mail, Lock, ScanBarcode } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { Bi } from '../components/Bi';
import { setBilingual, useT } from '../lib/i18n';
import { warmCameraPermission } from '../scanner/feedback';

export function LoginScreen() {
  const { signIn } = useAuth();
  const tt = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  setBilingual(true); // the role is unknown before sign-in, so show both languages

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setFailed(false);
    void warmCameraPermission(); // inside the tap, so the browser allows the permission prompt now
    const ok = await signIn(email, password);
    if (!ok) { setFailed(true); setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-8 px-6 py-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="grid size-20 place-items-center rounded-3xl bg-accent text-accent-fg shadow-lg">
          <ScanBarcode className="size-10" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-bold"><Bi k="app.name" stack /></h1>
          <p className="mt-2 text-sm text-muted"><Bi k="login.hint" /></p>
        </div>
      </div>

      <form onSubmit={submit} className="card flex flex-col gap-4 p-5">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          <Bi k="login.email" />
          <span className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
            <input className="input pl-12" type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          <Bi k="login.password" />
          <span className="relative">
            <Lock className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
            <input className="input px-12" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <button
              type="button" onClick={() => setShow((v) => !v)} aria-pressed={show} aria-label={tt(show ? 'login.hide' : 'login.show')}
              className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-muted focus-visible:outline-2 focus-visible:outline-accent"
            >
              {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
            </button>
          </span>
        </label>
        {failed && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger"><Bi k="login.failed" /></p>}
        <button className="btn btn-primary mt-1" disabled={busy}>
          <LogIn className="size-5" aria-hidden />
          <Bi k={busy ? 'login.busy' : 'login.submit'} />
        </button>
      </form>
    </main>
  );
}
