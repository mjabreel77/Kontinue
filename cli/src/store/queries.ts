import { getDb } from './db.js'
import type { Checkpoint, Decision, Note, Plan, PlanStep, Project, Question, Session, Signal, Task, TaskItem } from '../types.js'

function lastId(rowid: number | bigint): number {
  return Number(rowid)
}

// ── Projects ─────────────────────────────────────────────────────────────────

export function findProjectByPath(path: string): Project | undefined {
  return getDb().prepare('SELECT * FROM projects WHERE LOWER(path) = LOWER(?)').get(path) as unknown as Project | undefined
}

export function createProject(name: string, path: string, description?: string): Project {
  const db = getDb()
  const info = db.prepare(
    'INSERT INTO projects (name, path, description) VALUES (?, ?, ?)'
  ).run(name, path, description ?? null)
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(lastId(info.lastInsertRowid)) as unknown as Project
}

export function deleteProject(projectId: number): void {
  // Cascade: memory_chunks, decisions, notes, tasks, sessions are all FK'd to project
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(projectId)
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export function startSession(projectId: number, branch?: string | null, commit?: string | null): Session {
  const db = getDb()
  const info = db.prepare(
    'INSERT INTO sessions (project_id, branch, start_commit) VALUES (?, ?, ?)'
  ).run(projectId, branch ?? null, commit ?? null)
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(lastId(info.lastInsertRowid)) as unknown as Session
}

export function endSession(sessionId: number, handoffNote: string, blockers: string, endCommit?: string | null): void {
  getDb().prepare(`
    UPDATE sessions SET ended_at = datetime('now'), handoff_note = ?, blockers = ?, end_commit = ? WHERE id = ?
  `).run(handoffNote, blockers, endCommit ?? null, sessionId)
}

export function getActiveSession(projectId: number): Session | undefined {
  return getDb().prepare(
    'SELECT * FROM sessions WHERE project_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
  ).get(projectId) as unknown as Session | undefined
}

export function getLastSession(projectId: number): Session | undefined {
  return getDb().prepare(
    'SELECT * FROM sessions WHERE project_id = ? AND ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 1'
  ).get(projectId) as unknown as Session | undefined
}

/** Close any sessions that have been open for more than `thresholdHours` with no handoff.
 *  Returns the number of sessions closed. */
export function closeStaleSessions(projectId: number, thresholdHours = 2): number {
  const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000).toISOString()
  const result = getDb().prepare(`
    UPDATE sessions
    SET ended_at = datetime('now'),
        handoff_note = 'Session closed automatically — context overflow or unexpected exit. No handoff was written.'
    WHERE project_id = ? AND ended_at IS NULL AND started_at < ?
  `).run(projectId, cutoff)
  return Number(result.changes)
}

export function markContextRead(sessionId: number): void {
  getDb().prepare(
    "UPDATE sessions SET context_read_at = datetime('now') WHERE id = ?"
  ).run(sessionId)
}

/** Get a summary of changes since the last read_context call. */
export interface ContextDiff {
  newTasks:       Array<{ id: number; title: string }>
  completedTasks: Array<{ id: number; title: string }>
  newDecisions:   Array<{ id: number; summary: string }>
  newObservations: Array<{ id: number; content: string }>
  newSignals:     number
  newCheckpoints: number
}

export function getChangesSinceRead(projectId: number, since: string): ContextDiff {
  const db = getDb()
  const newTasks = db.prepare(
    'SELECT id, title FROM tasks WHERE project_id = ? AND created_at > ? ORDER BY created_at DESC'
  ).all(projectId, since) as unknown as Array<{ id: number; title: string }>

  const completedTasks = db.prepare(
    "SELECT id, title FROM tasks WHERE project_id = ? AND status = 'done' AND updated_at > ? ORDER BY updated_at DESC"
  ).all(projectId, since) as unknown as Array<{ id: number; title: string }>

  const newDecisions = db.prepare(
    'SELECT id, summary FROM decisions WHERE project_id = ? AND created_at > ? ORDER BY created_at DESC'
  ).all(projectId, since) as unknown as Array<{ id: number; summary: string }>

  const newObservations = db.prepare(
    'SELECT id, content FROM notes WHERE project_id = ? AND created_at > ? ORDER BY created_at DESC'
  ).all(projectId, since) as unknown as Array<{ id: number; content: string }>

  const sigRow = db.prepare(
    'SELECT COUNT(*) as n FROM signals WHERE project_id = ? AND created_at > ?'
  ).get(projectId, since) as { n: number }

  const cpRow = db.prepare(
    'SELECT COUNT(*) as n FROM checkpoints WHERE session_id IN (SELECT id FROM sessions WHERE project_id = ?) AND created_at > ?'
  ).get(projectId, since) as { n: number }

  return {
    newTasks,
    completedTasks,
    newDecisions,
    newObservations,
    newSignals: sigRow.n,
    newCheckpoints: cpRow.n,
  }
}

export function incrementToolCalls(sessionId: number): void {
  getDb().prepare(
    'UPDATE sessions SET tool_calls = COALESCE(tool_calls, 0) + 1 WHERE id = ?'
  ).run(sessionId)
}

export function getSessionToolCalls(sessionId: number): number {
  const row = getDb().prepare(
    'SELECT COALESCE(tool_calls, 0) as n FROM sessions WHERE id = ?'
  ).get(sessionId) as { n: number } | undefined
  return row?.n ?? 0
}

/** Returns decisions without rationale for a project. */
export function getDecisionsWithoutRationale(projectId: number): Decision[] {
  return getDb().prepare(
    'SELECT * FROM decisions WHERE project_id = ? AND (rationale IS NULL OR rationale = \'\') ORDER BY created_at DESC'
  ).all(projectId) as unknown as Decision[]
}

