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
  taskId?: number | null
): Decision {
  const db = getDb()
  const info = db.prepare(
    'INSERT INTO decisions (project_id, session_id, task_id, summary, rationale, alternatives, branch, git_commit, context, files, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(projectId, sessionId ?? null, taskId ?? null, summary, rationale ?? null, alternatives ?? null, branch ?? null, commit ?? null, context ?? null, files ?? null, tags ?? null)
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

export function getAllChunks(projectId: number): Array<{ id: number; content: string; source_type: string; source_id: number }> {
  return getDb().prepare(
    'SELECT id, content, source_type, source_id FROM memory_chunks WHERE project_id = ? ORDER BY created_at DESC'
  ).all(projectId) as unknown as Array<{ id: number; content: string; source_type: string; source_id: number }>
}

export function getChunkCount(projectId: number): number {
  const row = getDb().prepare(
    'SELECT COUNT(*) as n FROM memory_chunks WHERE project_id = ?'
  ).get(projectId) as { n: number }
  return row.n
}

/** Search memory chunks by keyword at the DB level (LIKE %keyword%). */
export function searchChunks(
  projectId: number,
  keyword: string,
  sourceType?: string,
  limit = 20
): Array<{ id: number; content: string; source_type: string; source_id: number }> {
  if (sourceType) {
    return getDb().prepare(
      'SELECT id, content, source_type, source_id FROM memory_chunks WHERE project_id = ? AND source_type = ? AND content LIKE ? ORDER BY created_at DESC LIMIT ?'
    ).all(projectId, sourceType, `%${keyword}%`, limit) as unknown as Array<{ id: number; content: string; source_type: string; source_id: number }>
  }
  return getDb().prepare(
    'SELECT id, content, source_type, source_id FROM memory_chunks WHERE project_id = ? AND content LIKE ? ORDER BY created_at DESC LIMIT ?'
  ).all(projectId, `%${keyword}%`, limit) as unknown as Array<{ id: number; content: string; source_type: string; source_id: number }>
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

export function markSignalAcknowledged(signalId: number): void {
  getDb().prepare(
    "UPDATE signals SET status = 'acknowledged', acknowledged_at = datetime('now') WHERE id = ?"
  ).run(signalId)
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

