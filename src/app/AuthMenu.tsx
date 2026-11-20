import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { Button } from '../design-system/ui'
import { authAvailable, friendlyAuthError, signInWithEmail, signInWithGoogle, signOutUser, signUpWithEmail, subscribeAuth } from '../firebase/auth'
import { useT } from '../i18n'

export function AuthMenu() {
  const t = useT()
  const [user, setUser] = useState<User | null>(null)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => subscribeAuth(setUser), [])
  useEffect(() => {
    if (open) first.current?.focus()
  }, [open])

  if (!authAvailable()) return null

  const attempt = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setOpen(false)
      setPassword('')
    } catch (e) {
      setError(friendlyAuthError(e))
    } finally {
      setBusy(false)
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void attempt(() => signInWithEmail(email, password))
  }

  if (user)
    return (
      <span className="flex items-center gap-2 text-xs text-muted">
        <span className="hidden max-w-[10rem] truncate sm:inline" title={user.email ?? undefined}>
          {user.email ?? 'Signed in'}
        </span>
        <button className="rounded-lg border border-line px-2 py-1.5 text-ink hover:bg-surface2" onClick={() => void signOutUser()}>
          {t('Sign out')}
        </button>
      </span>
    )

  return (
    <>
      <button className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink hover:bg-surface2" onClick={() => setOpen(true)}>
        {t('Sign in')}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('Sign in')}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
            className="w-full max-w-sm rounded-xl border border-line bg-surface p-5"
          >
            <h2 className="text-lg font-semibold">Sign in to Bimoda</h2>
            <p className="mt-1 text-xs text-muted">Optional. The demo works without an account and uses synthetic data only.</p>
            <Button className="mt-4 w-full" variant="ghost" disabled={busy} onClick={() => void attempt(signInWithGoogle)}>
              Continue with Google
            </Button>
            <form onSubmit={submit} className="mt-4 space-y-3">
              <label className="block text-sm">
                Email
                <input
                  ref={first}
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-bg p-2"
                />
              </label>
              <label className="block text-sm">
                Password
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-bg p-2"
                />
              </label>
              {error && (
                <p role="alert" className="rounded-lg border border-bad/50 bg-bad/10 p-2 text-xs text-bad">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={busy}>
                  {t('Sign in')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1"
                  disabled={busy || !email || password.length < 6}
                  onClick={() => void attempt(() => signUpWithEmail(email, password))}
                >
                  Create account
                </Button>
              </div>
            </form>
            <button className="mt-3 text-xs text-muted underline" onClick={() => setOpen(false)}>
              Continue in demo mode
            </button>
          </div>
        </div>
      )}
    </>
  )
}