/** Returns tasks without description for a project. */
export function getTasksWithoutDescription(projectId: number): Task[] {
  return getDb().prepare(
    "SELECT * FROM tasks WHERE project_id = ? AND (description IS NULL OR description = '') AND status != 'abandoned' ORDER BY created_at DESC"
  ).all(projectId) as unknown as Task[]
}

/** Returns sessions that ended without a handoff note. */
export function getSessionsWithoutHandoff(projectId: number): Session[] {
  return getDb().prepare(
    "SELECT * FROM sessions WHERE project_id = ? AND ended_at IS NOT NULL AND (handoff_note IS NULL OR handoff_note = '') ORDER BY ended_at DESC LIMIT 10"
  ).all(projectId) as unknown as Session[]
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function addTask(projectId: number, title: string, sessionId?: number, branch?: string | null, description?: string | null): Task {
  const db = getDb()
  const info = db.prepare(
    'INSERT INTO tasks (project_id, session_id, title, branch, description) VALUES (?, ?, ?, ?, ?)'
  ).run(projectId, sessionId ?? null, title, branch ?? null, description ?? null)
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(lastId(info.lastInsertRowid)) as unknown as Task
}

export function updateTaskOutcome(taskId: number, outcome: string): void {
  getDb().prepare(`
    UPDATE tasks SET outcome = ?, updated_at = datetime('now') WHERE id = ?
  `).run(outcome, taskId)
}

export function updateTaskStatus(taskId: number, status: Task['status']): void {
  getDb().prepare(`
    UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?
  `).run(status, taskId)
}

export function findTaskByTitle(projectId: number, title: string): Task | undefined {
  return getDb().prepare(
    "SELECT * FROM tasks WHERE project_id = ? AND title LIKE ? AND status NOT IN ('done','abandoned') LIMIT 1"
  ).get(projectId, `%${title}%`) as unknown as Task | undefined
}

export function getTasksByStatus(projectId: number, status: Task['status']): Task[] {
  return getDb().prepare(
    'SELECT * FROM tasks WHERE project_id = ? AND status = ? ORDER BY updated_at DESC'
  ).all(projectId, status) as unknown as Task[]
}

export function getAllOpenTasks(projectId: number): Task[] {
  return getDb().prepare(
    "SELECT * FROM tasks WHERE project_id = ? AND status IN ('todo','in-progress') ORDER BY status DESC, updated_at DESC"
  ).all(projectId) as unknown as Task[]
}

export function getStaleInProgressTasks(projectId: number, thresholdHours = 2): Task[] {
  const cutoff = new Date(Date.now() - thresholdHours * 3_600_000).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
  return getDb().prepare(
    "SELECT * FROM tasks WHERE project_id = ? AND status = 'in-progress' AND updated_at < ? ORDER BY updated_at ASC"
  ).all(projectId, cutoff) as unknown as Task[]
}

// ── Decisions ─────────────────────────────────────────────────────────────────

export function addDecision(
  projectId: number,
  summary: string,
  rationale?: string,
  alternatives?: string,
  sessionId?: number,
  branch?: string | null,
  commit?: string | null,
  context?: string,
  files?: string,
  tags?: string,
  taskId?: number | null,
  scope?: 'project' | 'task'
): Decision {
  const db = getDb()
  const info = db.prepare(
    'INSERT INTO decisions (project_id, session_id, task_id, summary, rationale, alternatives, branch, git_commit, context, files, tags, scope) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(projectId, sessionId ?? null, taskId ?? null, summary, rationale ?? null, alternatives ?? null, branch ?? null, commit ?? null, context ?? null, files ?? null, tags ?? null, scope ?? 'project')
  return db.prepare('SELECT * FROM decisions WHERE id = ?').get(lastId(info.lastInsertRowid)) as unknown as Decision
}

export function getDecisionsByTask(taskId: number): Decision[] {
  return getDb().prepare(
    'SELECT * FROM decisions WHERE task_id = ? ORDER BY created_at ASC'
  ).all(taskId) as unknown as Decision[]
}

export function getRecentDecisions(projectId: number, limit = 5): Decision[] {
  return getDb().prepare(
    'SELECT * FROM decisions WHERE project_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(projectId, limit) as unknown as Decision[]
}

export function getAllDecisions(projectId: number): Decision[] {
  return getDb().prepare(
    'SELECT * FROM decisions WHERE project_id = ? ORDER BY created_at DESC'
  ).all(projectId) as unknown as Decision[]
}

/** Returns only active (non-superseded, non-archived) decisions. */
export function getActiveDecisions(projectId: number, limit = 20): Decision[] {
  return getDb().prepare(
    "SELECT * FROM decisions WHERE project_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT ?"
  ).all(projectId, limit) as unknown as Decision[]
}

/** Mark a decision as superseded by a newer one. */
export function supersedeDecision(decisionId: number, supersededById: number): void {
  getDb().prepare(
    "UPDATE decisions SET status = 'superseded', superseded_by = ? WHERE id = ?"
  ).run(supersededById, decisionId)
}

/** Archive a decision (no longer relevant, not superseded). */
export function archiveDecision(decisionId: number): void {
  getDb().prepare(
    "UPDATE decisions SET status = 'archived' WHERE id = ?"
  ).run(decisionId)
}

/** Archive all task-scoped decisions linked to a task and remove their memory chunks. */
export function archiveTaskScopedDecisions(projectId: number, taskId: number): number {
  const db = getDb()
  const decisions = db.prepare(
    "SELECT id FROM decisions WHERE task_id = ? AND scope = 'task' AND status = 'active'"
  ).all(taskId) as Array<{ id: number }>
  for (const d of decisions) {
    db.prepare("UPDATE decisions SET status = 'archived' WHERE id = ?").run(d.id)
    db.prepare("DELETE FROM memory_chunks WHERE project_id = ? AND source_type = 'decision' AND source_id = ?").run(projectId, d.id)
  }
  return decisions.length
}

/** Build decision lineage chains. Returns chains ordered by newest decision. */
export interface DecisionChainNode {
  id: number
  summary: string
  status: string
  created_at: string
  superseded_by: number | null
  tags: string | null
}

export function getDecisionChains(projectId: number): DecisionChainNode[][] {
  const db = getDb()
  const all = db.prepare(
    'SELECT id, summary, status, created_at, superseded_by, tags FROM decisions WHERE project_id = ? ORDER BY created_at DESC'
  ).all(projectId) as unknown as DecisionChainNode[]

  // Build lookup maps
  const byId = new Map<number, DecisionChainNode>()
  const supersededIds = new Set<number>()
  for (const d of all) {
    byId.set(d.id, d)
    if (d.superseded_by) supersededIds.add(d.id)
  }

  // Find chain heads (decisions that have been superseded — walk from root)
  // A chain root is a superseded decision that was NOT itself a replacement
  const visited = new Set<number>()
  const chains: DecisionChainNode[][] = []

  for (const d of all) {
    if (visited.has(d.id)) continue
    if (!d.superseded_by && !supersededIds.has(d.id)) continue // standalone, no chain

    // Walk backwards to find root
    let root = d
    while (true) {
      const parent = all.find(p => p.superseded_by === root.id)
      if (parent && !visited.has(parent.id)) { root = parent } else break
    }

    // Walk forward from root
    const chain: DecisionChainNode[] = []
    let current: DecisionChainNode | undefined = root
    while (current) {
      if (visited.has(current.id)) break
      visited.add(current.id)
      chain.push(current)
      current = current.superseded_by ? byId.get(current.superseded_by) : undefined
    }
    if (chain.length > 1) chains.push(chain)
  }

  return chains
}

/** Returns decisions created on or after the given ISO timestamp. */
export function getDecisionsSince(projectId: number, since: string): Decision[] {
  return getDb().prepare(
    "SELECT * FROM decisions WHERE project_id = ? AND created_at >= ? ORDER BY created_at DESC"
  ).all(projectId, since) as unknown as Decision[]
}

/** Returns completed sessions (with handoff notes) ended on or after the given ISO timestamp. */
export function getSessionsSince(projectId: number, since: string): Session[] {
  return getDb().prepare(
    "SELECT * FROM sessions WHERE project_id = ? AND ended_at IS NOT NULL AND ended_at >= ? ORDER BY ended_at DESC"
  ).all(projectId, since) as unknown as Session[]
}

/** Returns tasks completed (status='done') with updated_at on or after the given ISO timestamp. */
export function getTasksDoneSince(projectId: number, since: string): Task[] {
  return getDb().prepare(
    "SELECT * FROM tasks WHERE project_id = ? AND status = 'done' AND updated_at >= ? ORDER BY updated_at DESC"
  ).all(projectId, since) as unknown as Task[]
}

/** Returns unresolved notes/observations created on or after the given ISO timestamp. */
export function getObservationsSince(projectId: number, since: string): Note[] {
  return getDb().prepare(
    'SELECT * FROM notes WHERE project_id = ? AND resolved_at IS NULL AND created_at >= ? ORDER BY created_at DESC'
  ).all(projectId, since) as unknown as Note[]
}

/** Returns all questions (open or resolved) created on or after the given ISO timestamp. */
export function getQuestionsSince(projectId: number, since: string): Question[] {
  return getDb().prepare(
    'SELECT * FROM questions WHERE project_id = ? AND created_at >= ? ORDER BY created_at ASC'
  ).all(projectId, since) as unknown as Question[]
}

// -- Notes -------------------------------------------------------------------

export function addNote(projectId: number, content: string, sessionId?: number, taskId?: number | null): Note {
  const db = getDb()
  const info = db.prepare(
    'INSERT INTO notes (project_id, session_id, task_id, content) VALUES (?, ?, ?, ?)'
  ).run(projectId, sessionId ?? null, taskId ?? null, content)
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(lastId(info.lastInsertRowid)) as unknown as Note
}

export function getNotesByTask(taskId: number): Note[] {
  return getDb().prepare(
    'SELECT * FROM notes WHERE task_id = ? ORDER BY created_at ASC'
  ).all(taskId) as unknown as Note[]
}

/** Mark a note/observation as resolved (addressed, no longer relevant). */
export function resolveNote(noteId: number): void {
  getDb().prepare(
    "UPDATE notes SET resolved_at = datetime('now') WHERE id = ?"
  ).run(noteId)
}

/** Find a note by partial content match (unresolved only). */
export function findUnresolvedNote(projectId: number, partial: string): Note | undefined {
  const lower = partial.toLowerCase()
  const notes = getDb().prepare(
    'SELECT * FROM notes WHERE project_id = ? AND resolved_at IS NULL ORDER BY created_at DESC'
  ).all(projectId) as unknown as Note[]
  return notes.find(n => n.content.toLowerCase().includes(lower))
}

/** Get all unresolved observations/notes for a project. */
export function getOpenObservations(projectId: number, limit = 20): Note[] {
  return getDb().prepare(
    'SELECT * FROM notes WHERE project_id = ? AND resolved_at IS NULL ORDER BY created_at DESC LIMIT ?'
  ).all(projectId, limit) as unknown as Note[]
}

/** Get all task items for all tasks in a project, grouped by task_id. */
export function getTaskItemsByProject(projectId: number): TaskItem[] {
  return getDb().prepare(`
    SELECT ti.* FROM task_items ti
    JOIN tasks t ON t.id = ti.task_id
    WHERE t.project_id = ?
    ORDER BY ti.task_id ASC, ti.created_at ASC
  `).all(projectId) as unknown as TaskItem[]
}

// -- Task items (checklist) ---------------------------------------------------

export function addTaskItems(taskId: number, items: string[]): TaskItem[] {
  const db = getDb()
  return items.map(content => {
    const info = db.prepare(
      'INSERT INTO task_items (task_id, content) VALUES (?, ?)'
    ).run(taskId, content.trim())
    return db.prepare('SELECT * FROM task_items WHERE id = ?').get(lastId(info.lastInsertRowid)) as unknown as TaskItem
  })
}

export function getTaskItems(taskId: number): TaskItem[] {
  return getDb().prepare(
    'SELECT * FROM task_items WHERE task_id = ? ORDER BY created_at ASC'
  ).all(taskId) as unknown as TaskItem[]
}

export function checkTaskItem(itemId: number, done: boolean): void {
  getDb().prepare('UPDATE task_items SET done = ? WHERE id = ?').run(done ? 1 : 0, itemId)
}

export function findTaskItemByContent(taskId: number, content: string): TaskItem | undefined {
  const lower = content.toLowerCase()
  const items = getTaskItems(taskId)
  return items.find(i => i.content.toLowerCase().includes(lower))
}

export function deleteTaskItem(itemId: number): void {
  getDb().prepare('DELETE FROM task_items WHERE id = ?').run(itemId)
}

// -- Task Dependencies --------------------------------------------------------

export interface TaskDependency {
  id: number
  blocker_task_id: number
  blocked_task_id: number
  created_at: string
}

/** Declare that blockerTaskId must be completed before blockedTaskId can start. */
export function addDependency(blockerTaskId: number, blockedTaskId: number): TaskDependency {
  const db = getDb()
  const info = db.prepare(
    'INSERT OR IGNORE INTO task_dependencies (blocker_task_id, blocked_task_id) VALUES (?, ?)'
  ).run(blockerTaskId, blockedTaskId)
  return db.prepare('SELECT * FROM task_dependencies WHERE blocker_task_id = ? AND blocked_task_id = ?').get(blockerTaskId, blockedTaskId) as unknown as TaskDependency
}

/** Remove a dependency relationship. */
export function removeDependency(blockerTaskId: number, blockedTaskId: number): void {
  getDb().prepare('DELETE FROM task_dependencies WHERE blocker_task_id = ? AND blocked_task_id = ?').run(blockerTaskId, blockedTaskId)
}

/** Get tasks that block the given task (must be done before this task can proceed). */
export function getBlockers(taskId: number): Task[] {
  return getDb().prepare(
    `SELECT t.* FROM tasks t
     JOIN task_dependencies d ON d.blocker_task_id = t.id
     WHERE d.blocked_task_id = ?`
  ).all(taskId) as unknown as Task[]
}

/** Get tasks that are blocked by the given task (waiting for this task to finish). */
export function getBlockedBy(taskId: number): Task[] {
  return getDb().prepare(
    `SELECT t.* FROM tasks t
     JOIN task_dependencies d ON d.blocked_task_id = t.id
     WHERE d.blocker_task_id = ?`
  ).all(taskId) as unknown as Task[]
}

/** Get all unresolved blockers for a task (blockers that are not yet done/abandoned). */
export function getUnresolvedBlockers(taskId: number): Task[] {
  return getDb().prepare(
    `SELECT t.* FROM tasks t
     JOIN task_dependencies d ON d.blocker_task_id = t.id
     WHERE d.blocked_task_id = ? AND t.status NOT IN ('done', 'abandoned')`
  ).all(taskId) as unknown as Task[]
}

/** Get all dependency pairs for a project (for dashboard display). */
export function getAllDependencies(projectId: number): TaskDependency[] {
  return getDb().prepare(
    `SELECT d.* FROM task_dependencies d
     JOIN tasks t1 ON t1.id = d.blocker_task_id
     JOIN tasks t2 ON t2.id = d.blocked_task_id
     WHERE t1.project_id = ? AND t2.project_id = ?`
  ).all(projectId, projectId) as unknown as TaskDependency[]
}

// -- Task Templates -----------------------------------------------------------

export interface TaskTemplate {
  id: number
  project_id: number
  name: string
  description: string | null
  default_items: string | null  // JSON array of strings
  created_at: string
}

/** Create or replace a task template. */
export function createTemplate(projectId: number, name: string, description?: string | null, defaultItems?: string[]): TaskTemplate {
  const db = getDb()
  const itemsJson = defaultItems && defaultItems.length > 0 ? JSON.stringify(defaultItems) : null
  db.prepare(
    'INSERT OR REPLACE INTO task_templates (project_id, name, description, default_items) VALUES (?, ?, ?, ?)'
  ).run(projectId, name, description ?? null, itemsJson)
  return db.prepare('SELECT * FROM task_templates WHERE project_id = ? AND name = ?').get(projectId, name) as unknown as TaskTemplate
}

/** List all templates for a project. */
export function getTemplates(projectId: number): TaskTemplate[] {
  return getDb().prepare('SELECT * FROM task_templates WHERE project_id = ? ORDER BY name').all(projectId) as unknown as TaskTemplate[]
}

/** Find a template by partial name match. */
export function findTemplateByName(projectId: number, name: string): TaskTemplate | undefined {
  const lower = name.toLowerCase()
  const templates = getTemplates(projectId)
  return templates.find(t => t.name.toLowerCase().includes(lower))
}

/** Delete a template by id. */
export function deleteTemplate(templateId: number): void {
  getDb().prepare('DELETE FROM task_templates WHERE id = ?').run(templateId)
}

// -- Velocity metrics ---------------------------------------------------------

export interface TimelineEvent {
  type: 'checkpoint' | 'task' | 'decision' | 'signal' | 'observation'
  id: number
  summary: string
  created_at: string
  detail: string | null
}

/** Get a chronological timeline of events for a session (or project-wide since a timestamp). */
export function getSessionTimeline(projectId: number, since: string, limit = 100): TimelineEvent[] {
  const db = getDb()
  return db.prepare(`
    SELECT 'checkpoint' AS type, id, progress AS summary, created_at, next_step AS detail FROM checkpoints
      WHERE project_id = ? AND created_at >= ?
    UNION ALL
    SELECT 'task' AS type, id, title || ' → ' || status AS summary, updated_at AS created_at, outcome AS detail FROM tasks
      WHERE project_id = ? AND updated_at >= ?
    UNION ALL
    SELECT 'decision' AS type, id, summary, created_at, rationale AS detail FROM decisions
      WHERE project_id = ? AND created_at >= ?
    UNION ALL
    SELECT 'signal' AS type, id, '[' || UPPER(type) || '] ' || content AS summary, created_at, agent_response AS detail FROM signals
      WHERE project_id = ? AND created_at >= ?
    UNION ALL
    SELECT 'observation' AS type, id, content AS summary, created_at, NULL AS detail FROM notes
      WHERE project_id = ? AND created_at >= ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(projectId, since, projectId, since, projectId, since, projectId, since, projectId, since, limit) as unknown as TimelineEvent[]
}

export interface VelocityMetrics {
  totalSessions: number
  totalTasksDone: number
  tasksPerSession: number
  avgCycleTimeMinutes: number | null  // avg time from task created_at to updated_at for done tasks
  totalCheckpoints: number
  checkpointsPerSession: number
  totalDecisions: number
  decisionsPerSession: number
  recentSessionCount: number  // sessions in last 7 days
  recentTasksDone: number     // tasks done in last 7 days
}

export function getVelocityMetrics(projectId: number): VelocityMetrics {
  const db = getDb()
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()

  const totalSessions = (db.prepare(
    'SELECT COUNT(*) as n FROM sessions WHERE project_id = ?'
  ).get(projectId) as { n: number }).n

  const totalTasksDone = (db.prepare(
    "SELECT COUNT(*) as n FROM tasks WHERE project_id = ? AND status = 'done'"
  ).get(projectId) as { n: number }).n

  const avgCycleRow = db.prepare(
    "SELECT AVG((julianday(updated_at) - julianday(created_at)) * 1440) as avg_min FROM tasks WHERE project_id = ? AND status = 'done'"
  ).get(projectId) as { avg_min: number | null }

  const totalCheckpoints = (db.prepare(
    'SELECT COUNT(*) as n FROM checkpoints WHERE session_id IN (SELECT id FROM sessions WHERE project_id = ?)'
  ).get(projectId) as { n: number }).n

  const totalDecisions = (db.prepare(
    'SELECT COUNT(*) as n FROM decisions WHERE project_id = ?'
  ).get(projectId) as { n: number }).n

  const recentSessionCount = (db.prepare(
    'SELECT COUNT(*) as n FROM sessions WHERE project_id = ? AND started_at >= ?'
  ).get(projectId, sevenDaysAgo) as { n: number }).n

  const recentTasksDone = (db.prepare(
    "SELECT COUNT(*) as n FROM tasks WHERE project_id = ? AND status = 'done' AND updated_at >= ?"
  ).get(projectId, sevenDaysAgo) as { n: number }).n

  return {
    totalSessions,
    totalTasksDone,
    tasksPerSession: totalSessions > 0 ? Math.round((totalTasksDone / totalSessions) * 10) / 10 : 0,
    avgCycleTimeMinutes: avgCycleRow.avg_min !== null ? Math.round(avgCycleRow.avg_min) : null,
    totalCheckpoints,
    checkpointsPerSession: totalSessions > 0 ? Math.round((totalCheckpoints / totalSessions) * 10) / 10 : 0,
    totalDecisions,
    decisionsPerSession: totalSessions > 0 ? Math.round((totalDecisions / totalSessions) * 10) / 10 : 0,
    recentSessionCount,
    recentTasksDone,
  }
}

// -- Replay data --------------------------------------------------------------

export interface ReplaySession {
  id: number
  started_at: string
  ended_at: string | null
  handoff_note: string | null
  events: TimelineEvent[]
}

/** Get past sessions with their events for replay mode. Returns most recent `limit` sessions. */
export function getReplaySessions(projectId: number, limit = 10): ReplaySession[] {
  const db = getDb()
  const sessions = db.prepare(
    `SELECT id, started_at, ended_at, handoff_note FROM sessions
     WHERE project_id = ? AND ended_at IS NOT NULL
     ORDER BY started_at DESC LIMIT ?`
  ).all(projectId, limit) as unknown as { id: number; started_at: string; ended_at: string | null; handoff_note: string | null }[]

  return sessions.map(s => {
    const events = db.prepare(`
      SELECT 'checkpoint' AS type, id, progress AS summary, created_at, next_step AS detail FROM checkpoints
        WHERE session_id = ?
      UNION ALL
      SELECT 'decision' AS type, id, summary, created_at, rationale AS detail FROM decisions
        WHERE session_id = ?
      UNION ALL
      SELECT 'observation' AS type, id, content AS summary, created_at, NULL AS detail FROM notes
        WHERE session_id = ?
      ORDER BY created_at ASC
    `).all(s.id, s.id, s.id) as unknown as TimelineEvent[]

    return { ...s, events }
  })
}

// -- External links (GitHub / Linear) -----------------------------------------

export interface ExternalLink {
  id: number
  project_id: number
  task_id: number
  provider: string
  external_id: string
  external_url: string | null
  synced_at: string
}

export function linkTaskToExternal(
  projectId: number,
  taskId: number,
  provider: 'github' | 'linear',
  externalId: string,
  externalUrl: string | null
): ExternalLink {
  const db = getDb()
  db.prepare(`
    INSERT INTO external_links (project_id, task_id, provider, external_id, external_url)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(task_id, provider) DO UPDATE SET external_id = excluded.external_id,
      external_url = excluded.external_url, synced_at = datetime('now')
  `).run(projectId, taskId, provider, externalId, externalUrl)
  return db.prepare(
    'SELECT * FROM external_links WHERE task_id = ? AND provider = ?'
  ).get(taskId, provider) as unknown as ExternalLink
}

export function getExternalLink(taskId: number, provider: 'github' | 'linear'): ExternalLink | undefined {
  return getDb().prepare(
    'SELECT * FROM external_links WHERE task_id = ? AND provider = ?'
  ).get(taskId, provider) as unknown as ExternalLink | undefined
}

export function getExternalLinksForProject(projectId: number): ExternalLink[] {
  return getDb().prepare(
    'SELECT * FROM external_links WHERE project_id = ? ORDER BY synced_at DESC'
  ).all(projectId) as unknown as ExternalLink[]
}

export function unlinkTaskExternal(taskId: number, provider: 'github' | 'linear'): void {
  getDb().prepare('DELETE FROM external_links WHERE task_id = ? AND provider = ?').run(taskId, provider)
}

// -- Memory chunks ------------------------------------------------------------

export function upsertChunk(
  projectId: number,
  sourceType: string,
  sourceId: number,
  content: string
): void {
  // INSERT OR REPLACE updates content when the same (project_id, source_type, source_id)
  // already exists (e.g. task chunk updated on completion).
  // INSERT OR IGNORE would silently skip — but REPLACE ensures the latest content wins.
  // Using the old-style conflict clause because node:sqlite doesn't reliably handle
  // the newer "ON CONFLICT DO NOTHING" upsert syntax.
  getDb().prepare(`
    INSERT OR REPLACE INTO memory_chunks (project_id, source_type, source_id, content)
    VALUES (?, ?, ?, ?)
  `).run(projectId, sourceType, sourceId, content)
}

export function getAllChunks(projectId: number): Array<{ id: number; content: string; source_type: string; source_id: number; created_at?: string; decay_exempt?: number }> {
  return getDb().prepare(
    'SELECT id, content, source_type, source_id, created_at, decay_exempt FROM memory_chunks WHERE project_id = ? ORDER BY created_at DESC'
  ).all(projectId) as unknown as Array<{ id: number; content: string; source_type: string; source_id: number; created_at?: string; decay_exempt?: number }>
}

/** Default stale threshold in days — chunks older than this are flagged. */
export const STALE_AFTER_DAYS = 30

/** Count non-exempt chunks older than the stale threshold. */
export function getStaleChunkCount(projectId: number, days = STALE_AFTER_DAYS): number {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
  const row = getDb().prepare(
    'SELECT COUNT(*) as n FROM memory_chunks WHERE project_id = ? AND created_at < ? AND decay_exempt = 0'
  ).get(projectId, cutoff) as { n: number }
  return row.n
}

/** Mark a chunk as exempt from decay (e.g. architecture decisions, identity). */
export function setChunkDecayExempt(projectId: number, sourceType: string, sourceId: number, exempt: boolean): void {
  getDb().prepare(
    'UPDATE memory_chunks SET decay_exempt = ? WHERE project_id = ? AND source_type = ? AND source_id = ?'
  ).run(exempt ? 1 : 0, projectId, sourceType, sourceId)
}

export function getChunkCount(projectId: number): number {
  const row = getDb().prepare(
    'SELECT COUNT(*) as n FROM memory_chunks WHERE project_id = ?'
  ).get(projectId) as { n: number }
  return row.n
}

/** Get non-exempt chunks created during a session's lifetime for compression. */
export function getSessionChunksForCompression(
  projectId: number,
  sessionStartedAt: string,
): Array<{ id: number; content: string; source_type: string; source_id: number; created_at: string }> {
  return getDb().prepare(`
    SELECT id, content, source_type, source_id, created_at
    FROM memory_chunks
    WHERE project_id = ? AND created_at >= ? AND decay_exempt = 0
    ORDER BY source_type, created_at ASC
  `).all(projectId, sessionStartedAt) as unknown as Array<{ id: number; content: string; source_type: string; source_id: number; created_at: string }>
}

/** Delete specific chunks by id (used during compression). */
export function deleteChunksByIds(ids: number[]): void {
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(',')
  getDb().prepare(`DELETE FROM memory_chunks WHERE id IN (${placeholders})`).run(...ids)
}

/** Check if FTS5 virtual table exists (cached per process). */
let _ftsAvailable: boolean | null = null
function ftsAvailable(): boolean {
  if (_ftsAvailable !== null) return _ftsAvailable
  try {
    const row = getDb().prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='memory_chunks_fts'"
    ).get()
    _ftsAvailable = !!row
  } catch {
    _ftsAvailable = false
  }
  return _ftsAvailable
}

/** Search memory chunks using FTS5 ranked search (BM25), with LIKE fallback. */
export function searchChunks(
  projectId: number,
  keyword: string,
  sourceType?: string,
  limit = 20
): Array<{ id: number; content: string; source_type: string; source_id: number; created_at?: string }> {
  const terms = keyword.split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []

  // Try FTS5 ranked search first
  if (ftsAvailable()) {
    try {
      // Quote each word as a literal FTS5 term, join with OR
      const ftsQuery = terms.map(t => `"${t.replace(/"/g, '""')}"`).join(' OR ')

      if (sourceType) {
        return getDb().prepare(`
          SELECT mc.id, mc.content, mc.source_type, mc.source_id, mc.created_at
          FROM memory_chunks_fts fts
          JOIN memory_chunks mc ON mc.id = fts.rowid
          WHERE fts.content MATCH ? AND mc.project_id = ? AND mc.source_type = ?
          ORDER BY fts.rank
          LIMIT ?
        `).all(ftsQuery, projectId, sourceType, limit) as unknown as Array<{ id: number; content: string; source_type: string; source_id: number; created_at?: string }>
      }
      return getDb().prepare(`
        SELECT mc.id, mc.content, mc.source_type, mc.source_id, mc.created_at
        FROM memory_chunks_fts fts
        JOIN memory_chunks mc ON mc.id = fts.rowid
        WHERE fts.content MATCH ? AND mc.project_id = ?
        ORDER BY fts.rank
        LIMIT ?
      `).all(ftsQuery, projectId, limit) as unknown as Array<{ id: number; content: string; source_type: string; source_id: number; created_at?: string }>
    } catch {
      // FTS query failed — fall through to LIKE
    }
  }

  // Fallback: LIKE substring match
  if (sourceType) {
    return getDb().prepare(
      'SELECT id, content, source_type, source_id, created_at FROM memory_chunks WHERE project_id = ? AND source_type = ? AND content LIKE ? ORDER BY created_at DESC LIMIT ?'
    ).all(projectId, sourceType, `%${keyword}%`, limit) as unknown as Array<{ id: number; content: string; source_type: string; source_id: number; created_at?: string }>
  }
  return getDb().prepare(
    'SELECT id, content, source_type, source_id, created_at FROM memory_chunks WHERE project_id = ? AND content LIKE ? ORDER BY created_at DESC LIMIT ?'
  ).all(projectId, `%${keyword}%`, limit) as unknown as Array<{ id: number; content: string; source_type: string; source_id: number; created_at?: string }>
}

