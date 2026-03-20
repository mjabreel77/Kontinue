import { useState, useEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Circle, Loader2, CheckCircle2, GitBranch, Clock,
  Eye, Scale, Radio, ArrowRight, AlertTriangle,
} from 'lucide-react'
import { getProjectConfig, fetchWorkspaceOverview } from '@/lib/api'
import { useDashboardStore } from '@/lib/store'
import type { WorkspaceOverview, WorkspaceProjectSummary } from '@/types'

function minutesAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
}

function formatAge(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function HealthDot({ level }: { level: string }) {
  const color =
    level === 'good' ? 'bg-emerald-500' :
    level === 'fair' ? 'bg-amber-500' : 'bg-red-500'
  return <span className={`size-2 rounded-full ${color} shrink-0`} title={`Health: ${level}`} />
}

function ProjectCard({ project, isActive, onSwitch }: {
  project: WorkspaceProjectSummary
  isActive: boolean
  onSwitch: () => void
}) {
  const totalTasks = project.tasks.todo + project.tasks.inProgress + project.tasks.done

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/30 ${isActive ? 'border-primary/50 ring-1 ring-primary/20' : ''}`}
      onClick={onSwitch}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <HealthDot level={project.health.level} />
            <h3 className="font-semibold text-sm truncate">{project.name}</h3>
            {isActive && <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 shrink-0">current</Badge>}
          </div>
          <ArrowRight className="size-3.5 text-muted-foreground/40 shrink-0" />
        </div>

        {/* Task stats */}
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Circle className="size-3" /> {project.tasks.todo}
          </span>
          <span className="flex items-center gap-1 text-primary">
            <Loader2 className="size-3" /> {project.tasks.inProgress}
          </span>
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3" /> {project.tasks.done}
          </span>
          {totalTasks > 0 && (
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden ml-1">
              <div className="h-full flex">
                <div className="bg-emerald-500/70 transition-all" style={{ width: `${(project.tasks.done / totalTasks) * 100}%` }} />
                <div className="bg-primary/60 transition-all" style={{ width: `${(project.tasks.inProgress / totalTasks) * 100}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Session + checkpoint */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {project.activeSession ? (
            <span className="flex items-center gap-1">
              <Clock className="size-3 text-emerald-500" />
              {formatAge(minutesAgo(project.activeSession.startedAt))} · {project.activeSession.toolCalls} calls
              {project.activeSession.branch && (
                <span className="flex items-center gap-0.5 ml-1">
                  <GitBranch className="size-3" /> {project.activeSession.branch}
                </span>
              )}
            </span>
          ) : (
            <span className="flex items-center gap-1 opacity-60">
              <Clock className="size-3" /> No session
            </span>
          )}
        </div>

        {/* Counts row */}
        <div className="flex gap-3 text-[11px] text-muted-foreground">
          {project.decisions > 0 && (
            <span className="flex items-center gap-1"><Scale className="size-3 text-purple-500" /> {project.decisions}</span>
          )}
          {project.observations > 0 && (
            <span className="flex items-center gap-1"><Eye className="size-3 text-amber-500" /> {project.observations}</span>
          )}
          {project.pendingSignals > 0 && (
            <span className="flex items-center gap-1"><Radio className="size-3 text-red-500" /> {project.pendingSignals}</span>
          )}
        </div>

        {/* Health warnings */}
        {project.health.reasons.length > 0 && (
          <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground/70">
            <AlertTriangle className="size-3 shrink-0 mt-0.5" />
            <span>{project.health.reasons.join(' · ')}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function WorkspacePage() {
  const config = getProjectConfig()
  const switchProject = useDashboardStore(s => s.switchProject)
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!config?.apiUrl || !config?.workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchWorkspaceOverview(config.apiUrl, config.workspaceId)
      setOverview(data)
    } catch (e) {
      setError('Failed to load workspace overview')
    }
    setLoading(false)
  }, [config?.apiUrl, config?.workspaceId])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 30s
  useEffect(() => {
    const timer = setInterval(load, 30_000)
    return () => clearInterval(timer)
  }, [load])

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error && !overview) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  if (!overview) return null

  const totalTasks = overview.projects.reduce((s, p) => s + p.tasks.todo + p.tasks.inProgress + p.tasks.done, 0)
  const activeSessions = overview.projects.filter(p => p.activeSession).length
  const healthyCount = overview.projects.filter(p => p.health.level === 'good').length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">{overview.name}</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          {overview.projects.length} project{overview.projects.length !== 1 ? 's' : ''} · {totalTasks} tasks · {activeSessions} active session{activeSessions !== 1 ? 's' : ''} · {healthyCount}/{overview.projects.length} healthy
        </p>
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{overview.projects.length}</p>
            <p className="text-[11px] text-muted-foreground">Projects</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{totalTasks}</p>
            <p className="text-[11px] text-muted-foreground">Total Tasks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{activeSessions}</p>
            <p className="text-[11px] text-muted-foreground">Active Sessions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{healthyCount}</p>
            <p className="text-[11px] text-muted-foreground">Healthy</p>
          </CardContent>
        </Card>
      </div>

      {/* Project cards */}
      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {overview.projects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              isActive={project.id === config?.projectId}
              onSwitch={() => {
                if (!config) return
                switchProject({
                  ...config,
                  workspaceId: overview.id,
                  projectId: project.id,
                  projectName: project.name,
                })
              }}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
