import { DatabaseSync } from 'node:sqlite'
import { homedir } from 'node:os'
import { join } from 'node:path'

const db = new DatabaseSync(join(homedir(), '.kontinue', 'kontinue.db'))
const result = db.prepare(
  "UPDATE sessions SET ended_at = datetime('now'), handoff_note = 'stale', blockers = '' WHERE ended_at IS NULL"
).run()
console.log(`Closed ${result.changes} stale session(s)`)