/** Delete memory chunk by source. Used when archiving/superseding decisions. */
export function deleteChunk(projectId: number, sourceType: string, sourceId: number): void {
  getDb().prepare(
    'DELETE FROM memory_chunks WHERE project_id = ? AND source_type = ? AND source_id = ?'
  ).run(projectId, sourceType, sourceId)
}

// -- Plans --------------------------------------------------------------------

export function createPlan(projectId: number, title: string, goal?: string | null): Plan {
  const db = getDb()
  const info = db.prepare(
    "INSERT INTO plans (project_id, title, goal) VALUES (?, ?, ?)"
  ).run(projectId, title, goal ?? null)
  return db.prepare('SELECT * FROM plans WHERE id = ?').get(lastId(info.lastInsertRowid)) as unknown as Plan
}

export function updatePlanStatus(planId: number, status: Plan['status']): void {
  getDb().prepare(
    "UPDATE plans SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(status, planId)
}

export function updatePlanGoal(planId: number, goal: string): void {
  getDb().prepare(
    "UPDATE plans SET goal = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(goal, planId)
}

export function deletePlan(planId: number): void {
  getDb().prepare('DELETE FROM plans WHERE id = ?').run(planId)
}

export function getActivePlans(projectId: number): Plan[] {
  return getDb().prepare(
    "SELECT * FROM plans WHERE project_id = ? AND status IN ('draft','active') ORDER BY updated_at DESC"
  ).all(projectId) as unknown as Plan[]
}

export function getAllPlans(projectId: number): Plan[] {
  return getDb().prepare(
    'SELECT * FROM plans WHERE project_id = ? ORDER BY updated_at DESC'
  ).all(projectId) as unknown as Plan[]
}

export function findPlanByTitle(projectId: number, partial: string): Plan | undefined {
  const lower = partial.toLowerCase()
  const all = getAllPlans(projectId)
  return all.find(p => p.title.toLowerCase().includes(lower))
}

// -- Plan steps ---------------------------------------------------------------

export function addPlanSteps(planId: number, steps: string[]): PlanStep[] {
  const db = getDb()
  const row = db.prepare(
    'SELECT COALESCE(MAX(position), -1) AS max_pos FROM plan_steps WHERE plan_id = ?'
  ).get(planId) as { max_pos: number }
  const offset = row.max_pos + 1
  return steps.map((content, i) => {
    const info = db.prepare(
      'INSERT INTO plan_steps (plan_id, content, position) VALUES (?, ?, ?)'
    ).run(planId, content.trim(), offset + i)
    return db.prepare('SELECT * FROM plan_steps WHERE id = ?').get(lastId(info.lastInsertRowid)) as unknown as PlanStep
  })
}

export function getPlanSteps(planId: number): PlanStep[] {
  return getDb().prepare(
    'SELECT * FROM plan_steps WHERE plan_id = ? ORDER BY position ASC'
  ).all(planId) as unknown as PlanStep[]
}

export function updatePlanStepStatus(stepId: number, status: PlanStep['status']): void {
  getDb().prepare(
    "UPDATE plan_steps SET status = ? WHERE id = ?"
  ).run(status, stepId)
}

export function deletePlanStep(stepId: number): void {
  getDb().prepare('DELETE FROM plan_steps WHERE id = ?').run(stepId)
}

// -- Checkpoints --------------------------------------------------------------

export function addCheckpoint(
  projectId: number,
  progress: string,
  nextStep?: string | null,
  filesActive?: string | null,
  sessionId?: number | null,
  taskId?: number | null,
  gitCommit?: string | null
): Checkpoint {
  const db = getDb()
  const info = db.prepare(
    'INSERT INTO checkpoints (project_id, session_id, task_id, progress, next_step, files_active, git_commit) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(projectId, sessionId ?? null, taskId ?? null, progress, nextStep ?? null, filesActive ?? null, gitCommit ?? null)
  return db.prepare('SELECT * FROM checkpoints WHERE id = ?').get(lastId(info.lastInsertRowid)) as unknown as Checkpoint
}

export function getLastCheckpoint(projectId: number): Checkpoint | undefined {
  return getDb().prepare(
    'SELECT * FROM checkpoints WHERE project_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(projectId) as unknown as Checkpoint | undefined
}

export function getSessionCheckpoints(sessionId: number): Checkpoint[] {
  return getDb().prepare(
    'SELECT * FROM checkpoints WHERE session_id = ? ORDER BY created_at ASC'
  ).all(sessionId) as unknown as Checkpoint[]
}

export interface SessionActivity {
  durationMinutes: number
  tasksCompleted: Array<{ id: number; title: string }>
  decisionsCount: number
  observationsCount: number
  checkpointsCount: number
}

export function getSessionActivity(projectId: number, sessionId: number, sessionStartedAt: string): SessionActivity {
  const db = getDb()
  const since = sessionStartedAt

  const tasksCompleted = db.prepare(
    "SELECT id, title FROM tasks WHERE project_id = ? AND status = 'done' AND updated_at >= ? ORDER BY updated_at DESC"
  ).all(projectId, since) as unknown as Array<{ id: number; title: string }>

  const decisionsRow = db.prepare(
    'SELECT COUNT(*) as n FROM decisions WHERE project_id = ? AND session_id = ?'
  ).get(projectId, sessionId) as { n: number }

  const observationsRow = db.prepare(
    'SELECT COUNT(*) as n FROM notes WHERE project_id = ? AND session_id = ?'
  ).get(projectId, sessionId) as { n: number }

  const checkpointsRow = db.prepare(
    'SELECT COUNT(*) as n FROM checkpoints WHERE session_id = ?'
  ).get(sessionId) as { n: number }

  const durationMinutes = Math.round((Date.now() - new Date(since.endsWith('Z') ? since : since + 'Z').getTime()) / 60_000)

  return {
    durationMinutes,
    tasksCompleted,
    decisionsCount: decisionsRow.n,
    observationsCount: observationsRow.n,
    checkpointsCount: checkpointsRow.n,
  }
}

// -- Questions ----------------------------------------------------------------

export function addQuestion(
  projectId: number,
  question: string,
  sessionId?: number | null,
  taskId?: number | null
): Question {
  const db = getDb()
  const info = db.prepare(
    'INSERT INTO questions (project_id, session_id, task_id, question) VALUES (?, ?, ?, ?)'
  ).run(projectId, sessionId ?? null, taskId ?? null, question)
  return db.prepare('SELECT * FROM questions WHERE id = ?').get(lastId(info.lastInsertRowid)) as unknown as Question
}

export function answerQuestion(questionId: number, answer: string): void {
  getDb().prepare(
    "UPDATE questions SET answer = ?, resolved_at = datetime('now') WHERE id = ?"
  ).run(answer, questionId)
}

export function getOpenQuestions(projectId: number): Question[] {
  return getDb().prepare(
    'SELECT * FROM questions WHERE project_id = ? AND resolved_at IS NULL ORDER BY created_at ASC'
  ).all(projectId) as unknown as Question[]
}

export function findOpenQuestion(projectId: number, partial: string): Question | undefined {
  const lower = partial.toLowerCase()
  return getOpenQuestions(projectId).find(q => q.question.toLowerCase().includes(lower))
}

export function updateSessionFilesTouched(sessionId: number, files: string): void {
  getDb().prepare(
    "UPDATE sessions SET files_touched = ? WHERE id = ?"
  ).run(files, sessionId)
}

// -- Signals ------------------------------------------------------------------

export function addSignal(
  projectId: number,
  content: string,
  type: Signal['type'] = 'message',
  source: Signal['source'] = 'cli',
  metadata?: string | null
): Signal {
  const db = getDb()
  const info = db.prepare(
    'INSERT INTO signals (project_id, content, type, source, metadata) VALUES (?, ?, ?, ?, ?)'
  ).run(projectId, content, type, source, metadata ?? null)
  return db.prepare('SELECT * FROM signals WHERE id = ?').get(lastId(info.lastInsertRowid)) as unknown as Signal
}

export function getPendingSignals(projectId: number): Signal[] {
  return getDb().prepare(
    "SELECT * FROM signals WHERE project_id = ? AND status = 'pending' ORDER BY created_at ASC"
  ).all(projectId) as unknown as Signal[]
}

export function markSignalDelivered(signalId: number): void {
  getDb().prepare(
    "UPDATE signals SET status = 'delivered', delivered_at = datetime('now') WHERE id = ? AND status = 'pending'"
  ).run(signalId)
}

export function markSignalAcknowledged(signalId: number, agentResponse?: string | null): void {
  getDb().prepare(
    "UPDATE signals SET status = 'acknowledged', acknowledged_at = datetime('now'), agent_response = COALESCE(?, agent_response) WHERE id = ?"
  ).run(agentResponse ?? null, signalId)
}

export function getUnacknowledgedSignals(projectId: number): Signal[] {
  return getDb().prepare(
    "SELECT * FROM signals WHERE project_id = ? AND status IN ('pending', 'delivered') ORDER BY created_at ASC"
  ).all(projectId) as unknown as Signal[]
}

export function getRecentSignals(projectId: number, limit = 20): Signal[] {
  return getDb().prepare(
    'SELECT * FROM signals WHERE project_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(projectId, limit) as unknown as Signal[]
}

/** Query signal history with optional filters. */
export function getSignalHistory(
  projectId: number,
  opts: { type?: string; source?: string; status?: string; limit?: number; offset?: number } = {}
): { signals: Signal[]; total: number } {
  const db = getDb()
  const clauses = ['project_id = ?']
  const params: (string | number)[] = [projectId]
  if (opts.type)   { clauses.push('type = ?');   params.push(opts.type) }
  if (opts.source) { clauses.push('source = ?'); params.push(opts.source) }
  if (opts.status) { clauses.push('status = ?'); params.push(opts.status) }
  const where = clauses.join(' AND ')
  const total = (db.prepare(`SELECT COUNT(*) AS cnt FROM signals WHERE ${where}`).get(...params) as any).cnt as number
  const limit = opts.limit ?? 50
  const offset = opts.offset ?? 0
  const signals = db.prepare(
    `SELECT * FROM signals WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as unknown as Signal[]
  return { signals, total }
}

