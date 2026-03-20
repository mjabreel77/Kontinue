import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  DashboardData, StateFullEvent, ProjectConfig, GranularEvent,
  Task, Decision, Observation, Signal, Plan, Question,
  Checkpoint, Session, Handoff, AuthSession,
} from '@/types'

const CONFIG_KEY = 'kontinue-config'
const AUTH_KEY = 'kontinue-auth'

const DEFAULT_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

/* ── Auth session ──────────────────────────────────────────── */

export function getAuthSession(): AuthSession | null {
  const raw = localStorage.getItem(AUTH_KEY)
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as AuthSession
    if (new Date(session.expiresAt) < new Date()) {
      localStorage.removeItem(AUTH_KEY)
      return null
    }
    return session
  } catch { return null }
}

export function setAuthSession(session: AuthSession) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session))
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_KEY)
}

/* ── Project config ────────────────────────────────────────── */

export function getProjectConfig(): ProjectConfig | null {
  const raw = localStorage.getItem(CONFIG_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function setProjectConfig(config: ProjectConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

export function clearProjectConfig() {
  localStorage.removeItem(CONFIG_KEY)
}

/* ── Build DashboardData from StateFullEvent ───────────────── */

function minutesAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
}

function buildActivity(event: StateFullEvent): DashboardData['activity'] {
  const items: DashboardData['activity'] = []

  for (const t of event.tasks)
    items.push({ type: 'task', summary: `Task: ${t.title} [${t.status}]`, ts: t.updatedAt || t.createdAt })
  for (const d of event.decisions)
    items.push({ type: 'decision', summary: d.summary, ts: d.createdAt })
  for (const o of event.observations)
    items.push({ type: 'observation', summary: o.content.slice(0, 120), ts: o.createdAt })
  for (const s of event.signals)
    items.push({ type: 'signal', summary: `[${s.type}] ${s.content.slice(0, 100)}`, ts: s.createdAt })
  for (const p of event.plans)
    items.push({ type: 'plan', summary: `Plan: ${p.title} [${p.status}]`, ts: p.createdAt })
  for (const q of event.questions)
    items.push({ type: 'question', summary: q.text.slice(0, 120), ts: q.createdAt })

  if (event.activeSession)
    items.push({ type: 'session', summary: `Session started${event.activeSession.branch ? ` on ${event.activeSession.branch}` : ''}`, ts: event.activeSession.startedAt })
  if (event.lastCheckpoint)
    items.push({ type: 'checkpoint', summary: event.lastCheckpoint.progress.slice(0, 120), ts: event.lastCheckpoint.createdAt })
  if (event.lastHandoff)
    items.push({ type: 'handoff', summary: event.lastHandoff.summary.slice(0, 120), ts: event.lastHandoff.createdAt })

  items.sort((a, b) => b.ts.localeCompare(a.ts))
  return items.slice(0, 100)
}

export function buildDashboardData(event: StateFullEvent, projectName: string): DashboardData {
  const session: DashboardData['session'] = event.activeSession
    ? { ...event.activeSession, ageMin: minutesAgo(event.activeSession.startedAt) }
    : null

  const checkpoint: DashboardData['checkpoint'] = event.lastCheckpoint
    ? { ...event.lastCheckpoint, ageMin: minutesAgo(event.lastCheckpoint.createdAt) }
    : null

  const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString()
  const staleTasks = event.tasks
    .filter(t => t.status === 'inProgress' && t.updatedAt < twoHoursAgo)
    .map(t => ({ id: t.id, title: t.title, updatedAt: t.updatedAt }))

  const reasons: string[] = []
  if (!session) reasons.push('No active session')
  if (checkpoint && checkpoint.ageMin > 30) reasons.push(`Checkpoint ${checkpoint.ageMin}m stale`)
  if (staleTasks.length > 0) reasons.push(`${staleTasks.length} stale task(s)`)

  const level: DashboardData['health']['level'] =
    reasons.length === 0 ? 'good' : reasons.length === 1 ? 'fair' : 'poor'

  return {
    project: { id: event.projectId, name: projectName },
    git: {
      branch: session?.branch ?? null,
      commit: session?.startCommit ?? null,
    },
    session,
    lastHandoff: event.lastHandoff ?? null,
    tasks: {
      inProgress: event.tasks.filter(t => t.status === 'inProgress'),
      todo: event.tasks.filter(t => t.status === 'todo'),
      done: event.tasks.filter(t => t.status === 'done'),
    },
    decisions: event.decisions,
    plans: event.plans,
    checkpoint,
    questions: event.questions,
    observations: event.observations,
    signals: {
      recent: event.signals,
      pending: event.signals.filter(s => s.status === 'pending'),
    },
    activity: buildActivity(event),
    health: { level, reasons },
    staleTasks,
    stats: { chunks: 0 },
    generatedAt: new Date().toISOString(),
  }
}

/* ── Patch DashboardData from granular events ──────────────── */

function recalcHealth(d: DashboardData): DashboardData {
  const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString()
  const staleTasks = d.tasks.inProgress
    .filter(t => t.updatedAt < twoHoursAgo)
    .map(t => ({ id: t.id, title: t.title, updatedAt: t.updatedAt }))

  const reasons: string[] = []
  if (!d.session) reasons.push('No active session')
  if (d.checkpoint && d.checkpoint.ageMin > 30) reasons.push(`Checkpoint ${d.checkpoint.ageMin}m stale`)
  if (staleTasks.length > 0) reasons.push(`${staleTasks.length} stale task(s)`)

  const level: DashboardData['health']['level'] =
    reasons.length === 0 ? 'good' : reasons.length === 1 ? 'fair' : 'poor'

  return { ...d, health: { level, reasons }, staleTasks, generatedAt: new Date().toISOString() }
}

function pushActivity(d: DashboardData, type: string, summary: string): DashboardData {
  const activity = [{ type, summary, ts: new Date().toISOString() }, ...d.activity].slice(0, 100)
  return { ...d, activity }
}

function allTasks(d: DashboardData): Task[] {
  return [...d.tasks.inProgress, ...d.tasks.todo, ...d.tasks.done]
}

function rebucket(tasks: Task[]): DashboardData['tasks'] {
  return {
    inProgress: tasks.filter(t => t.status === 'inProgress'),
    todo: tasks.filter(t => t.status === 'todo'),
    done: tasks.filter(t => t.status === 'done'),
  }
}

export function patchDashboardData(prev: DashboardData, event: GranularEvent): DashboardData {
  let d = { ...prev }

  switch (event.$type) {
    /* ── Task events ──────────────────────────────────── */
    case 'task.created': {
      if (allTasks(d).some(t => t.id === event.taskId)) break
      const now = new Date().toISOString()
      const task: Task = {
        id: event.taskId, projectId: event.projectId,
        title: event.title, description: event.description ?? null,
        status: event.status ?? 'todo', outcome: null, notes: null, branch: null,
        createdAt: now, updatedAt: now, startedAt: null, endedAt: null,
        items: [], blockedBy: [], blocks: [], externalLinks: [],
      }
      d.tasks = rebucket([...allTasks(d), task])
      d = pushActivity(d, 'task', `Task: ${task.title} [${task.status}]`)
      break
    }
    case 'task.updated': {
      const tasks = allTasks(d).map(t => {
        if (t.id !== event.taskId) return t
        return {
          ...t,
          ...(event.title != null && { title: event.title }),
          ...(event.description != null && { description: event.description }),
          ...(event.notes != null && { notes: event.notes }),
          updatedAt: new Date().toISOString(),
        }
      })
      d.tasks = rebucket(tasks)
      break
    }
    case 'task.status_changed': {
      const now = new Date().toISOString()
      const tasks = allTasks(d).map(t => {
        if (t.id !== event.taskId) return t
        return {
          ...t,
          status: event.newStatus,
          outcome: event.outcome ?? t.outcome,
          updatedAt: now,
          ...(event.newStatus === 'inProgress' && { startedAt: t.startedAt ?? now }),
          ...(event.newStatus === 'done' && { endedAt: now }),
        }
      })
      d.tasks = rebucket(tasks)
      d = pushActivity(d, 'task', `Task status: ${event.oldStatus} → ${event.newStatus}`)
      break
    }
    case 'task.deleted': {
      const tasks = allTasks(d).filter(t => t.id !== event.taskId)
      d.tasks = rebucket(tasks)
      break
    }

    /* ── Decision events ──────────────────────────────── */
    case 'decision.logged': {
      if (d.decisions.some(dec => dec.id === event.decisionId)) break
      const decision: Decision = {
        id: event.decisionId, summary: event.summary,
        rationale: null, alternatives: [], context: null,
        files: [], tags: event.tags ?? [],
        status: 'active', supersededById: null,
        scope: event.scope ?? 'session',
        createdAt: new Date().toISOString(),
      }
      d = { ...d, decisions: [decision, ...d.decisions] }
      d = pushActivity(d, 'decision', decision.summary)
      break
    }
    case 'decision.superseded': {
      d = {
        ...d,
        decisions: d.decisions.map(dec => {
          if (dec.id === event.oldDecisionId)
            return { ...dec, status: 'superseded', supersededById: event.newDecisionId }
          return dec
        }),
      }
      break
    }
    case 'decision.archived': {
      d = { ...d, decisions: d.decisions.filter(dec => dec.id !== event.decisionId) }
      break
    }

    /* ── Observation events ───────────────────────────── */
    case 'observation.added': {
      if (d.observations.some(o => o.id === event.observationId)) break
      const obs: Observation = {
        id: event.observationId, content: event.content,
        taskId: null, sessionId: null, files: event.files ?? [],
        resolvedAt: null, createdAt: new Date().toISOString(),
      }
      d = { ...d, observations: [obs, ...d.observations] }
      d = pushActivity(d, 'observation', obs.content.slice(0, 120))
      break
    }
    case 'observation.resolved': {
      d = { ...d, observations: d.observations.filter(o => o.id !== event.observationId) }
      break
    }

    /* ── Signal events ────────────────────────────────── */
    case 'signal.created': {
      if (d.signals.recent.some(s => s.id === event.signalId)) break
      const sig: Signal = {
        id: event.signalId, type: event.type, content: event.content,
        source: event.source, status: 'pending',
        createdAt: new Date().toISOString(),
        deliveredAt: null, acknowledgedAt: null, agentResponse: null,
      }
      d = {
        ...d,
        signals: {
          recent: [sig, ...d.signals.recent].slice(0, 50),
          pending: [sig, ...d.signals.pending],
        },
      }
      d = pushActivity(d, 'signal', `[${sig.type}] ${sig.content.slice(0, 100)}`)
      break
    }
    case 'signal.acknowledged': {
      d = {
        ...d,
        signals: {
          recent: d.signals.recent.map(s =>
            s.id === event.signalId
              ? { ...s, status: 'acknowledged', acknowledgedAt: new Date().toISOString(), agentResponse: event.agentResponse ?? s.agentResponse }
              : s
          ),
          pending: d.signals.pending.filter(s => s.id !== event.signalId),
        },
      }
      break
    }

    /* ── Plan events ──────────────────────────────────── */
    case 'plan.created': {
      if (d.plans.some(p => p.id === event.planId)) break
      const plan: Plan = {
        id: event.planId, title: event.title, goal: event.goal ?? null,
        status: 'active', createdAt: new Date().toISOString(),
        steps: [],
      }
      d = { ...d, plans: [plan, ...d.plans] }
      d = pushActivity(d, 'plan', `Plan: ${plan.title} [active]`)
      break
    }
    case 'plan.status_changed': {
      const plans = d.plans.map(p =>
        p.id === event.planId ? { ...p, status: event.newStatus } : p
      ).filter(p => p.status !== 'archived')
      d = { ...d, plans }
      break
    }
    case 'plan.step_updated': {
      d = {
        ...d,
        plans: d.plans.map(p => {
          if (p.id !== event.planId) return p
          return {
            ...p,
            steps: p.steps.map(s =>
              s.id === event.stepId
                ? { ...s, status: event.newStatus, ...(event.content != null && { content: event.content }) }
                : s
            ),
          }
        }),
      }
      break
    }

    /* ── Session events ───────────────────────────────── */
    case 'session.started': {
      const session: Session & { ageMin: number } = {
        id: event.sessionId, projectId: event.projectId,
        startedAt: new Date().toISOString(), status: 'active',
        toolCalls: 0, branch: event.branch ?? null,
        ageMin: 0,
      }
      d = { ...d, session }
      d = pushActivity(d, 'session', `Session started${event.branch ? ` on ${event.branch}` : ''}`)
      break
    }
    case 'session.ended': {
      d = { ...d, session: null }
      d = pushActivity(d, 'session', `Session ended [${event.status}]`)
      break
    }

    /* ── Checkpoint / Handoff events ──────────────────── */
    case 'checkpoint.created': {
      const cp: Checkpoint & { ageMin: number } = {
        id: event.checkpointId, sessionId: event.sessionId,
        progress: event.progress, createdAt: new Date().toISOString(),
        ageMin: 0,
      }
      d = { ...d, checkpoint: cp }
      d = pushActivity(d, 'checkpoint', event.progress.slice(0, 120))
      break
    }
    case 'handoff.created': {
      const ho: Handoff = {
        id: event.handoffId, projectId: event.projectId,
        sessionId: event.sessionId, summary: event.summary,
        createdAt: new Date().toISOString(),
      }
      d = { ...d, lastHandoff: ho }
      d = pushActivity(d, 'handoff', event.summary.slice(0, 120))
      break
    }

    /* ── Question events ──────────────────────────────── */
    case 'question.asked': {
      if (d.questions.some(q => q.id === event.questionId)) break
      const q: Question = {
        id: event.questionId, text: event.text,
        createdAt: new Date().toISOString(),
      }
      d = { ...d, questions: [q, ...d.questions] }
      d = pushActivity(d, 'question', event.text.slice(0, 120))
      break
    }
    case 'question.answered': {
      d = {
        ...d,
        questions: d.questions.filter(q => q.id !== event.questionId),
      }
      break
    }

    /* ── Memory events ────────────────────────────────── */
    case 'memory.upserted': {
      if (!event.isUpdate) {
        d = { ...d, stats: { ...d.stats, chunks: d.stats.chunks + 1 } }
      }
      break
    }
  }

  return recalcHealth(d)
}

/* ── WebSocket API hook ────────────────────────────────────── */

export function useApiData() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const configRef = useRef(getProjectConfig())

  // Refresh ageMin every 60s
  useEffect(() => {
    const timer = setInterval(() => {
      setData(prev => {
        if (!prev) return prev
        return {
          ...prev,
          session: prev.session ? { ...prev.session, ageMin: minutesAgo(prev.session.startedAt) } : null,
          checkpoint: prev.checkpoint ? { ...prev.checkpoint, ageMin: minutesAgo(prev.checkpoint.createdAt) } : null,
        }
      })
    }, 60_000)
    return () => clearInterval(timer)
  }, [])

  const connect = useCallback(() => {
    const config = getProjectConfig()
    configRef.current = config
    if (!config) {
      setConnected(false)
      setData(null)
      return
    }

    const wsUrl = stripTrailingSlash(config.apiUrl).replace(/^http/, 'ws') + `/ws?projectId=${config.projectId}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      setError(null)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        // StateFullEvent — full state dump on connect
        if (msg.tasks !== undefined && msg.decisions !== undefined) {
          setData(buildDashboardData(msg as StateFullEvent, config.projectName))
        }
        // Granular event — patch state in-place
        else if (msg.$type) {
          setData(prev => prev ? patchDashboardData(prev, msg as GranularEvent) : prev)
        }
      } catch { /* ignore parse errors */ }
    }

    ws.onerror = () => {
      setConnected(false)
      setError('Connection error')
    }

    ws.onclose = () => {
      setConnected(false)
      setError('Connection lost — reconnecting...')
      wsRef.current = null
      reconnectTimer.current = setTimeout(connect, 3000)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
  }, [connect])

  // Expose reconnect for project config changes
  const reconnect = useCallback(() => {
    wsRef.current?.close()
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    setTimeout(connect, 100)
  }, [connect])

  return { data, error, connected, reconnect }
}

/* ── REST mutation helpers ─────────────────────────────────── */

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

function apiBase(): string {
  return stripTrailingSlash(getProjectConfig()?.apiUrl ?? DEFAULT_API_URL)
}

function projectPath(): string {
  const config = getProjectConfig()
  if (!config) throw new Error('No project configured')
  return `${stripTrailingSlash(config.apiUrl)}/api/projects/${config.projectId}`
}

export function authHeaders(): Record<string, string> {
  // Prefer session token over API key
  const auth = getAuthSession()
  if (auth?.token) return { Authorization: `Bearer ${auth.token}` }
  const config = getProjectConfig()
  return config?.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}
}

export function getAuthToken(): string | null {
  const auth = getAuthSession()
  if (auth?.token) return auth.token
  const config = getProjectConfig()
  return config?.apiKey ?? null
}

export async function sendSignal(type: string, content: string): Promise<boolean> {
  try {
    const res = await fetch(`${projectPath()}/signals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ type, content, source: 'web' }),
    })
    return res.ok
  } catch { return false }
}

