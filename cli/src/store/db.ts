import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

let _db: DatabaseSync | null = null

function getDbPath(): string {
  const dir = join(homedir(), '.kontinue')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'kontinue.db')
}

export function getDb(): DatabaseSync {
  if (_db) return _db

  _db = new DatabaseSync(getDbPath())
  _db.exec("PRAGMA journal_mode = WAL")
  _db.exec("PRAGMA foreign_keys = ON")

  migrate(_db)
  return _db
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      path        TEXT NOT NULL UNIQUE,
      description TEXT,
      tech_stack  TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      started_at   TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at     TEXT,
      handoff_note TEXT,
      blockers     TEXT,
      branch       TEXT,
      start_commit TEXT,
      end_commit   TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      session_id INTEGER REFERENCES sessions(id),
      title      TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in-progress','done','abandoned')),
      notes      TEXT,
      branch     TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      session_id   INTEGER REFERENCES sessions(id),
      summary      TEXT NOT NULL,
      rationale    TEXT,
      alternatives TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      branch       TEXT,
      git_commit   TEXT
    );

    CREATE TABLE IF NOT EXISTS notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      session_id INTEGER REFERENCES sessions(id),
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memory_chunks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_id   INTEGER NOT NULL,
      content     TEXT NOT NULL,
      embedding   BLOB,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project   ON tasks(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_decisions_proj  ON decisions(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_proj   ON sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_proj     ON memory_chunks(project_id);
  `)

  // Additive migrations: add new columns to existing tables when upgrading.
  // ALTER TABLE ADD COLUMN is a no-op if the column already exists in SQLite 3.37+,
  // but older versions throw. We guard with a runtime check.
  const addColumnIfMissing = (table: string, column: string, type: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    if (!cols.some(c => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
    }
  }

  addColumnIfMissing('sessions',  'branch',       'TEXT')
  addColumnIfMissing('sessions',  'start_commit', 'TEXT')
  addColumnIfMissing('sessions',  'end_commit',   'TEXT')
  addColumnIfMissing('tasks',     'branch',       'TEXT')
  addColumnIfMissing('decisions', 'branch',     'TEXT')
  addColumnIfMissing('decisions', 'git_commit', 'TEXT')
}
