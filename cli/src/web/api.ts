import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import {
  getActiveSession,
  getLastSession,
  getAllOpenTasks,
  getTasksByStatus,
  getAllDecisions,
  getActivePlans,
  getPlanSteps,
  getLastCheckpoint,
  getOpenQuestions,
  getChunkCount,
  addSignal,
  getRecentSignals,
  getUnacknowledgedSignals,
  markSignalAcknowledged,
  addTask,
  answerQuestion,
  findOpenQuestion,
  getOpenObservations,
  getTaskItemsByProject,
} from '../store/queries.js'
import { getBranch, getCommit } from '../utils/git.js'
import { getDb } from '../store/db.js'
import { rewriteTaskList } from '../store/markdown.js'
import type { Project } from '../types.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => {
      try { resolve(JSON.parse(body) as Record<string, unknown>) }
      catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

function jsonResponse(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data))
}

// ── Activity Feed ────────────────────────────────────────────────────────────

interface ActivityItem {
  type: string
  id: number
  summary: string
  created_at: string
}

function buildActivityFeed(projectId: number, limit = 25): ActivityItem[] {
  const db = getDb()
  return db.prepare(`
    SELECT 'checkpoint' AS type, id, progress AS summary, created_at FROM checkpoints WHERE project_id = ?
    UNION ALL
    SELECT 'task' AS type, id, title || ' [' || status || ']' AS summary, updated_at AS created_at FROM tasks WHERE project_id = ?
    UNION ALL
    SELECT 'decision' AS type, id, summary, created_at FROM decisions WHERE project_id = ?
    UNION ALL
    SELECT 'signal' AS type, id, '[' || UPPER(type) || '] ' || content AS summary, created_at FROM signals WHERE project_id = ?
    UNION ALL
    SELECT 'note' AS type, id, content AS summary, created_at FROM notes WHERE project_id = ? AND resolved_at IS NULL
    ORDER BY created_at DESC
    LIMIT ?
  `).all(projectId, projectId, projectId, projectId, projectId, limit) as unknown as ActivityItem[]
}

// ── API Data ─────────────────────────────────────────────────────────────────

export function buildApiData(project: Project, cwd: string) {
  const active      = getActiveSession(project.id)
  const last        = getLastSession(project.id)
  const open        = getAllOpenTasks(project.id)
  const done        = getTasksByStatus(project.id, 'done').slice(0, 10)
  const decisions   = getAllDecisions(project.id).slice(0, 20)
  const plans       = getActivePlans(project.id)
  const lastCp      = getLastCheckpoint(project.id)
  const questions   = getOpenQuestions(project.id)
  const chunkCount  = getChunkCount(project.id)
  const branch      = getBranch(cwd)
  const commit      = getCommit(cwd)
  const signals     = getRecentSignals(project.id, 20)
  const pendingSigs = getUnacknowledgedSignals(project.id)
  const activity    = buildActivityFeed(project.id, 30)
  const observations = getOpenObservations(project.id, 20)

  // Attach task items grouped by task_id
  const allItems    = getTaskItemsByProject(project.id)
  const itemsByTask: Record<number, typeof allItems> = {}
  for (const item of allItems) {
    if (!itemsByTask[item.task_id]) itemsByTask[item.task_id] = []
    itemsByTask[item.task_id].push(item)
  }

  const plansWithSteps = plans.map(p => ({
    ...p,
    steps: getPlanSteps(p.id),
  }))

  const cpAgeMin = lastCp
    ? Math.round((Date.now() - new Date(lastCp.created_at).getTime()) / 60_000)
    : null

  return {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
    },
    git: { branch, commit },
    session: active
      ? {
          id: active.id,
          started_at: active.started_at,
          branch: active.branch,
          context_read_at: active.context_read_at,
          ageMin: Math.round((Date.now() - new Date(active.started_at).getTime()) / 60_000),
        }
      : null,
    lastHandoff: last
      ? {
          ended_at: last.ended_at,
          handoff_note: last.handoff_note,
          files_touched: last.files_touched,
        }
      : null,
    tasks: {
      inProgress: open.filter(t => t.status === 'in-progress').map(t => ({ ...t, items: itemsByTask[t.id] ?? [] })),
      todo: open.filter(t => t.status === 'todo').map(t => ({ ...t, items: itemsByTask[t.id] ?? [] })),
      done: done.map(t => ({ ...t, items: itemsByTask[t.id] ?? [] })),
    },
    decisions,
    plans: plansWithSteps,
    checkpoint: lastCp ? { ...lastCp, ageMin: cpAgeMin } : null,
    questions,
    observations,
    signals: { recent: signals, pending: pendingSigs },
    activity,
    stats: { chunks: chunkCount },
    generatedAt: new Date().toISOString(),
  }
}

