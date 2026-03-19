import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

let _globalDb: DatabaseSync | null = null

function getGlobalDbPath(): string {
  const dir = join(homedir(), '.kontinue')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'global.db')
}

export function getGlobalDb(): DatabaseSync {
  if (_globalDb) return _globalDb

  _globalDb = new DatabaseSync(getGlobalDbPath())
  _globalDb.exec("PRAGMA journal_mode = WAL")

  _globalDb.exec(`
    CREATE TABLE IF NOT EXISTS shared_patterns (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      project_path TEXT NOT NULL,
      summary      TEXT NOT NULL,
      rationale    TEXT,
      alternatives TEXT,
      tags         TEXT,
      files        TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_shared_project ON shared_patterns(project_name);
  `)

  return _globalDb
}

// ── Shared pattern operations ────────────────────────────────────────────────

export interface SharedPattern {
  id: number
  project_name: string
  project_path: string
  summary: string
  rationale: string | null
  alternatives: string | null
  tags: string | null
  files: string | null
  created_at: string
}

/** Share a decision to the global cross-project store. */
export function shareDecision(
  projectName: string,
  projectPath: string,
  summary: string,
  rationale?: string | null,
  alternatives?: string | null,
  tags?: string | null,
  files?: string | null,
): SharedPattern {
  const db = getGlobalDb()
  const info = db.prepare(
    'INSERT INTO shared_patterns (project_name, project_path, summary, rationale, alternatives, tags, files) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(projectName, projectPath, summary, rationale ?? null, alternatives ?? null, tags ?? null, files ?? null)
  return db.prepare('SELECT * FROM shared_patterns WHERE id = ?').get(Number(info.lastInsertRowid)) as unknown as SharedPattern
}

/** Search shared patterns across all projects by keyword. */
export function searchGlobalPatterns(keyword: string, limit = 10): SharedPattern[] {
  const db = getGlobalDb()
  return db.prepare(
    'SELECT * FROM shared_patterns WHERE summary LIKE ? OR rationale LIKE ? OR tags LIKE ? ORDER BY created_at DESC LIMIT ?'
  ).all(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, limit) as unknown as SharedPattern[]
}

/** Get all shared patterns, most recent first. */
export function getAllGlobalPatterns(limit = 20): SharedPattern[] {
  const db = getGlobalDb()
  return db.prepare(
    'SELECT * FROM shared_patterns ORDER BY created_at DESC LIMIT ?'
  ).all(limit) as unknown as SharedPattern[]
}
