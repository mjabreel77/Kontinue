import { Command, Flags } from '@oclif/core'
import { resolve } from 'node:path'
import { requireProject } from '../utils/project.js'
import { findProjectByPath } from '../store/queries.js'
import { getDb } from '../store/db.js'
import { KontinueApiClient, toStringArray } from '../mcp/api-client.js'
import { ok, warn } from '../utils/display.js'
import type { SQLInputValue } from 'node:sqlite'
import type {
  Session, Task, Decision, Note, Checkpoint,
  Question, Plan, PlanStep, Signal, TaskItem,
} from '../types.js'

export default class Sync extends Command {
  static description = 'Sync local SQLite data to a remote Kontinue API backend'

  static flags = {
    project: Flags.string({
      char: 'p',
      description: 'Path to the project root (overrides cwd)',
    }),
    'api-url': Flags.string({
      description: 'Remote API base URL',
      default: 'http://localhost:5000',
      required: true,
    }),
    'project-id': Flags.string({
      description: 'Remote project GUID',
      required: true,
    }),
    'api-key': Flags.string({
      description: 'API key for authentication',
    }),
    'dry-run': Flags.boolean({
      description: 'Show what would be synced without uploading',
      default: false,
    }),
    since: Flags.string({
      description: 'Only sync data created after this ISO date (e.g. 2026-01-01)',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Sync)
    const cwd = flags.project ? resolve(flags.project) : resolve(process.cwd())
    const project = requireProject(cwd)
    const localProject = findProjectByPath(cwd)

    if (!localProject) {
      this.error('No local Kontinue project found at this path. Run `kontinue init` first.')
    }

    const api = new KontinueApiClient({
      baseUrl: flags['api-url'],
      projectId: flags['project-id']!,
      apiKey: flags['api-key'],
    })

    const db = getDb()
    const pid = localProject.id
    const since = flags.since ?? '1970-01-01'
    const dryRun = flags['dry-run']

    this.log(`Syncing local project "${localProject.name}" → ${flags['api-url']}`)
    if (dryRun) warn('DRY RUN — no data will be uploaded')

    const counts = { sessions: 0, tasks: 0, decisions: 0, observations: 0, checkpoints: 0, plans: 0, questions: 0, signals: 0, memory: 0 }

    // Helper — node:sqlite .all() returns Record<string, SQLOutputValue>[]
    function query<T>(sql: string, ...params: SQLInputValue[]): T[] {
      return db.prepare(sql).all(...params) as unknown as T[]
    }

    // ── Sessions ──────────────────────────────────────────────
    const sessions = query<Session>(
      `SELECT * FROM sessions WHERE project_id = ? AND started_at >= ? ORDER BY started_at`, pid, since
    )
    counts.sessions = sessions.length

    if (!dryRun) {
      for (const s of sessions) {
        try {
          const remote = await api.startSession(s.branch ?? undefined, s.start_commit ?? undefined)
          if (s.ended_at && s.handoff_note) {
            await api.endSession(remote.id, s.end_commit ?? undefined, toStringArray(s.files_touched))
          }
        } catch { /* skip duplicates */ }
      }
    }
    ok(`Sessions: ${sessions.length}`)

    // ── Tasks + Items ─────────────────────────────────────────
    const tasks = query<Task>(
      `SELECT * FROM tasks WHERE project_id = ? AND created_at >= ? ORDER BY created_at`, pid, since
    )
    counts.tasks = tasks.length

    if (!dryRun) {
      for (const t of tasks) {
        try {
          const items = query<{ content: string }>(
            `SELECT content FROM task_items WHERE task_id = ?`, t.id
          )
          const itemTexts = items.map(i => i.content)

          const remote = await api.createTask(
            t.title,
            t.description ?? undefined,
            undefined, // sessionId — remote has its own
            t.branch ?? undefined,
            itemTexts.length > 0 ? itemTexts : undefined,
          )

          // Set correct status
          const statusMap: Record<string, string> = {
            'todo': 'Todo',
            'in-progress': 'InProgress',
            'done': 'Done',
            'abandoned': 'Abandoned',
          }
          if (t.status !== 'todo') {
            await api.updateTaskStatus(remote.id, statusMap[t.status] ?? 'Todo', t.outcome ?? undefined)
          }
        } catch { /* skip */ }
      }
    }
    ok(`Tasks: ${tasks.length}`)

    // ── Decisions ─────────────────────────────────────────────
    const decisions = query<Decision>(
      `SELECT * FROM decisions WHERE project_id = ? AND created_at >= ? ORDER BY created_at`, pid, since
    )
    counts.decisions = decisions.length

    if (!dryRun) {
      for (const d of decisions) {
        try {
          await api.createDecision({
            summary: d.summary,
            rationale: d.rationale ?? undefined,
            alternatives: toStringArray(d.alternatives),
            context: d.context ?? undefined,
            files: toStringArray(d.files),
            tags: toStringArray(d.tags),
            scope: d.scope,
            branch: d.branch ?? undefined,
            gitCommit: d.git_commit ?? undefined,
          })
        } catch { /* skip */ }
      }
    }
    ok(`Decisions: ${decisions.length}`)

    // ── Observations (notes) ──────────────────────────────────
    const observations = query<Note>(
      `SELECT * FROM notes WHERE project_id = ? AND created_at >= ? ORDER BY created_at`, pid, since
    )
    counts.observations = observations.length

    if (!dryRun) {
      for (const o of observations) {
        try {
          await api.createObservation(o.content)
        } catch { /* skip */ }
      }
    }
    ok(`Observations: ${observations.length}`)

    // ── Plans + Steps ─────────────────────────────────────────
    const plans = query<Plan>(
      `SELECT * FROM plans WHERE project_id = ? AND created_at >= ? ORDER BY created_at`, pid, since
    )
    counts.plans = plans.length

    if (!dryRun) {
      for (const p of plans) {
        try {
          const steps = query<{ content: string }>(
            `SELECT content FROM plan_steps WHERE plan_id = ? ORDER BY position`, p.id
          )
          const stepTexts = steps.map(s => s.content)

          const remote = await api.createPlan(p.title, p.goal ?? undefined, stepTexts)

          const statusMap: Record<string, string> = {
            'draft': 'Draft',
            'active': 'Active',
            'complete': 'Complete',
            'archived': 'Archived',
          }
          if (p.status !== 'draft') {
            await api.updatePlanStatus(remote.id, statusMap[p.status] ?? 'Draft')
          }

          // Sync step statuses
          if (remote.steps && steps.length > 0) {
            const localSteps = query<PlanStep>(
              `SELECT * FROM plan_steps WHERE plan_id = ? ORDER BY position`, p.id
            )

            for (let i = 0; i < Math.min(localSteps.length, remote.steps.length); i++) {
              const ls = localSteps[i]
              if (ls.status !== 'pending') {
                const stepStatusMap: Record<string, string> = {
                  'in-progress': 'InProgress',
                  'done': 'Done',
                  'skipped': 'Skipped',
                }
                const remoteStatus = stepStatusMap[ls.status]
                if (remoteStatus) {
                  await api.updatePlanStepStatus(remote.id, remote.steps[i].id, remoteStatus)
                }
              }
            }
          }
        } catch { /* skip */ }
      }
    }
    ok(`Plans: ${plans.length}`)

    // ── Checkpoints ───────────────────────────────────────────
    const checkpoints = query<Checkpoint>(
      `SELECT * FROM checkpoints WHERE project_id = ? AND created_at >= ? ORDER BY created_at`, pid, since
    )
    counts.checkpoints = checkpoints.length

    if (!dryRun) {
      for (const cp of checkpoints) {
        try {
          // Need an active session for checkpoint creation
          const activeSession = await api.getActiveSession()
          if (activeSession) {
            await api.createCheckpoint(
              activeSession.id,
              cp.progress,
              cp.next_step ?? undefined,
              toStringArray(cp.files_active),
              cp.git_commit ?? undefined,
            )
          }
        } catch { /* skip */ }
      }
    }
    ok(`Checkpoints: ${checkpoints.length}`)

    // ── Questions ─────────────────────────────────────────────
    const questions = query<Question>(
      `SELECT * FROM questions WHERE project_id = ? AND created_at >= ? ORDER BY created_at`, pid, since
    )
    counts.questions = questions.length

    if (!dryRun) {
      for (const q of questions) {
        try {
          const remote = await api.createQuestion(q.question)
          if (q.answer) {
            await api.answerQuestion(remote.id, q.answer)
          }
        } catch { /* skip */ }
      }
    }
    ok(`Questions: ${questions.length}`)

    // ── Signals ───────────────────────────────────────────────
    const signals = query<Signal>(
      `SELECT * FROM signals WHERE project_id = ? AND created_at >= ? ORDER BY created_at`, pid, since
    )
    counts.signals = signals.length

    if (!dryRun) {
      for (const s of signals) {
        try {
          await api.createSignal(s.type, s.content, s.source)
        } catch { /* skip */ }
      }
    }
    ok(`Signals: ${signals.length}`)

    // ── Memory Chunks ─────────────────────────────────────────
    const chunks = query<{ id: number; source_type: string; source_id: number; content: string; decay_exempt: number }>(
      `SELECT * FROM memory_chunks WHERE project_id = ? AND created_at >= ? ORDER BY created_at`, pid, since
    )
    counts.memory = chunks.length

    if (!dryRun) {
      for (const c of chunks) {
        try {
          await api.upsertMemoryChunk(
            c.source_type,
            c.content,
            undefined, // sourceId — numeric IDs don't map to remote GUIDs
            undefined,
            c.decay_exempt === 1,
          )
        } catch { /* skip */ }
      }
    }
    ok(`Memory chunks: ${chunks.length}`)

    // ── Summary ───────────────────────────────────────────────
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    this.log(`\nSync complete: ${total} entities ${dryRun ? 'found (dry run)' : 'uploaded'}`)
  }
}
