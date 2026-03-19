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
      end_commit   TEXT,
      context_read_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      session_id  INTEGER REFERENCES sessions(id),
      title       TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in-progress','done','abandoned')),
      description TEXT,
      outcome     TEXT,
      notes       TEXT,
      branch      TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      session_id   INTEGER REFERENCES sessions(id),
      task_id      INTEGER,
      summary      TEXT NOT NULL,
      rationale    TEXT,
      alternatives TEXT,
      context      TEXT,
      files        TEXT,
      tags         TEXT,
      confidence   TEXT NOT NULL DEFAULT 'confirmed',
      status       TEXT NOT NULL DEFAULT 'active',
      superseded_by INTEGER,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      branch       TEXT,
      git_commit   TEXT
    );

    CREATE TABLE IF NOT EXISTS notes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      session_id  INTEGER REFERENCES sessions(id),
      task_id     INTEGER,
      content     TEXT NOT NULL,
      resolved_at TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
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

    CREATE TABLE IF NOT EXISTS task_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      done       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plans (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      goal       TEXT,
      status     TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','complete','archived')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plan_steps (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id    INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in-progress','done','skipped')),
      position   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project   ON tasks(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_decisions_proj  ON decisions(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_proj   ON sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_proj     ON memory_chunks(project_id);
    CREATE INDEX IF NOT EXISTS idx_task_items_task ON task_items(task_id);
    CREATE INDEX IF NOT EXISTS idx_plans_project   ON plans(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_plan_steps_plan ON plan_steps(plan_id, position);

    CREATE TABLE IF NOT EXISTS checkpoints (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      session_id    INTEGER REFERENCES sessions(id),
      task_id       INTEGER REFERENCES tasks(id),
      progress      TEXT NOT NULL,
      next_step     TEXT,
      files_active  TEXT,
      git_commit    TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS questions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      session_id  INTEGER REFERENCES sessions(id),
      task_id     INTEGER REFERENCES tasks(id),
      question    TEXT NOT NULL,
      answer      TEXT,
      resolved_at TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS signals (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source          TEXT NOT NULL DEFAULT 'cli',
      type            TEXT NOT NULL DEFAULT 'message' CHECK(type IN ('message','priority','abort','answer')),
      content         TEXT NOT NULL,
      metadata        TEXT,
      status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','acknowledged')),
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      delivered_at    TEXT,
      acknowledged_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_checkpoints_proj    ON checkpoints(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id);
    CREATE INDEX IF NOT EXISTS idx_questions_proj      ON questions(project_id, resolved_at);
    CREATE INDEX IF NOT EXISTS idx_signals_pending     ON signals(project_id, status, created_at);
  `)

  // Additive migrations: add new columns to existing tables when upgrading.
  // ALTER TABLE ADD COLUMN is a no-op if the column already exists in SQLite 3.37+,
  // but older versions throw. We guard with a runtime check.
  // SECURITY NOTE: table/column names here are hardcoded constants — never pass
  // user-supplied values to addColumnIfMissing (SQL injection via identifier).
  const addColumnIfMissing = (table: string, column: string, type: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    if (!cols.some(c => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
    }
  }

  addColumnIfMissing('sessions',  'branch',          'TEXT')
  addColumnIfMissing('sessions',  'start_commit',    'TEXT')
  addColumnIfMissing('sessions',  'end_commit',      'TEXT')
  addColumnIfMissing('sessions',  'context_read_at', 'TEXT')
  addColumnIfMissing('tasks',     'branch',       'TEXT')
  addColumnIfMissing('tasks',     'description',  'TEXT')
  addColumnIfMissing('tasks',     'outcome',      'TEXT')
  addColumnIfMissing('decisions', 'branch',     'TEXT')
  addColumnIfMissing('decisions', 'git_commit', 'TEXT')
  addColumnIfMissing('decisions', 'context',    'TEXT')
  addColumnIfMissing('decisions', 'files',      'TEXT')
  addColumnIfMissing('decisions', 'tags',       'TEXT')
  addColumnIfMissing('decisions', 'task_id',    'INTEGER')
  addColumnIfMissing('notes',     'task_id',    'INTEGER')
  addColumnIfMissing('sessions',  'files_touched', 'TEXT')
  addColumnIfMissing('sessions',  'tool_calls', 'INTEGER DEFAULT 0')
  addColumnIfMissing('decisions', 'confidence', "TEXT NOT NULL DEFAULT 'confirmed'")

  // Decision lifecycle: active → superseded/archived. Prevents dead decisions from polluting context.
  addColumnIfMissing('decisions', 'status', "TEXT NOT NULL DEFAULT 'active'")
  addColumnIfMissing('decisions', 'superseded_by', 'INTEGER')

  // Observation/note lifecycle: resolved_at marks an observation as addressed/no longer relevant.
  addColumnIfMissing('notes', 'resolved_at', 'TEXT')

  // Decision scope: 'project' (permanent) vs 'task' (auto-archived when task completes).
  addColumnIfMissing('decisions', 'scope', "TEXT NOT NULL DEFAULT 'project'")

  // Memory confidence decay: exempt certain chunks from stale flagging.
  addColumnIfMissing('memory_chunks', 'decay_exempt', 'INTEGER NOT NULL DEFAULT 0')

  // Add UNIQUE constraint to memory_chunks for proper upsert deduplication.
  // SQLite doesn't support ADD CONSTRAINT, so we create a unique index instead.
  // First, remove any duplicate rows keeping only the most recent one per (project_id, source_type, source_id).
  db.exec(`
    DELETE FROM memory_chunks
    WHERE id NOT IN (
      SELECT MAX(id)
      FROM memory_chunks
      GROUP BY project_id, source_type, source_id
    )
  `)
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_unique ON memory_chunks(project_id, source_type, source_id)`)

  // ── FTS5 full-text search index ──────────────────────────────────────────
  // Ranked search (BM25) for memory_chunks. Falls back to LIKE if FTS5 unavailable.
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memory_chunks_fts USING fts5(content, content='memory_chunks', content_rowid='id')`)

    db.exec(`CREATE TRIGGER IF NOT EXISTS mc_fts_insert AFTER INSERT ON memory_chunks BEGIN
      INSERT INTO memory_chunks_fts(rowid, content) VALUES (new.id, new.content);
    END`)

    db.exec(`CREATE TRIGGER IF NOT EXISTS mc_fts_delete AFTER DELETE ON memory_chunks BEGIN
      INSERT INTO memory_chunks_fts(memory_chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
    END`)

    db.exec(`CREATE TRIGGER IF NOT EXISTS mc_fts_update AFTER UPDATE ON memory_chunks BEGIN
      INSERT INTO memory_chunks_fts(memory_chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
      INSERT INTO memory_chunks_fts(rowid, content) VALUES (new.id, new.content);
    END`)

    // Rebuild to index any pre-existing rows.
    db.exec(`INSERT INTO memory_chunks_fts(memory_chunks_fts) VALUES('rebuild')`)
  } catch {
    // FTS5 not compiled in — searchChunks will fall back to LIKE
  }
}
