import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { Layout } from '@/components/layout'
import { useDashboardStore } from '@/lib/store'
import {
  getProjectConfig, setProjectConfig,
  fetchWorkspaces, fetchProjects,
  getAuthSession, authHeaders,
} from '@/lib/api'
import { OverviewPage } from '@/pages/overview'
import { BoardPage } from '@/pages/board'
import { DecisionsPage } from '@/pages/decisions'
import { ObservationsPage } from '@/pages/observations'
import { SignalsPage } from '@/pages/signals'
import { PlansPage } from '@/pages/plans'
import { ActivityPage } from '@/pages/activity'
import { WorkspacePage } from '@/pages/workspace'
import { SettingsPage } from '@/pages/settings'
import { LoginPage } from '@/pages/login'

function ConnectedLayout() {
  const connect = useDashboardStore(s => s.connect)
  const disconnect = useDashboardStore(s => s.disconnect)
  const data = useDashboardStore(s => s.data)
  const error = useDashboardStore(s => s.error)

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={data ? <OverviewPage /> : <LoadingState error={error} />} />
        <Route path="/board" element={data ? <BoardPage /> : <LoadingState error={error} />} />
        <Route path="/decisions" element={data ? <DecisionsPage /> : <LoadingState error={error} />} />
        <Route path="/observations" element={data ? <ObservationsPage /> : <LoadingState error={error} />} />
        <Route path="/signals" element={data ? <SignalsPage /> : <LoadingState error={error} />} />
        <Route path="/plans" element={data ? <PlansPage /> : <LoadingState error={error} />} />
        <Route path="/activity" element={data ? <ActivityPage /> : <LoadingState error={error} />} />
        <Route path="/workspace" element={<WorkspacePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

function LoadingState({ error }: { error: string | null }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-2">
        {error ? (
          <>
            <p className="text-sm text-destructive">{error}</p>
            <p className="text-xs text-muted-foreground">
              Make sure the Kontinue API server is running
            </p>
          </>
        ) : (
          <>
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Connecting to Kontinue...</p>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Project selector (shown when no config is saved) ──────── */

function ProjectSelector() {
  const [apiUrl, setApiUrl] = useState(import.meta.env.VITE_API_URL || 'http://localhost:5000')
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string; slug: string }>>([])
  const [selectedWs, setSelectedWs] = useState<string | null>(null)
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const [step, setStep] = useState<'url' | 'workspace' | 'project'>('url')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleConnect = async () => {
    setLoading(true)
    setErr(null)
    try {
      const ws = await fetchWorkspaces(apiUrl)
      setWorkspaces(ws)
      if (ws.length === 0) {
        setErr('No workspaces found. Use the CLI to sync data first.')
      } else if (ws.length === 1) {
        setSelectedWs(ws[0].id)
        const ps = await fetchProjects(apiUrl, ws[0].id)
        setProjects(ps)
        setStep('project')
      } else {
        setStep('workspace')
      }
    } catch (e) {
      setErr(`Cannot connect to ${apiUrl}`)
    }
    setLoading(false)
  }

  // Auto-connect when VITE_API_URL is provided (e.g. by Aspire)
  useEffect(() => {
    if (import.meta.env.VITE_API_URL) handleConnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectWorkspace = async (wsId: string) => {
    setLoading(true)
    setSelectedWs(wsId)
    try {
      const ps = await fetchProjects(apiUrl, wsId)
      setProjects(ps)
      setStep('project')
    } catch {
      setErr('Failed to load projects')
    }
    setLoading(false)
  }

  const handleSelectProject = (p: { id: string; name: string }) => {
    setProjectConfig({ apiUrl, workspaceId: selectedWs!, projectId: p.id, projectName: p.name })
    window.location.reload()
  }

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="w-full max-w-md space-y-6 p-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Kontinue</h1>
          <p className="text-sm text-muted-foreground">Connect to your Kontinue API server</p>
        </div>

        {step === 'url' && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">API URL</label>
              <input
                type="text"
                value={apiUrl}
                onChange={e => setApiUrl(e.target.value)}
                className="w-full h-10 rounded-md border px-3 text-sm bg-background"
                placeholder="http://localhost:5000"
              />
            </div>
            <button
              onClick={handleConnect}
              disabled={loading}
              className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        )}

        {step === 'workspace' && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Select Workspace</h2>
            {workspaces.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No workspaces found</p>
            )}
            {workspaces.map(ws => (
              <button
                key={ws.id}
                onClick={() => handleSelectWorkspace(ws.id)}
                className="w-full text-left p-3 rounded-lg border hover:border-primary/50 hover:bg-accent/50 transition-colors"
              >
                <div className="font-medium text-sm">{ws.name}</div>
                <div className="text-xs text-muted-foreground">{ws.slug}</div>
              </button>
            ))}
            <button
              onClick={() => setStep('url')}
              className="text-xs text-muted-foreground hover:underline"
            >
              ← Back
            </button>
          </div>
        )}

        {step === 'project' && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Select Project</h2>
            {projects.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No projects in this workspace</p>
            )}
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => handleSelectProject(p)}
                className="w-full text-left p-3 rounded-lg border hover:border-primary/50 hover:bg-accent/50 transition-colors"
              >
                <div className="font-medium text-sm">{p.name}</div>
                <div className="text-xs text-muted-foreground font-mono">{p.id.slice(0, 8)}</div>
              </button>
            ))}
            <button
              onClick={() => setStep(workspaces.length > 1 ? 'workspace' : 'url')}
              className="text-xs text-muted-foreground hover:underline"
            >
              ← Back
            </button>
          </div>
        )}

        {err && (
          <p className="text-sm text-destructive text-center">{err}</p>
        )}
      </div>
    </div>
  )
}

export function App() {
  const [hasAuth, setHasAuth] = useState(() => !!getAuthSession())
  const [hasConfig, setHasConfig] = useState(() => !!getProjectConfig())

  return (
    <ThemeProvider defaultTheme="system">
      {!hasAuth ? (
        <LoginPage onSuccess={() => setHasAuth(true)} />
      ) : hasConfig ? (
        <HashRouter>
          <ConnectedLayout />
        </HashRouter>
      ) : (
        <ProjectSelector />
      )}
    </ThemeProvider>
  )
}
