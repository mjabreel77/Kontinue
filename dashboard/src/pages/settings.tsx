import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { KeyRound, Plus, Trash2, Copy, RefreshCw, LogOut, User } from 'lucide-react'
import { getProjectConfig, getAuthSession, clearAuthSession, authHeaders } from '@/lib/api'
import { useDashboardStore } from '@/lib/store'

interface ApiKeyGrant {
  projectId: string
  projectName: string
}

interface ApiKeyInfo {
  id: string
  name: string
  keyPrefix: string
  createdAt: string
  expiresAt: string | null
  grants: ApiKeyGrant[]
}

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, '')
}

export function SettingsPage() {
  const reconnect = useDashboardStore(s => s.reconnect)
  const config = getProjectConfig()
  const auth = getAuthSession()

  const [keys, setKeys] = useState<ApiKeyInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [newKeyName, setNewKeyName] = useState('default')
  const [expiresInDays, setExpiresInDays] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const apiUrl = config ? stripTrailingSlash(config.apiUrl) : null

  const loadKeys = useCallback(async () => {
    if (!apiUrl) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiUrl}/api/keys`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setKeys(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load keys')
    }
    setLoading(false)
  }, [apiUrl])

  useEffect(() => { loadKeys() }, [loadKeys])

  const handleCreate = async () => {
    if (!apiUrl || !config) return
    setError(null)
    try {
      const res = await fetch(`${apiUrl}/api/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          name: newKeyName.trim() || 'default',
          expiresInDays: expiresInDays ? parseInt(expiresInDays, 10) : null,
          projectIds: [config.projectId],
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setCreatedKey(data.key)
      setNewKeyName('default')
      setExpiresInDays('')
      loadKeys()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create key')
    }
  }

  const handleRevoke = async (keyId: string) => {
    if (!apiUrl) return
    setError(null)
    try {
      const res = await fetch(`${apiUrl}/api/keys/${keyId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`)
      loadKeys()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke key')
    }
  }

  const handleLogout = () => {
    clearAuthSession()
    window.location.reload()
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No project configured</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* User session */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="size-5" /> Account</CardTitle>
            <CardDescription>Currently signed in session</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {auth ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{auth.displayName || auth.email}</p>
                  <p className="text-xs text-muted-foreground">{auth.email}</p>
                  <p className="text-xs text-muted-foreground">Session expires: {new Date(auth.expiresAt).toLocaleDateString()}</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  <LogOut className="size-4 mr-2" /> Sign Out
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not signed in (using API key only)</p>
            )}
          </CardContent>
        </Card>

        {/* Create new key */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plus className="size-5" /> Create API Key</CardTitle>
            <CardDescription>Generate a scoped key for MCP/automation. Shown only once.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Key name"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="flex-1"
              />
              <Input
                type="number"
                placeholder="Expires in days"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                className="w-48"
              />
              <Button onClick={handleCreate} disabled={!auth}>Create</Button>
            </div>
            {!auth && (
              <p className="text-xs text-muted-foreground">Sign in to create API keys</p>
            )}

            {createdKey && (
              <div className="rounded-md border bg-muted/50 p-4 space-y-2">
                <p className="text-sm font-medium text-green-600 dark:text-green-400">Key created — copy it now!</p>
                <div className="flex gap-2 items-center">
                  <code className="text-xs font-mono bg-background border rounded px-2 py-1 flex-1 overflow-x-auto">
                    {createdKey}
                  </code>
                  <Button size="icon" variant="ghost" onClick={() => navigator.clipboard.writeText(createdKey)}>
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active keys list */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><KeyRound className="size-5" /> Your API Keys</CardTitle>
                <CardDescription>{keys.length} active key{keys.length !== 1 ? 's' : ''}</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={loadKeys} disabled={loading}>
                <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <p className="text-sm text-destructive mb-4">{error}</p>
            )}
            {keys.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground">No API keys created yet.</p>
            )}
            <div className="space-y-2">
              {keys.map((key) => (
                <div key={key.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground">{key.keyPrefix}…</span>
                      <span className="text-sm font-medium">{key.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(key.createdAt).toLocaleDateString()}
                      </span>
                      {key.expiresAt && (
                        <Badge variant="outline" className="text-[10px]">
                          expires {new Date(key.expiresAt).toLocaleDateString()}
                        </Badge>
                      )}
                    </div>
                    {key.grants && key.grants.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {key.grants.map(g => (
                          <Badge key={g.projectId} variant="secondary" className="text-[10px]">
                            {g.projectName}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRevoke(key.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  )
}
