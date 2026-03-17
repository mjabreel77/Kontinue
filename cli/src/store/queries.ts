import { getDb } from './db.js'
import type { Decision, Note, Project, Session, Task } from '../types.js'

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

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function addTask(projectId: number, title: string, sessionId?: number, branch?: string | null): Task {
  const db = getDb()
  const info = db.prepare(
    'INSERT INTO tasks (project_id, session_id, title, branch) VALUES (?, ?, ?, ?)'
  ).run(projectId, sessionId ?? null, title, branch ?? null)
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(lastId(info.lastInsertRowid)) as unknown as Task
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
  commit?: string | null
): Decision {
  const db = getDb()
  const info = db.prepare(
    'INSERT INTO decisions (project_id, session_id, summary, rationale, alternatives, branch, git_commit) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(projectId, sessionId ?? null, summary, rationale ?? null, alternatives ?? null, branch ?? null, commit ?? null)
  return db.prepare('SELECT * FROM decisions WHERE id = ?').get(lastId(info.lastInsertRowid)) as unknown as Decision
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

// ── Notes ─────────────────────────────────────────────────────────────────────

export function addNote(projectId: number, content: string, sessionId?: number): Note {
  const db = getDb()
  const info = db.prepare(
    'INSERT INTO notes (project_id, session_id, content) VALUES (?, ?, ?)'
  ).run(projectId, sessionId ?? null, content)
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(lastId(info.lastInsertRowid)) as unknown as Note
}

// ── Memory chunks ─────────────────────────────────────────────────────────────

export function upsertChunk(
  projectId: number,
  sourceType: string,
  sourceId: number,
  content: string
): void {
  getDb().prepare(`
    INSERT INTO memory_chunks (project_id, source_type, source_id, content)
    VALUES (?, ?, ?, ?)
    ON CONFLICT DO NOTHING
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
