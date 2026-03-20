import { useState } from 'react'
import { setAuthSession, getProjectConfig } from '@/lib/api'

interface LoginPageProps {
  onSuccess: () => void
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const config = getProjectConfig()
  const apiUrl = config?.apiUrl || import.meta.env.VITE_API_URL || 'http://localhost:5152'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const url = mode === 'login'
      ? `${apiUrl}/auth/login`
      : `${apiUrl}/auth/register`

    try {
      const body: Record<string, string> = { email, password }
      if (mode === 'register' && displayName) body.displayName = displayName

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error || (res.status === 401 ? 'Invalid credentials' : `Error ${res.status}`))
        setLoading(false)
        return
      }

      const data = await res.json() as {
        userId: string; email: string; displayName?: string; token: string; expiresAt: string
      }

      setAuthSession({
        token: data.token,
        userId: data.userId,
        email: data.email,
        displayName: data.displayName,
        expiresAt: data.expiresAt,
      })

      onSuccess()
    } catch (err) {
      setError(`Cannot connect to ${apiUrl}`)
    }

    setLoading(false)
  }

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Kontinue</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="text-sm font-medium mb-1.5 block">Name</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="w-full h-10 rounded-md border px-3 text-sm bg-background"
                placeholder="Your name (optional)"
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full h-10 rounded-md border px-3 text-sm bg-background"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full h-10 rounded-md border px-3 text-sm bg-background"
              placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
              required
              minLength={mode === 'register' ? 8 : undefined}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <p className="text-center text-sm text-muted-foreground">
          {mode === 'login' ? (
            <>
              Don&apos;t have an account?{' '}
              <button onClick={() => { setMode('register'); setError(null) }} className="text-primary hover:underline">
                Register
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button onClick={() => { setMode('login'); setError(null) }} className="text-primary hover:underline">
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