export async function acknowledgeSignal(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${projectPath()}/signals/${id}/acknowledge`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({}),
    })
    return res.ok
  } catch { return false }
}

export async function addTask(title: string, description: string): Promise<boolean> {
  try {
    const res = await fetch(`${projectPath()}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ title, description }),
    })
    return res.ok
  } catch { return false }
}

export async function updateTaskStatus(
  taskId: string, status: string, outcome?: string
): Promise<boolean> {
  try {
    const res = await fetch(`${projectPath()}/tasks/${taskId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ status, outcome }),
    })
    return res.ok
  } catch { return false }
}

/* ── Workspace / Project discovery ─────────────────────────── */

export async function fetchWorkspaces(apiUrl: string): Promise<Array<{ id: string; name: string; slug: string }>> {
  const res = await fetch(`${stripTrailingSlash(apiUrl)}/api/workspaces`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function fetchProjects(apiUrl: string, workspaceId: string): Promise<Array<{ id: string; name: string; path?: string | null }>> {
  const res = await fetch(`${stripTrailingSlash(apiUrl)}/api/workspaces/${workspaceId}/projects`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function fetchWorkspaceOverview(apiUrl: string, workspaceId: string): Promise<import('@/types').WorkspaceOverview> {
  const res = await fetch(`${stripTrailingSlash(apiUrl)}/api/workspaces/${workspaceId}/overview`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