// ── SSE Endpoint ─────────────────────────────────────────────────────────────

export function handleSSE(
  req: IncomingMessage,
  res: ServerResponse,
  project: Project,
  cwd: string
): boolean {
  if (req.url !== '/api/events' || req.method !== 'GET') return false

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })

  // Send initial full state
  const initial = buildApiData(project, cwd)
  res.write(`event: full\ndata: ${JSON.stringify(initial)}\n\n`)

  let lastHash = createHash('md5').update(JSON.stringify(initial)).digest('hex')

  // Poll DB every 2 seconds and send only when changed
  const interval = setInterval(() => {
    try {
      const data = buildApiData(project, cwd)
      const json = JSON.stringify(data)
      const hash = createHash('md5').update(json).digest('hex')
      if (hash !== lastHash) {
        lastHash = hash
        res.write(`event: update\ndata: ${json}\n\n`)
      }
    } catch {
      // connection may be closed
    }
  }, 2000)

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n') } catch { /* closed */ }
  }, 15_000)

  req.on('close', () => {
    clearInterval(interval)
    clearInterval(heartbeat)
  })

  return true
}

// ── REST API ─────────────────────────────────────────────────────────────────

export function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  project: Project,
  cwd: string
): boolean {
  const url = req.url ?? '/'

  // GET /api/data — full dashboard state (backward compat)
  if (url === '/api/data' && req.method === 'GET') {
    try {
      const data = buildApiData(project, cwd)
      jsonResponse(res, 200, data)
    } catch (err) {
      jsonResponse(res, 500, { error: String(err) })
    }
    return true
  }

  // POST /api/signals — dispatch a signal to the agent
  if (url === '/api/signals' && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const content = String(body.content ?? '').trim()
      if (!content) { jsonResponse(res, 400, { error: 'content is required' }); return }
      const type = String(body.type ?? 'message')
      if (!['message', 'priority', 'abort', 'answer'].includes(type)) {
        jsonResponse(res, 400, { error: 'Invalid type' }); return
      }
      const signal = addSignal(project.id, content, type, 'web', body.metadata ? String(body.metadata) : null)
      jsonResponse(res, 201, signal)
    }).catch(err => { jsonResponse(res, 400, { error: String(err) }) })
    return true
  }

  // POST /api/tasks — quick-add a task from the dashboard
  if (url === '/api/tasks' && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const title = String(body.title ?? '').trim()
      if (!title) { jsonResponse(res, 400, { error: 'title is required' }); return }
      const description = body.description ? String(body.description).trim() : null
      const session = getActiveSession(project.id)
      const task = addTask(project.id, title, session?.id, getBranch(cwd), description)
      // Rewrite task list markdown
      const open = getAllOpenTasks(project.id)
      rewriteTaskList(
        cwd,
        open.filter(t => t.status === 'in-progress'),
        open.filter(t => t.status === 'todo'),
        getTasksByStatus(project.id, 'done')
      )
      jsonResponse(res, 201, task)
    }).catch(err => { jsonResponse(res, 400, { error: String(err) }) })
    return true
  }

  // POST /api/questions/:id/answer — answer an open question
  const qMatch = url.match(/^\/api\/questions\/(\d+)\/answer$/)
  if (qMatch && req.method === 'POST') {
    parseJsonBody(req).then(body => {
      const questionId = parseInt(qMatch[1], 10)
      const answer = String(body.answer ?? '').trim()
      if (!answer) { jsonResponse(res, 400, { error: 'answer is required' }); return }
      answerQuestion(questionId, answer)
      // Also send as a signal so the agent gets it in real-time
      addSignal(project.id, answer, 'answer', 'web', JSON.stringify({ question_id: questionId }))
      jsonResponse(res, 200, { ok: true, question_id: questionId })
    }).catch(err => { jsonResponse(res, 400, { error: String(err) }) })
    return true
  }

  // POST /api/signals/:id/acknowledge — acknowledge a signal from the dashboard
  const sigAckMatch = url.match(/^\/api\/signals\/(\d+)\/acknowledge$/)
  if (sigAckMatch && req.method === 'POST') {
    const signalId = parseInt(sigAckMatch[1], 10)
    try {
      markSignalAcknowledged(signalId)
      jsonResponse(res, 200, { ok: true, signal_id: signalId })
    } catch (err) {
      jsonResponse(res, 500, { error: String(err) })
    }
    return true
  }

  // CORS preflight for POST endpoints
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return true
  }

  return false
}
