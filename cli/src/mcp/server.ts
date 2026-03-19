import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { resolve } from 'node:path'
import {
  findProjectByPath,
  getActiveSession,
  getLastSession,
  getAllOpenTasks,
  getRecentDecisions,
  getActiveDecisions,
  getTasksByStatus,
  addDecision,
  addNote,
  addTask,
  findTaskByTitle,
  updateTaskStatus,
  updateTaskOutcome,
  getAllChunks,
  getChunkCount,
  upsertChunk,
  searchChunks,
  deleteChunk,
  endSession,
  getAllDecisions,
  addTaskItems,
  getTaskItems,
  checkTaskItem,
  findTaskItemByContent,
  deleteTaskItem,
  startSession,
  getDecisionsByTask,
  getNotesByTask,
  closeStaleSessions,
  markContextRead,
  createPlan,
  findPlanByTitle,
  getActivePlans,
  getPlanSteps,
  updatePlanStatus,
  updatePlanGoal,
  addPlanSteps,
  updatePlanStepStatus,
  deletePlan,
  addCheckpoint,
  getLastCheckpoint,
  addQuestion,
  answerQuestion,
  getOpenQuestions,
  findOpenQuestion,
  updateSessionFilesTouched,
  supersedeDecision,
  archiveDecision,
  archiveTaskScopedDecisions,
  resolveNote,
  findUnresolvedNote,
  getPendingSignals,
  markSignalDelivered,
  markSignalAcknowledged,
  getUnacknowledgedSignals,
  getStaleInProgressTasks,
  getSessionActivity,
  incrementToolCalls,
  getSessionToolCalls,
  getOpenObservations,
  getStaleChunkCount,
  setChunkDecayExempt,
  STALE_AFTER_DAYS,
  getSessionChunksForCompression,
  deleteChunksByIds,
} from '../store/queries.js'
import { writeDecision, writeNote, writeSession, rewriteTaskList, writePlan, deletePlanFile, SUBAGENT_INSTRUCTIONS } from '../store/markdown.js'
import { getBranch, getCommit, getRecentLog, getDiffFiles } from '../utils/git.js'
import { shareDecision, searchGlobalPatterns, getAllGlobalPatterns } from '../store/global-db.js'

function getProject(cwd: string) {
  const project = findProjectByPath(cwd)
  if (!project) throw new Error(`No Kontinue project at ${cwd}. Run: kontinue init`)
  return project
}

export async function startMcpServer(cwd: string): Promise<void> {
  const server = new McpServer({
    name: 'kontinue',
    version: '0.1.0',
  })

  // Warn in tool responses when context has not been read this session
  function contextWarning(projectId: number): string {
    const session = getActiveSession(projectId)
    if (session && !session.context_read_at) {
      return '\n\n> **WARNING:** `read_context` has not been called this session. Call it now before continuing — you may be working without awareness of prior decisions or open tasks.'
    }
    return ''
  }

  // 1-line board+checkpoint footer appended to every mutation tool response
  function statusLine(projectId: number): string {
    const open    = getAllOpenTasks(projectId)
    const ip      = open.filter(t => t.status === 'in-progress').length
    const todo    = open.filter(t => t.status === 'todo').length
    const cp      = getLastCheckpoint(projectId)
    const qs      = getOpenQuestions(projectId)
    const sigs    = getUnacknowledgedSignals(projectId)
    const session = getActiveSession(projectId)
    const stale   = getStaleInProgressTasks(projectId, 2)

    const cpAge = cp
      ? `${Math.round((Date.now() - new Date(cp.created_at).getTime()) / 60_000)}m ago`
      : 'none'

    const health = computeHealthFromData(cp, session, ip, qs, stale.length)

    const toolCalls = session ? getSessionToolCalls(session.id) : 0
    const sessionMinutes = session
      ? Math.round((Date.now() - new Date(session.started_at).getTime()) / 60_000)
      : 0

    const staleMemory = getStaleChunkCount(projectId)

    const parts = [
      `${ip} active · ${todo} todo`,
      `checkpoint: ${cpAge}`,
      `health: ${health.level}`,
      stale.length > 0 ? `${stale.length} stale` : '',
      qs.length > 0 ? `${qs.length} question${qs.length > 1 ? 's' : ''} open` : '',
      sigs.length > 0 ? `${sigs.length} signal${sigs.length > 1 ? 's' : ''} pending` : '',
      staleMemory > 0 ? `${staleMemory} stale memory` : '',
    ].filter(Boolean)

    const healthDetail = health.level !== 'good' ? `\n> _Health: ${health.reasons.join(', ')}_` : ''
    const nudge = checkpointNudge(cp)

    let pressure = ''
    if (toolCalls >= 60 || sessionMinutes >= 90) {
      pressure = `\n> **SESSION LONG (${toolCalls} calls, ${sessionMinutes}m) — call \`write_handoff\` now to create a recovery point before context is lost.**`
    } else if (toolCalls >= 30 || sessionMinutes >= 45) {
      pressure = `\n> _SESSION AGING (${toolCalls} calls, ${sessionMinutes}m) — consider writing a checkpoint or handoff._`
    }

    return `\n\n---\n_[${parts.join(' | ')}]_${healthDetail}${nudge}${pressure}`
  }

  function checkpointNudge(cp: { created_at: string } | undefined): string {
    if (!cp) {
      return '\n> **CHECKPOINT NEEDED:** No checkpoint exists this session. Call `checkpoint` now to create a recovery point.'
    }
    const minsAgo = Math.round((Date.now() - new Date(cp.created_at).getTime()) / 60_000)
    if (minsAgo > 15) {
      return `\n> **CHECKPOINT NEEDED (${minsAgo}m stale):** Call \`checkpoint\` now — ${minsAgo} minutes of work has no recovery record.`
    }
    return ''
  }

  function computeHealthFromData(
    cp: { created_at: string } | undefined,
    session: { context_read_at: string | null; started_at: string } | undefined,
    ipCount: number,
    qs: Array<{ created_at: string }>,
    staleCount: number
  ): { level: 'good' | 'fair' | 'poor'; reasons: string[] } {
    const reasons: string[] = []
    let score = 0

    if (!cp) { score += 3; reasons.push('no checkpoint') }
    else {
      const cpMins = Math.round((Date.now() - new Date(cp.created_at).getTime()) / 60_000)
      if (cpMins > 30) { score += 3; reasons.push(`checkpoint ${cpMins}m stale`) }
      else if (cpMins > 15) { score += 1; reasons.push(`checkpoint ${cpMins}m ago`) }
    }

    if (session && !session.context_read_at) { score += 2; reasons.push('context not read') }
    if (ipCount > 1) { score += 1; reasons.push(`${ipCount} tasks in-progress`) }

    const oldQs = qs.filter(q => (Date.now() - new Date(q.created_at).getTime()) > 86_400_000)
    if (oldQs.length > 0) { score += 1; reasons.push(`${oldQs.length} question${oldQs.length > 1 ? 's' : ''} >1d old`) }

    if (session) {
      const sessionMins = Math.round((Date.now() - new Date(session.started_at).getTime()) / 60_000)
      if (sessionMins > 120) { score += 2; reasons.push(`session ${Math.floor(sessionMins / 60)}h old`) }
    }

    if (staleCount > 0) { score += 2; reasons.push(`${staleCount} stale task${staleCount > 1 ? 's' : ''}`) }

    const level = score === 0 ? 'good' as const : score <= 2 ? 'fair' as const : 'poor' as const
    return { level, reasons }
  }

  // Check for pending developer signals and inject into tool responses
  function signalCheck(projectId: number): string {
    const signals = getPendingSignals(projectId)
    if (signals.length === 0) return ''
    const lines = ['\n\n> **SIGNAL FROM DEVELOPER** — Read and act on this:']
    for (const s of signals.slice(0, 5)) {
      const prefix = s.type === 'abort' ? 'URGENT'
        : s.type === 'priority' ? 'PRIORITY'
        : s.type === 'answer' ? 'ANSWER'
        : 'MESSAGE'
      lines.push(`> [${prefix}] ${s.content}`)
      markSignalDelivered(s.id)
    }
    if (signals.length > 5) lines.push(`> _(${signals.length - 5} more signals pending)_`)
    lines.push('>')
    lines.push('> Call `acknowledge_signal` after you have processed this.')
    return lines.join('\n')
  }

  /** Increment tool_calls counter for the active session. Call at top of every handler. */
  function trackToolCall(projectId: number): void {
    const session = getActiveSession(projectId)
    if (session) incrementToolCalls(session.id)
  }

  // ── read_context ─────────────────────────────────────────────────

  server.registerTool(
    'read_context',
    {
      description: [
        'REQUIRED FIRST ACTION — call this before reading any files or writing any code. Auto-starts your session.',
        '',
        'Two modes:',
        '- "brief" (default) — ~350 tokens. Last handoff + in-progress tasks + open questions + checkpoint warning + last commit diff. Use this for most sessions.',
        '- "full"            — Complete picture: all todo tasks, recent decisions, active plans, git log. Use when starting fresh or after a long break.',
        '',
        'Brief mode auto-surfaces prior context relevant to your in-progress tasks — you do not need to call search_memory separately.',
        '',
        'Do not start work without reading this first.',
      ].join('\n'),
      inputSchema: {
        mode: z.enum(['brief', 'full']).optional().default('brief').describe('"brief" (default) for focused sessions, "full" for fresh starts'),
      },
    },
    async ({ mode = 'brief' }) => {
      const project = getProject(cwd)
      trackToolCall(project.id)

      // Auto-close zombie sessions >2h old
      closeStaleSessions(project.id, 2)

      // Auto-start session if none exists — agents shouldn't need to run `kontinue start` separately
      if (!getActiveSession(project.id)) {
        startSession(project.id, getBranch(cwd) ?? null, getCommit(cwd) ?? null)
      }

      const last        = getLastSession(project.id)
      const activeSession = getActiveSession(project.id)!
      const open        = getAllOpenTasks(project.id)
      const inProgress  = open.filter(t => t.status === 'in-progress')
      const todo        = open.filter(t => t.status === 'todo')
      const branch      = getBranch(cwd)
      const commit      = getCommit(cwd)
      const lastCp      = getLastCheckpoint(project.id)
      const openQs      = getOpenQuestions(project.id)

      // Checkpoint staleness warning
      const cpWarn = (() => {
        if (!lastCp) return '\n> ⚠️ **No checkpoint recorded yet.** Call `checkpoint` after meaningful progress so this session can be resumed if context is lost.'
        const minsAgo = Math.round((Date.now() - new Date(lastCp.created_at).getTime()) / 60_000)
        if (minsAgo > 15) return `\n> ⚠️ **Last checkpoint ${minsAgo}m ago.** Call \`checkpoint\` now — if this session ends, ${minsAgo} minutes of work has no recovery record.`
        return ''
      })()

      // Files changed since session start (git diff) for new-session orientation
      const diffSummary = (() => {
        if (!last?.end_commit || !commit) return ''
        const files = getDiffFiles(cwd, last.end_commit, 'HEAD')
        if (!files) return ''
        const list = files.split('\n').filter(Boolean).slice(0, 8)
        return list.length ? `\n**Changed since last session:** ${list.join(', ')}` : ''
      })()

      const lines: string[] = [
        `# Kontinue — ${project.name} · ${mode}`,
        '',
        branch ? `**Branch:** \`${branch}\`  **HEAD:** \`${commit ?? '?'}\`` : '_Not a git repo_',
        diffSummary,
        cpWarn,
        '',
        '## Resume',
        last?.handoff_note
          ? (mode === 'brief' ? last.handoff_note.slice(0, 400) + (last.handoff_note.length > 400 ? '\n_[truncated — call with mode: "full" for complete handoff]_' : '') : last.handoff_note)
          : '_No previous session_',
        last?.blockers ? `\n**Blocker from last session:** ${last.blockers}` : '',
        '',
        '## In Progress',
        ...inProgress.map(t => {
          const taskItems = getTaskItems(t.id)
          const itemProgress = taskItems.length > 0
            ? ` \`[${taskItems.filter(i => i.done).length}/${taskItems.length}]\``
            : ''
          return [
            `- ◉ **#${t.id} ${t.title}**${itemProgress}${t.branch ? ` _(${t.branch})_` : ''}`,
            t.description ? `  > ${t.description}` : '',
            ...taskItems.map(i => `  ${i.done ? '✓' : '○'} #${i.id} ${i.content}`),
          ].filter(Boolean).join('\n')
        }),
        inProgress.length === 0 ? '_none_' : '',
      ]

      // Session activity digest — what's been done this session
      const activity = getSessionActivity(project.id, activeSession.id, activeSession.started_at)
      if (activity.durationMinutes > 0 || activity.tasksCompleted.length > 0 || activity.decisionsCount > 0) {
        const dur = activity.durationMinutes >= 60
          ? `${Math.floor(activity.durationMinutes / 60)}h ${activity.durationMinutes % 60}m`
          : `${activity.durationMinutes}m`
        lines.push('', '## This Session')
        lines.push(`Duration: ${dur} | ${activity.checkpointsCount} checkpoint${activity.checkpointsCount !== 1 ? 's' : ''} | ${activity.decisionsCount} decision${activity.decisionsCount !== 1 ? 's' : ''} | ${activity.observationsCount} observation${activity.observationsCount !== 1 ? 's' : ''}`)
        if (activity.tasksCompleted.length > 0) {
          lines.push(`Tasks completed: ${activity.tasksCompleted.map(t => `#${t.id} ${t.title}`).join(', ')}`)
        }
      }

      // Stale in-progress task warning
      const staleTasks = getStaleInProgressTasks(project.id, 2)
      if (staleTasks.length > 0) {
        lines.push('', '## Stale Tasks')
        lines.push('> These tasks have been in-progress for >2h without update. Consider completing, abandoning, or checkpointing them.')
        for (const t of staleTasks) {
          const hoursStale = Math.round((Date.now() - new Date(t.updated_at).getTime()) / 3_600_000)
          lines.push(`- **#${t.id} ${t.title}** _(${hoursStale}h since last update)_`)
        }
      }

      // Open questions always surface
      if (openQs.length > 0) {
        lines.push('', '## Open Questions')
        for (const q of openQs.slice(0, mode === 'brief' ? 3 : openQs.length)) {
          const age = Math.round((Date.now() - new Date(q.created_at).getTime()) / 86_400_000)
          lines.push(`- ❓ ${q.question}${age > 0 ? ` _(${age}d open)_` : ''}`)
        }
      }

      // Active plans always surface (brief: summary only, full: with steps)
      const plans = getActivePlans(project.id)
      if (plans.length > 0) {
        lines.push('', '## Active Plans')
        for (const plan of plans) {
          const steps = getPlanSteps(plan.id)
          const done = steps.filter(s => s.status === 'done').length
          const next = steps.find(s => s.status === 'pending' || s.status === 'in-progress')
          lines.push(`- **${plan.title}** \`[${done}/${steps.length}]\`${next ? ` — next: _${next.content}_` : ''}`)
          if (mode === 'full' && steps.length > 0) {
            for (const s of steps) {
              const icon = { pending: '○', 'in-progress': '◉', done: '✓', skipped: '–' }[s.status]
              lines.push(`  ${icon} ${s.content}`)
            }
          }
        }
      }

      if (mode === 'full') {
        // Full: todo tasks
        if (todo.length > 0) {
          lines.push('', '## Todo')
          for (const t of todo) {
            lines.push(`- ○ **#${t.id} ${t.title}**${t.description ? `\n  > ${t.description}` : ''}`)
          }
        }

        // Full: active decisions (excludes superseded/archived)
        const decisions = getActiveDecisions(project.id, 10)
        lines.push('', '## Active Decisions')
        if (decisions.length > 0) {
          for (const d of decisions) {
            const conf = d.confidence !== 'confirmed' ? ` \`[${d.confidence}]\`` : ''
            lines.push(`- ${d.created_at.slice(0, 10)} — ${d.summary}${conf}${d.tags ? ` [${d.tags}]` : ''}`)
          }
        } else {
          lines.push('_none_')
        }

        // Full: recent git log
        const recentLog = getRecentLog(cwd, 10)
        if (recentLog) lines.push('', '## Recent Commits', '```', recentLog, '```')
      }

      lines.push('', '---', '_Kontinue is your task list. If a step is not checkpointed, it has not been recorded._')

      // Mark context read
      if (activeSession && !activeSession.context_read_at) {
        markContextRead(activeSession.id)
      }

      const text = lines.filter(l => l !== undefined).join('\n') + signalCheck(project.id)
      return { content: [{ type: 'text' as const, text }] }
    }
  )

  // ── update_task ──────────────────────────────────────────────────

  server.registerTool(
    'update_task',
    {
      description: [
        'Create, start, complete, or abandon tasks. Manage task checklist items. Call this whenever you begin or finish a unit of work.',
        '',
        'Task actions:',
        '- "add"     — Create a new task. Title: short imperative. Description: acceptance criteria. Include description ALWAYS.',
        '- "start"   — Mark a task in-progress.',
        '- "done"    — Mark a task completed. Provide outcome describing what was done.',
        '- "abandon" — Mark a task dropped. Always pair with log_decision to record why.',
        '',
        'Item actions (manage checklist items on a task):',
        '- "item_add"    — Add new checklist items to an existing task. Pass items as comma-separated list.',
        '- "item_done"   — Mark a checklist item as done. Fuzzy matches item content.',
        '- "item_undo"   — Uncheck a previously completed item.',
        '- "item_remove" — Remove a checklist item entirely.',
        '',
        'Title matching for all actions except "add" is fuzzy — a partial match is sufficient.',
        'For item actions, use the "items" parameter for the item content (fuzzy match for done/undo/remove, comma-separated for item_add).',
        '',
        'Dual-writes: updates SQLite tasks table AND rewrites .kontinue/tasks/todo.md in-place.',
        '',
        'Protocol: Before "start", ensure read_context was called. After "done", a checkpoint is auto-created — proceed to check_signals.',
      ].join('\n'),
      inputSchema: {
        action:      z.enum(['add', 'start', 'done', 'abandon', 'item_add', 'item_done', 'item_undo', 'item_remove']).describe('Task lifecycle or item management action'),
        title:       z.string().describe('Full task title for "add", or a partial match string for other actions'),
        description: z.string().optional().describe('For "add": what needs to be done and what done looks like (acceptance criteria). Be specific.'),
        items:       z.string().optional().describe('For "add"/"item_add": comma-separated checklist items. For "item_done"/"item_undo"/"item_remove": partial match of the item content.'),
        outcome:     z.string().optional().describe('For "done": what was actually done, what approach was taken, which files were changed.'),
      },
    },
    async ({ action, title, description, items, outcome }) => {
      const project = getProject(cwd)
      trackToolCall(project.id)
      const session = getActiveSession(project.id)

      if (action === 'item_done' || action === 'item_undo' || action === 'item_remove') {
        const task = findTaskByTitle(project.id, title)
        if (!task) return { content: [{ type: 'text' as const, text: `No open task found matching: "${title}"` }] }
        if (!items) return { content: [{ type: 'text' as const, text: `Provide the item content via the "items" parameter.` }] }
        const item = findTaskItemByContent(task.id, items)
        if (!item) return { content: [{ type: 'text' as const, text: `No checklist item found matching: "${items}" on task "${task.title}"` }] }

        if (action === 'item_done') {
          checkTaskItem(item.id, true)
        } else if (action === 'item_undo') {
          checkTaskItem(item.id, false)
        } else {
          deleteTaskItem(item.id)
        }

        const allItems = getTaskItems(task.id)
        const doneCount = allItems.filter(i => i.done).length
        const verb = action === 'item_done' ? '✓' : action === 'item_undo' ? '↩ unchecked' : '✕ removed'
        return { content: [{ type: 'text' as const, text: `Item #${item.id} "${item.content}" ${verb} [${doneCount}/${allItems.length}] on #${task.id} "${task.title}"${signalCheck(project.id)}${statusLine(project.id)}` }] }
      }

      if (action === 'item_add') {
        const task = findTaskByTitle(project.id, title)
        if (!task) return { content: [{ type: 'text' as const, text: `No open task found matching: "${title}"` }] }
        if (!items) return { content: [{ type: 'text' as const, text: `Provide comma-separated items to add via the "items" parameter.` }] }
        const newItems = addTaskItems(task.id, items.split(',').map(s => s.trim()).filter(Boolean))
        const allItems = getTaskItems(task.id)
        const doneCount = allItems.filter(i => i.done).length
        return { content: [{ type: 'text' as const, text: `Added ${newItems.length} item${newItems.length > 1 ? 's' : ''} to #${task.id} "${task.title}" [${doneCount}/${allItems.length}]${signalCheck(project.id)}${statusLine(project.id)}` }] }
      }

      let resolvedTask: { id: number; title: string }
      if (action === 'add') {
        const task = addTask(project.id, title, session?.id, getBranch(cwd), description)
        if (description) upsertChunk(project.id, 'task', task.id, `Task: ${title}\n${description}`)
        if (items) {
          const steps = items.split(',').map(s => s.trim()).filter(Boolean)
          addTaskItems(task.id, steps)
        }
        resolvedTask = task
      } else {
        const task = findTaskByTitle(project.id, title)
        if (!task) return { content: [{ type: 'text' as const, text: `No open task found matching: "${title}"` }] }
        const statusMap = { start: 'in-progress', done: 'done', abandon: 'abandoned' } as const
        updateTaskStatus(task.id, statusMap[action])
        if (action === 'done' && outcome) {
          updateTaskOutcome(task.id, outcome)
          upsertChunk(project.id, 'task', task.id, `Task completed: ${task.title}\nOutcome: ${outcome}`)
        }
        resolvedTask = task
      }

      // Auto-checkpoint on task done — eliminates the most-ignored nudge
      if (action === 'done') {
        const autoProgress = `Task completed: ${resolvedTask.title}${outcome ? `. Outcome: ${outcome}` : ''}`
        addCheckpoint(project.id, autoProgress, 'Call check_signals, then start next task.', null, session?.id ?? null, resolvedTask.id, getCommit(cwd))

        // Auto-archive task-scoped decisions — they served their purpose
        const archived = archiveTaskScopedDecisions(project.id, resolvedTask.id)
        if (archived > 0) {
          // No need to surface this loudly — it's automatic hygiene
        }
      }

      const open = getAllOpenTasks(project.id)
      rewriteTaskList(
        cwd,
        open.filter(t => t.status === 'in-progress'),
        open.filter(t => t.status === 'todo'),
        getTasksByStatus(project.id, 'done')
      )

      const warn = contextWarning(project.id)
      const descWarn = (action === 'add' && !description)
        ? '\n\n> **REMINDER:** No `description` provided. Add one — it is required for handoffs to be self-contained. What does "done" look like for this task?'
        : ''
      const doneNudge = action === 'done'
        ? [
            '\n\n> Task done + auto-checkpoint created.',
            '> **Reflect before moving on:**',
            '> - Did you make any choices between alternatives? → call `log_decision`',
            '> - Did you discover anything surprising about the code? → call `add_observation`',
            '> - Were any earlier decisions invalidated? → call `supersede_decision`',
            '> **NEXT:** Call `check_signals`, then start the next task.',
          ].join('\n')
        : ''

      return { content: [{ type: 'text' as const, text: `Task #${resolvedTask.id} "${resolvedTask.title}" — ${action} ✓${warn}${descWarn}${doneNudge}${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── log_decision ─────────────────────────────────────────────────

  server.registerTool(
    'log_decision',
    {
      description: [
        'You MUST call this after any of these trigger moments:',
        '- You picked library A over library B',
        '- You chose an architecture pattern, API shape, or data model',
        '- You decided NOT to do something (skipped a refactor, avoided a dependency)',
        '- You resolved a non-obvious trade-off the user or a future agent would ask "why?" about',
        '- You established a convention (naming, file structure, error handling pattern)',
        '',
        'If you just made a choice that a future session would need context for, call this NOW — not later.',
        '',
        'Scope:',
        '- "project" (default) — permanent decision that persists across sessions (architecture, conventions, library choices)',
        '- "task" — temporary decision tied to the current task; auto-archived when the task is marked done',
        '',
        'Use scope="task" for implementation details that only matter while the task is active.',
        'Use scope="project" (or omit) for decisions a future session would need to know about.',
        '',
        'Always include rationale (why), alternatives (what else was considered), and files (what code this touches).',
      ].join('\n'),
      inputSchema: {
        summary:      z.string().describe('One-line decision written as a statement, e.g. "Chose PKCE over client_secret for public OAuth clients"'),
        rationale:    z.string().optional().describe('Why this decision was made — the reasoning, constraints, or evidence that led to it'),
        alternatives: z.string().optional().describe('Other options considered and why they were not chosen'),
        context:      z.string().optional().describe('Background discussion, relevant conversation, or what was happening when this decision was made'),
        files:        z.string().optional().describe('Comma-separated list of source files related to this decision, e.g. "src/auth/middleware.ts,src/db/schema.ts"'),
        tags:         z.string().optional().describe('Comma-separated category tags, e.g. "architecture,security,performance,dependency"'),
        task_title:   z.string().optional().describe('Partial title of the task this decision belongs to — links it to a board item'),
        scope:        z.enum(['project', 'task']).optional().default('project').describe('"project" = permanent, survives across sessions. "task" = auto-archived when linked task completes.'),
        share:        z.boolean().optional().default(false).describe('Set true to share this decision to the global cross-project memory. Other projects can discover it via search_memory with global=true.'),
      },
    },
    async ({ summary, rationale, alternatives, context, files, tags, task_title, scope, share }) => {
      const project = getProject(cwd)
      trackToolCall(project.id)
      const session = getActiveSession(project.id)

      const linkedTask = task_title ? findTaskByTitle(project.id, task_title) : null
      const decision = addDecision(project.id, summary, rationale, alternatives, session?.id, getBranch(cwd), getCommit(cwd), context, files, tags, linkedTask?.id, scope)
      writeDecision(cwd, decision)

      const chunkContent = [
        `Decision: ${summary}`,
        rationale    && `Rationale: ${rationale}`,
        alternatives && `Alternatives: ${alternatives}`,
        context      && `Context: ${context}`,
        files        && `Files: ${files}`,
        tags         && `Tags: ${tags}`,
      ].filter(Boolean).join('\n')
      upsertChunk(project.id, 'decision', decision.id, chunkContent)

      // Project-scoped decisions are exempt from decay — they represent permanent knowledge
      if (scope === 'project') {
        setChunkDecayExempt(project.id, 'decision', decision.id, true)
      }

      // Share to global cross-project memory if requested
      if (share) {
        shareDecision(project.name, cwd, summary, rationale, alternatives, tags, files)
      }

      const warn = contextWarning(project.id)
      const rationaleWarn = !rationale
        ? '\n\n> **REMINDER:** No `rationale` provided. Future agents cannot understand *why* this was decided. Call `log_decision` again with the same `summary` plus a `rationale` to fill it in.'
        : ''
      const scopeNote = scope === 'task'
        ? ' _(task-scoped — will auto-archive when task completes)_'
        : ''
      const shareNote = share ? ' _(shared globally)_' : ''

      return { content: [{ type: 'text' as const, text: `Decision recorded${scopeNote}${shareNote}: "${summary}" → .kontinue/decisions/${warn}${rationaleWarn}${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── write_handoff ────────────────────────────────────────────────

  server.registerTool(
    'write_handoff',
    {
      description: [
        'You MUST call this when ANY of these are true — do not wait to be told:',
        '- You just completed a major task or milestone',
        '- The conversation has had many back-and-forth exchanges (10+ turns)',
        '- You are about to read many large files or do a big batch of edits',
        '- The user says goodbye, "that\'s all", or signals the end of a session',
        '',
        'A handoff written before context is lost saves the next session hours of re-discovery.',
        'A handoff never written means the next agent starts blind.',
        '',
        'Write what you would want to read with zero memory of this session:',
        '- What was done (name files, functions, specific changes)',
        '- What was NOT done and why',
        '- The exact next step to take',
      ].join('\n'),
      inputSchema: {
        summary: z.string().describe('Specific summary of what was accomplished and what the next session should do first. Name files, functions, and decisions made.'),
        blockers: z.string().optional().describe('Unresolved issues or open questions blocking progress. Include enough context for a fresh session to understand without reading code.'),
      },
    },
    async ({ summary, blockers }) => {
      const project = getProject(cwd)
      trackToolCall(project.id)
      const session = getActiveSession(project.id)
      if (!session) return { content: [{ type: 'text' as const, text: 'No active session.' }] }

      // Auto-snapshot open tasks and session-scoped decisions into the handoff
      const open = getAllOpenTasks(project.id)
      const sessionDecisions = getRecentDecisions(project.id, 10).filter(d => d.session_id === session.id)

      const taskSnapshot = open.length
        ? open.map(t => `- [${t.status}] ${t.title}${t.description ? `: ${t.description}` : ''}`).join('\n')
        : '_none_'

      const decisionSnapshot = sessionDecisions.length
        ? sessionDecisions.map(d => `- ${d.summary}`).join('\n')
        : '_none_'

      const fullSummary = [
        summary,
        '',
        '### Open Tasks at Handoff',
        taskSnapshot,
        '',
        '### Decisions Made This Session',
        decisionSnapshot,
      ].join('\n')

      endSession(session.id, fullSummary, blockers ?? '', getCommit(cwd))

      // Auto-capture files touched this session from git diff
      const endCommit = getCommit(cwd)
      if (session.start_commit && endCommit) {
        const diffFiles = getDiffFiles(cwd, session.start_commit, endCommit)
        if (diffFiles) updateSessionFilesTouched(session.id, diffFiles)
      }

      const updated = { ...session, ended_at: new Date().toISOString(), handoff_note: fullSummary, blockers: blockers ?? null, end_commit: endCommit }
      writeSession(cwd, updated)
      upsertChunk(project.id, 'session', session.id, fullSummary)

      // ── Context compression: consolidate session's granular chunks into a digest ──
      const sessionChunks = getSessionChunksForCompression(project.id, session.started_at)
      if (sessionChunks.length > 3) {
        // Group by source_type and create a digest
        const grouped: Record<string, string[]> = {}
        for (const c of sessionChunks) {
          if (!grouped[c.source_type]) grouped[c.source_type] = []
          grouped[c.source_type].push(c.content.slice(0, 200))
        }
        const digestLines = Object.entries(grouped).map(
          ([type, contents]) => `**${type}** (${contents.length}):\n${contents.map(c => `- ${c}`).join('\n')}`
        )
        const digest = `Session digest (${session.started_at.slice(0, 10)}):\n${digestLines.join('\n\n')}`

        // Store the digest as a single session chunk (exempt from decay)
        upsertChunk(project.id, 'session', session.id, `${fullSummary}\n\n---\n\n${digest}`)
        setChunkDecayExempt(project.id, 'session', session.id, true)

        // Remove the individual granular chunks that were consolidated
        const idsToRemove = sessionChunks.map(c => c.id)
        deleteChunksByIds(idsToRemove)
      }

      const thinWarn = summary.trim().length < 80
        ? '\n\n> **WARNING:** This handoff summary is very short. Name the specific files changed, functions added/fixed, and the exact next action. A vague handoff means the next agent starts blind.'
        : ''

      return { content: [{ type: 'text' as const, text: `Handoff saved → .kontinue/sessions/${thinWarn}${contextWarning(project.id)}${signalCheck(project.id)}` }] }
    }
  )

  // ── add_observation ────────────────────────────────────────────────

  server.registerTool(
    'add_observation',
    {
      description: [
        'Call this IMMEDIATELY when any of these happen — do not wait until later:',
        '- You discover something unexpected in the code (bug, constraint, quirk, undocumented behavior)',
        '- You learn something about the project that is not obvious from reading the code',
        '- The user clarifies scope, priority, or a requirement',
        '- You find a potential issue you are not fixing right now but should be tracked',
        '- You notice something that would affect a different task or future work',
        '',
        'Rule: if you are about to mention a finding in chat, call this FIRST. Chat is ephemeral; observations persist.',
        'Always include task_title and files so observations link to the right context.',
      ].join('\n'),
      inputSchema: {
        observation: z.string().describe('What you discovered or learned — write it so a future agent reading it has full context without reading the code'),
        task_title:  z.string().optional().describe('Partial title of the task this observation relates to — links it to a board item'),
        files:       z.string().optional().describe('Comma-separated file paths relevant to this observation'),
      },
    },
    async ({ observation, task_title, files }) => {
      const project = getProject(cwd)
      trackToolCall(project.id)
      const session = getActiveSession(project.id)
      const linkedTask = task_title ? findTaskByTitle(project.id, task_title) : null

      const content = [
        `Observation: ${observation}`,
        task_title ? `Task: ${task_title}` : '',
        files ? `Files: ${files}` : '',
      ].filter(Boolean).join('\n')

      const note = addNote(project.id, content, session?.id, linkedTask?.id)
      writeNote(cwd, content)
      upsertChunk(project.id, 'note', note.id, content)

      return { content: [{ type: 'text' as const, text: `Observation recorded.${contextWarning(project.id)}${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── flag_blocker ─────────────────────────────────────────────────

  server.registerTool(
    'flag_blocker',
    {
      description: [
        'Record a blocker or unresolved issue mid-session without ending it.',
        '',
        'Call this when you encounter something that:',
        '- Blocks further progress on a task (missing info, broken dependency, unclear requirement)',
        '- Requires an external decision before work can continue',
        '- Is a known issue you are consciously deferring',
        '',
        'The blocker is saved immediately and surfaces in the next read_context call, even if the session ends unexpectedly.',
        '',
        'Do not use this instead of log_decision. Blockers are temporary obstacles; decisions are permanent records.',
      ].join('\n'),
      inputSchema: {
        blocker: z.string().describe('Clear description of what is blocked, why, and what information or action would unblock it'),
      },
    },
    async ({ blocker }) => {
      const project = getProject(cwd)
      trackToolCall(project.id)
      const note = addNote(project.id, `BLOCKER: ${blocker}`, getActiveSession(project.id)?.id)
      writeNote(cwd, `BLOCKER: ${blocker}`)
      upsertChunk(project.id, 'note', note.id, `Blocker: ${blocker}`)
      return { content: [{ type: 'text' as const, text: `Blocker noted: "${blocker}"${contextWarning(project.id)}${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── search_memory ────────────────────────────────────────────────

  server.registerTool(
    'search_memory',
    {
      description: [
        'Search project memory BEFORE modifying code you have not worked with in this session.',
        '',
        'Workflow chain: search_memory → read file → edit → add_observation/log_decision',
        '',
        'Use this to recall:',
        '- Decisions logged across sessions that constrain how code should be written',
        '- Observations and known issues recorded during prior work',
        '- Handoff notes describing what was done and what comes next',
        '',
        'Pass a keyword (e.g. "auth", "migration", "rate limit"). If no keyword, returns most recent chunks.',
      ].join('\n'),
      inputSchema: {
        keyword: z.string().optional().describe('Search keyword — matches against memory chunk content. If omitted, returns most recent chunks.'),
        limit: z.number().optional().default(20).describe('Maximum memory chunks to return (default 20)'),
        type:  z.enum(['task','decision','note','session','architecture','identity']).optional().describe('Filter to a specific chunk type'),
        global: z.boolean().optional().default(false).describe('Set true to also search the global cross-project memory. Returns shared decisions from other projects alongside local results.'),
      },
    },
    async ({ keyword, limit, type, global: searchGlobal }) => {
      const project = getProject(cwd)
      trackToolCall(project.id)
      const chunks = keyword
        ? searchChunks(project.id, keyword, type, limit)
        : (() => {
            let all = getAllChunks(project.id)
            if (type) all = all.filter(c => c.source_type === type)
            return all.slice(0, limit)
          })()

      const warn = contextWarning(project.id)

      if (chunks.length === 0 && !searchGlobal) {
        return { content: [{ type: 'text' as const, text: `No memory indexed yet. Start a session and log some decisions.${warn}${signalCheck(project.id)}${statusLine(project.id)}` }] }
      }

      const staleThresholdMs = STALE_AFTER_DAYS * 86_400_000

      const text = chunks
        .map(c => {
          const age = c.created_at ? Date.now() - new Date(c.created_at).getTime() : 0
          const staleTag = (age > staleThresholdMs && !(c as { decay_exempt?: number }).decay_exempt) ? ' ⚠️ STALE' : ''
          return `### [${c.source_type}${staleTag}]\n${c.content}`
        })
        .join('\n\n---\n\n')

      // Append cross-project results if global search requested
      let globalSection = ''
      if (searchGlobal && keyword) {
        const globalPatterns = searchGlobalPatterns(keyword, limit)
        if (globalPatterns.length > 0) {
          globalSection = '\n\n---\n\n## 🌐 Cross-Project Patterns\n\n' + globalPatterns
            .map(p => `### [${p.project_name}]\n${p.summary}${p.rationale ? `\nRationale: ${p.rationale}` : ''}${p.alternatives ? `\nAlternatives: ${p.alternatives}` : ''}`)
            .join('\n\n---\n\n')
        }
      }

      return { content: [{ type: 'text' as const, text: `${text}${globalSection}${warn}${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── read_decision ────────────────────────────────────────────────

  server.registerTool(
    'read_decision',
    {
      description: [
        'Look up the full details of one or more decisions by keyword.',
        '',
        "Use this when read_context shows a decision summary and you need to understand the full rationale, alternatives, context, or related files.",
        '',
        'Returns all matching decisions with every field: summary, rationale, alternatives, context, files, tags, branch, commit, and date.',
        '',
        'Examples:',
        '- "sqlite" → finds the node:sqlite vs better-sqlite3 decision',
        '- "auth" → finds any decisions about authentication architecture',
        '- "pagination" → finds decisions about how pagination was designed',
      ].join('\n'),
      inputSchema: {
        keyword: z.string().describe('Keyword or phrase to match against decision summaries, rationale, tags, or files. Case-insensitive.'),
        limit: z.number().optional().default(5).describe('Maximum decisions to return (default 5)'),
      },
    },
    async ({ keyword, limit }) => {
      const project = getProject(cwd)
      trackToolCall(project.id)
      const all = getAllDecisions(project.id)
      const k = keyword.toLowerCase()
      const matches = all
        .filter(d =>
          d.summary.toLowerCase().includes(k) ||
          (d.rationale ?? '').toLowerCase().includes(k) ||
          (d.tags ?? '').toLowerCase().includes(k) ||
          (d.files ?? '').toLowerCase().includes(k) ||
          (d.context ?? '').toLowerCase().includes(k) ||
          (d.alternatives ?? '').toLowerCase().includes(k)
        )
        .slice(0, limit)

      const warn = contextWarning(project.id)

      if (matches.length === 0) {
        return { content: [{ type: 'text' as const, text: `No decisions found matching "${keyword}".${warn}${signalCheck(project.id)}${statusLine(project.id)}` }] }
      }

      const text = matches.map(d => [
        `## ${d.summary}`,
        `**Date:** ${d.created_at}${d.branch ? `  |  **Branch:** \`${d.branch}\`` : ''}${d.git_commit ? `  |  **Commit:** \`${d.git_commit}\`` : ''}`,
        d.tags ? `**Tags:** ${d.tags}` : '',
        '',
        d.context ? `**Context:** ${d.context}\n` : '',
        `**Rationale:** ${d.rationale ?? '_not specified_'}`,
        '',
        `**Alternatives:** ${d.alternatives ?? '_not specified_'}`,
        d.files ? `\n**Files:** ${d.files}` : '',
      ].filter(l => l !== null).join('\n')).join('\n\n---\n\n')

      return { content: [{ type: 'text' as const, text: `${text}${warn}${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── update_plan ──────────────────────────────────────────────────

  server.registerTool(
    'update_plan',
    {
      description: [
        'Persist a plan AFTER the user has approved it. Do NOT call this to brainstorm — draft plans in chat first.',
        '',
        'Workflow:',
        '1. Detect that multi-step work is needed (3+ steps, multiple files/phases).',
        '2. Draft the plan in chat: show title, goal, and numbered steps. Ask the user to confirm.',
        '3. ONLY after the user approves (or adjusts), call this tool with action="add" to persist.',
        '',
        'Actions:',
        '- "add"       — Persist an approved plan. Provide title, optional goal, optional comma-separated steps.',
        '- "status"    — Change plan status: draft | active | complete | archived.',
        '- "step_done" — Mark a step done by partial content match.',
        '- "step_skip" — Mark a step skipped.',
        '- "step_add"  — Append a new step to an existing plan.',
        '- "delete"    — Delete the plan entirely.',
        '',
        'Dual-writes: SQLite + .kontinue/plans/<slug>.md',
        '',
        'Step-level updates (step_done, step_skip, step_add) and status changes do NOT require user approval — they track execution progress.',
      ].join('\n'),
      inputSchema: {
        action:  z.enum(['add', 'status', 'step_done', 'step_skip', 'step_add', 'delete']),
        title:   z.string().describe('Plan title for "add", or partial match for all other actions'),
        goal:    z.string().optional().describe('For "add" or to update the goal'),
        steps:   z.string().optional().describe('For "add": comma-separated step list'),
        status:  z.enum(['draft', 'active', 'complete', 'archived']).optional().describe('For "status" action'),
        step:    z.string().optional().describe('For step_done/step_skip/step_add: the step content or partial match'),
      },
    },
    async ({ action, title, goal, steps, status, step }) => {
      const project = getProject(cwd)
      trackToolCall(project.id)
      const helpers = `${contextWarning(project.id)}${signalCheck(project.id)}${statusLine(project.id)}`

      if (action === 'add') {
        const plan = createPlan(project.id, title, goal)
        const planSteps = steps
          ? addPlanSteps(plan.id, steps.split(',').map(s => s.trim()).filter(Boolean))
          : []
        writePlan(cwd, plan, planSteps)
        return { content: [{ type: 'text' as const, text: `Plan created: "${plan.title}" → .kontinue/plans/${helpers}` }] }
      }

      const plan = findPlanByTitle(project.id, title)
      if (!plan) return { content: [{ type: 'text' as const, text: `No plan found matching: "${title}"${helpers}` }] }

      if (action === 'status') {
        if (!status) return { content: [{ type: 'text' as const, text: `Provide --status: draft | active | complete | archived${helpers}` }] }
        updatePlanStatus(plan.id, status)
        if (goal) updatePlanGoal(plan.id, goal)
      } else if (action === 'step_add') {
        if (!step) return { content: [{ type: 'text' as const, text: `Provide step content via "step" parameter${helpers}` }] }
        addPlanSteps(plan.id, [step])
      } else if (action === 'step_done' || action === 'step_skip') {
        if (!step) return { content: [{ type: 'text' as const, text: `Provide partial step content to match${helpers}` }] }
        const allSteps = getPlanSteps(plan.id)
        const match = allSteps.find(s => s.content.toLowerCase().includes(step.toLowerCase()))
        if (!match) return { content: [{ type: 'text' as const, text: `No step found matching: "${step}"${helpers}` }] }
        updatePlanStepStatus(match.id, action === 'step_done' ? 'done' : 'skipped')
      } else if (action === 'delete') {
        deletePlanFile(cwd, plan)
        deletePlan(plan.id)
        return { content: [{ type: 'text' as const, text: `Plan deleted: "${plan.title}"${helpers}` }] }
      }

      // Re-fetch and rewrite markdown
      const updated = findPlanByTitle(project.id, title) ?? plan
      const freshSteps = getPlanSteps(plan.id)
      writePlan(cwd, updated, freshSteps)

      return { content: [{ type: 'text' as const, text: `Plan "${plan.title}" — ${action} ✓${helpers}` }] }
    }
  )

  // ── read_entity ──────────────────────────────────────────────────

  server.registerTool(
    'read_entity',
    {
      description: [
        'BEFORE editing any file or module, call this first to check what Kontinue knows about it.',
        '',
        'Workflow chain: read_entity → read/edit file → add_observation (if you discover something new)',
        '',
        'This prevents re-introducing bugs, violating established conventions, or contradicting prior decisions.',
        'Returns up to 3 matching memory chunks — decisions, observations, and session notes linked to the keyword.',
      ].join('\n'),
      inputSchema: {
        keyword: z.string().describe('Name or keyword identifying the entity — e.g. a filename, module name, API path, or concept like "auth middleware" or "token refresh"'),
      },
    },
    async ({ keyword }) => {
      const project = getProject(cwd)
      trackToolCall(project.id)
      const matches = searchChunks(project.id, keyword, undefined, 3)
      const warn = contextWarning(project.id)
      const text = matches.length
        ? matches.map(c => `[${c.source_type}]\n${c.content}`).join('\n\n---\n\n')
        : `No entity found matching "${keyword}".`
      return { content: [{ type: 'text' as const, text: `${text}${warn}${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── checkpoint ───────────────────────────────────────────────────

  server.registerTool(
    'checkpoint',
    {
      description: [
        'Save a mid-task progress snapshot. Call this every 10–15 minutes during active work, and after any significant step.',
        '',
        'This is NOT a session handoff — the session stays open. It is a recovery point.',
        'If this conversation ends unexpectedly, the next session reads this and resumes exactly here.',
        '',
        'When to call it:',
        '- IMMEDIATELY after marking any task done (before starting the next task)',
        '- After completing a meaningful step (e.g. "finished schema migration")',
        '- Before starting something risky (e.g. "about to refactor auth middleware")',
        '- Whenever you would write a git commit message',
        '- Every ~15 min during long uninterrupted work',
        '',
        'Keep it short and specific. "Refactored Redis connection. Halfway through rate limiter." not "working on task".',
        '',
        'Protocol: Auto-created on task done. Call manually after reasoning-heavy edits and every 15 minutes of active work. Write concrete state: name files and functions.',
      ].join('\n'),
      inputSchema: {
        progress:    z.string().describe('What has been done since the last checkpoint — specific, naming files and functions'),
        next_step:   z.string().optional().describe('The immediate next action when work resumes'),
        files_active: z.string().optional().describe('Comma-separated files currently being edited'),
        task_title:  z.string().optional().describe('Partial title of the task this checkpoint belongs to'),
      },
    },
    async ({ progress, next_step, files_active, task_title }) => {
      const project = getProject(cwd)
      trackToolCall(project.id)
      const session = getActiveSession(project.id)
      const linkedTask = task_title ? findTaskByTitle(project.id, task_title) : null
      const commit = getCommit(cwd)

      addCheckpoint(
        project.id,
        progress,
        next_step ?? null,
        files_active ?? null,
        session?.id ?? null,
        linkedTask?.id ?? null,
        commit
      )

      const resumeNote = next_step ? `\n\nNext: ${next_step}` : ''
      return { content: [{ type: 'text' as const, text: `Checkpoint saved ✓${resumeNote}\n\n_If this session ends, the next agent will resume from here._${contextWarning(project.id)}${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── ask_question ─────────────────────────────────────────────────

  server.registerTool(
    'ask_question',
    {
      description: [
        'Record an open question that is not blocking current work but should be answered.',
        '',
        'Use this instead of flag_blocker when:',
        '- You are uncertain about an approach but can proceed with a reasonable assumption',
        '- Something needs a human decision but you can continue for now',
        '- You noticed a potential issue that needs review but is not urgent',
        '',
        'Open questions surface in every read_context brief until answered.',
        'Answer them with answer_question.',
      ].join('\n'),
      inputSchema: {
        question:   z.string().describe('The question — specific enough that a future agent or human knows exactly what needs answering'),
        task_title: z.string().optional().describe('Partial task title this question relates to'),
      },
    },
    async ({ question, task_title }) => {
      const project = getProject(cwd)
      trackToolCall(project.id)
      const session = getActiveSession(project.id)
      const linkedTask = task_title ? findTaskByTitle(project.id, task_title) : null
      addQuestion(project.id, question, session?.id ?? null, linkedTask?.id ?? null)
      return { content: [{ type: 'text' as const, text: `Question recorded: "${question}"\n\nIt will surface in every read_context until answered via answer_question.${contextWarning(project.id)}${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── answer_question ──────────────────────────────────────────────

  server.registerTool(
    'answer_question',
    {
      description: 'Resolve an open question recorded with ask_question.',
      inputSchema: {
        question: z.string().describe('Partial match of the question to resolve'),
        answer:   z.string().describe('The answer or decision that resolves this question'),
      },
    },
    async ({ question, answer }) => {
      const project = getProject(cwd)
      trackToolCall(project.id)
      const q = findOpenQuestion(project.id, question)
      if (!q) return { content: [{ type: 'text' as const, text: `No open question found matching: "${question}"` }] }
      answerQuestion(q.id, answer)
      return { content: [{ type: 'text' as const, text: `Question resolved ✓\nQ: ${q.question}\nA: ${answer}${contextWarning(project.id)}${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── supersede_decision ───────────────────────────────────────────

  server.registerTool(
    'supersede_decision',
    {
      description: [
        'Call this when you are about to contradict or override something read_context showed as an active decision.',
        '',
        'Triggers:',
        '- You just chose an approach that conflicts with a logged decision',
        '- The user told you to change direction on something you previously decided',
        '- A decision you made earlier turned out to be wrong after implementation',
        '- You are confirming a provisional/experimental decision as final',
        '',
        'The old decision is archived (stays in history but removed from active context).',
        'Always include rationale explaining WHY the old decision was replaced.',
      ].join('\n'),
      inputSchema: {
        old_summary:  z.string().describe('Partial match of the old decision summary to supersede'),
        summary:      z.string().describe('The new decision summary'),
        rationale:    z.string().optional().describe('Why the old decision was replaced'),
        alternatives: z.string().optional().describe('Other options considered'),
        context:      z.string().optional().describe('What triggered the change'),
        files:        z.string().optional().describe('Comma-separated related files'),
        tags:         z.string().optional().describe('Comma-separated tags'),
        task_title:   z.string().optional().describe('Partial task title to link'),
      },
    },
    async ({ old_summary, summary, rationale, alternatives, context, files, tags, task_title }) => {
      const project = getProject(cwd)
      trackToolCall(project.id)
      const session = getActiveSession(project.id)

      // Find the old decision
      const all = getAllDecisions(project.id)
      const k = old_summary.toLowerCase()
      const old = all.find(d => d.summary.toLowerCase().includes(k) && d.status === 'active')
      if (!old) return { content: [{ type: 'text' as const, text: `No active decision found matching: "${old_summary}"` }] }

      // Create the new decision
      const linkedTask = task_title ? findTaskByTitle(project.id, task_title) : null
      const newDecision = addDecision(project.id, summary, rationale, alternatives, session?.id, getBranch(cwd), getCommit(cwd), context ?? `Supersedes: "${old.summary}"`, files, tags, linkedTask?.id)
      writeDecision(cwd, newDecision)

      // Mark old as superseded
      supersedeDecision(old.id, newDecision.id)
      deleteChunk(project.id, 'decision', old.id)

      // Index new decision
      const chunkContent = [
        `Decision: ${summary}`,
        rationale    && `Rationale: ${rationale}`,
        alternatives && `Alternatives: ${alternatives}`,
        `Supersedes: "${old.summary}"`,
        files        && `Files: ${files}`,
        tags         && `Tags: ${tags}`,
      ].filter(Boolean).join('\n')
      upsertChunk(project.id, 'decision', newDecision.id, chunkContent)

      // Superseding decisions inherit project scope — exempt from decay
      setChunkDecayExempt(project.id, 'decision', newDecision.id, true)

      return { content: [{ type: 'text' as const, text: `Decision superseded ✓\nOld: "${old.summary}" → archived\nNew: "${summary}"${contextWarning(project.id)}${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── resolve_observation ──────────────────────────────────────────

  server.registerTool(
    'resolve_observation',
    {
      description: [
        'Mark an observation/note as resolved — it has been addressed and is no longer relevant to active work.',
        '',
        'Use this to clean up stale context:',
        '- An observation about a bug that has been fixed',
        '- A note about a constraint that no longer applies',
        '- A blocker that has been unblocked',
        '',
        'Resolved observations are removed from search_memory results and no longer pollute context.',
      ].join('\n'),
      inputSchema: {
        observation: z.string().describe('Partial match of the observation text to resolve'),
      },
    },
    async ({ observation }) => {
      const project = getProject(cwd)
      trackToolCall(project.id)
      const note = findUnresolvedNote(project.id, observation)
      if (!note) return { content: [{ type: 'text' as const, text: `No unresolved observation found matching: "${observation}"` }] }
      resolveNote(note.id)
      deleteChunk(project.id, 'note', note.id)
      return { content: [{ type: 'text' as const, text: `Observation resolved ✓: "${note.content.slice(0, 80)}..."${contextWarning(project.id)}${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── check_signals ─────────────────────────────────────────────────

  server.registerTool(
    'check_signals',
    {
      description: [
        'Check for pending developer signals (messages, priority changes, answers to your questions).',
        '',
        'Developers can send you signals mid-session via the CLI (`kontinue signal`) or web dashboard.',
        'Signals are also automatically injected into other tool responses, but call this explicitly',
        'to check when idle or between tasks.',
      ].join('\n'),
      inputSchema: {},
    },
    async () => {
      const project = getProject(cwd)
      trackToolCall(project.id)
      const signals = getUnacknowledgedSignals(project.id)
      if (signals.length === 0) {
        return { content: [{ type: 'text' as const, text: `No pending signals.${contextWarning(project.id)}${statusLine(project.id)}` }] }
      }
      const lines = ['## Developer Signals', '']
      for (const s of signals) {
        const prefix = s.type === 'abort' ? 'URGENT'
          : s.type === 'priority' ? 'PRIORITY'
          : s.type === 'answer' ? 'ANSWER'
          : 'MESSAGE'
        lines.push(`- **[${prefix}]** ${s.content} _(id: ${s.id})_`)
        if (s.status === 'pending') markSignalDelivered(s.id)
      }
      lines.push('')
      lines.push('Call `acknowledge_signal` after processing.')
      return { content: [{ type: 'text' as const, text: `${lines.join('\n')}${contextWarning(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── acknowledge_signal ────────────────────────────────────────────

  server.registerTool(
    'acknowledge_signal',
    {
      description: [
        'Acknowledge developer signal(s) after processing them.',
        '',
        'Call this after you have read and acted on signals from the developer.',
        'If no signal_id is provided, acknowledges all delivered signals.',
      ].join('\n'),
      inputSchema: {
        signal_id: z.number().optional().describe('ID of a specific signal to acknowledge. Omit to acknowledge all.'),
        response:  z.string().optional().describe('Optional response to the developer about what action was taken.'),
      },
    },
    async ({ signal_id, response }) => {
      const project = getProject(cwd)
      trackToolCall(project.id)
      if (signal_id) {
        markSignalAcknowledged(signal_id)
      } else {
        const delivered = getUnacknowledgedSignals(project.id)
        for (const s of delivered) markSignalAcknowledged(s.id)
      }
      const msg = response ? `Signal(s) acknowledged: ${response}` : 'Signal(s) acknowledged.'
      return { content: [{ type: 'text' as const, text: `${msg}${contextWarning(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── prepare_delegation ─────────────────────────────────────────────

  server.registerTool(
    'prepare_delegation',
    {
      description: [
        'Optional: enrich a subagent prompt with Kontinue context before spawning it.',
        '',
        'Call this when the subagent task involves code that has prior decisions or observations in memory.',
        'It searches memory for relevant context and returns a brief to include in the prompt.',
        '',
        'Not required for simple exploration subagents. Always recommended for subagents that will edit code.',
        '',
        'After any subagent returns, you MUST call `process_subagent_result` — that step is mandatory.',
      ].join('\n'),
      inputSchema: {
        task: z.string().describe('What the subagent will do — used to search relevant memory'),
      },
    },
    async ({ task }) => {
      const project = getProject(cwd)
      trackToolCall(project.id)
      const session = getActiveSession(project.id)

      const lines: string[] = ['## Delegation Brief', '']

      // ── Context: active task, plan, decisions, observations ──
      lines.push('### Context')
      const ipTasks = getAllOpenTasks(project.id).filter(t => t.status === 'in-progress')
      if (ipTasks.length > 0) {
        const t = ipTasks[0]
        const items = getTaskItems(t.id)
        const doneItems = items.filter(i => i.done)
        lines.push(`**Active task:** #${t.id} ${t.title}${t.description ? ` — ${t.description}` : ''}`)
        if (items.length > 0) {
          lines.push(`**Progress:** ${doneItems.length}/${items.length} items done`)
          for (const item of items) {
            lines.push(`  ${item.done ? '✓' : '○'} ${item.content}`)
          }
        }
        // Task-linked decisions
        const taskDecisions = getDecisionsByTask(t.id)
        if (taskDecisions.length > 0) {
          lines.push('')
          lines.push('**Task decisions:**')
          for (const d of taskDecisions.slice(0, 5)) {
            lines.push(`- ${d.summary}${d.rationale ? ` — ${d.rationale.slice(0, 100)}` : ''}`)
          }
        }
        // Task-linked observations
        const taskNotes = getNotesByTask(t.id)
        if (taskNotes.length > 0) {
          lines.push('')
          lines.push('**Task observations:**')
          for (const n of taskNotes.slice(0, 5)) {
            lines.push(`- ${n.content.slice(0, 120)}`)
          }
        }
      } else {
        lines.push('_No active in-progress task._')
      }

      // Active plan
      const plans = getActivePlans(project.id)
      if (plans.length > 0) {
        const plan = plans[0]
        const steps = getPlanSteps(plan.id)
        const currentStep = steps.find(s => s.status === 'pending' || s.status === 'in-progress')
        lines.push('')
        lines.push(`**Active plan:** ${plan.title}${plan.goal ? ` — ${plan.goal}` : ''}`)
        if (currentStep) lines.push(`**Current step:** ${currentStep.content}`)
      }

      // Open questions
      const questions = getOpenQuestions(project.id)
      if (questions.length > 0) {
        lines.push('')
        lines.push('**Open questions:**')
        for (const q of questions.slice(0, 3)) {
          lines.push(`- ${q.question}`)
        }
      }

      // Project-wide active decisions
      const activeDecisions = getActiveDecisions(project.id, 5)
      if (activeDecisions.length > 0) {
        lines.push('')
        lines.push('**Active decisions:**')
        for (const d of activeDecisions) {
          lines.push(`- ${d.summary}`)
        }
      }

      // ── Memory search ──
      lines.push('')
      lines.push('### Relevant Memory')
      // Extract keywords from task description
      const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'because', 'if', 'when', 'where', 'how', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their'])
      const keywords = task.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w))
      const searchTerms = keywords.slice(0, 3)

      let memoryResults: Array<{ content: string; source_type: string }> = []
      for (const term of searchTerms) {
        const results = searchChunks(project.id, term, undefined, 3)
        for (const r of results) {
          if (!memoryResults.some(m => m.content === r.content)) {
            memoryResults.push(r)
          }
        }
      }
      memoryResults = memoryResults.slice(0, 5)

      if (memoryResults.length > 0) {
        for (const chunk of memoryResults) {
          lines.push(`- [${chunk.source_type}] ${chunk.content.slice(0, 150)}`)
        }
      } else {
        lines.push('_No relevant memory found for this task._')
      }

      // ── Instructions for parent agent ──
      lines.push('')
      lines.push('### After the Subagent Returns')
      lines.push('Call `process_subagent_result` with the subagent\'s full response text.')
      lines.push('It auto-extracts decisions, findings, and recommendations and persists them.')
      lines.push('Observations the subagent persisted via `add_observation` are NOT duplicated.')

      // ── Subagent instructions block (include in prompt) ──
      lines.push('')
      lines.push('### Subagent Instructions (include in prompt)')
      lines.push('Copy the block below into the Agent tool\'s `prompt` parameter:')
      lines.push('')
      lines.push('```')
      lines.push(SUBAGENT_INSTRUCTIONS)
      lines.push('```')

      const text = lines.join('\n')
      return { content: [{ type: 'text' as const, text: `${text}${contextWarning(project.id)}${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── process_subagent_result ──────────────────────────────────────

  server.registerTool(
    'process_subagent_result',
    {
      description: [
        'You MUST call this after EVERY subagent returns — no exceptions.',
        '',
        'Pass the subagent\'s full response text. This tool:',
        '1. Extracts **Decisions** and persists each as a task-scoped decision',
        '2. Extracts **Findings** and **Recommendations** as observations',
        '3. Links everything to the current in-progress task',
        '',
        'Without this call, subagent work is lost on compaction. One call replaces all manual persistence.',
      ].join('\n'),
      inputSchema: {
        result: z.string().describe('The full text response returned by the subagent'),
        task_title: z.string().optional().describe('Partial title of the task this subagent work belongs to'),
      },
    },
    async ({ result, task_title }) => {
      const project = getProject(cwd)
      trackToolCall(project.id)
      const session = getActiveSession(project.id)
      const linkedTask = task_title ? findTaskByTitle(project.id, task_title) : null

      const persisted: string[] = []

      // Extract sections using markdown headers
      const sectionPattern = /\*\*(\w+)\*\*\s*[—–-]\s*([\s\S]*?)(?=\*\*\w+\*\*\s*[—–-]|$)/g
      let match: RegExpExecArray | null
      while ((match = sectionPattern.exec(result)) !== null) {
        const sectionName = match[1].toLowerCase()
        const sectionContent = match[2].trim()
        if (!sectionContent) continue

        if (sectionName === 'decisions') {
          // Each line starting with - is a decision
          const items = sectionContent.split('\n').filter(l => l.trim().startsWith('-'))
          for (const item of items) {
            const text = item.replace(/^-\s*/, '').trim()
            if (text.length < 10) continue
            addDecision(project.id, text, undefined, undefined, session?.id, getBranch(cwd), getCommit(cwd), 'Via subagent', undefined, undefined, linkedTask?.id, 'task')
            persisted.push(`decision: ${text.slice(0, 60)}`)
          }
          // If no bullet items, persist whole block as one decision
          if (items.length === 0 && sectionContent.length > 10) {
            const summary = sectionContent.split('\n')[0].slice(0, 120)
            addDecision(project.id, summary, sectionContent, undefined, session?.id, getBranch(cwd), getCommit(cwd), 'Via subagent', undefined, undefined, linkedTask?.id, 'task')
            persisted.push(`decision: ${summary.slice(0, 60)}`)
          }
        } else if (sectionName === 'findings' || sectionName === 'recommendations') {
          const content = `Subagent ${sectionName}: ${sectionContent.slice(0, 500)}`
          const note = addNote(project.id, content, session?.id, linkedTask?.id)
          upsertChunk(project.id, 'note', note.id, content)
          persisted.push(`${sectionName}: ${sectionContent.slice(0, 60)}`)
        }
        // Skip 'observations' — subagent should have already persisted these via add_observation
      }

      // If nothing was extracted, persist the whole result as an observation
      if (persisted.length === 0 && result.trim().length > 20) {
        const content = `Subagent result: ${result.slice(0, 500)}`
        const note = addNote(project.id, content, session?.id, linkedTask?.id)
        upsertChunk(project.id, 'note', note.id, content)
        persisted.push('observation: full result persisted')
      }

      const summary = persisted.length > 0
        ? `Processed subagent result — persisted ${persisted.length} item(s):\n${persisted.map(p => `- ${p}`).join('\n')}`
        : 'Subagent returned empty or unparseable result — nothing persisted.'

      return { content: [{ type: 'text' as const, text: `${summary}${contextWarning(project.id)}${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── MCP Resources — auto-surface in clients that support resource attachment ─

  server.registerResource(
    'board',
    'kontinue://board',
    { description: 'Live task board — in-progress and todo tasks for this project', mimeType: 'text/plain' },
    async (_uri) => {
      const project = getProject(cwd)
      const open = getAllOpenTasks(project.id)
      const ip   = open.filter(t => t.status === 'in-progress')
      const todo = open.filter(t => t.status === 'todo')
      const lines = [
        `# Task Board — ${project.name}`,
        '',
        '## In Progress',
        ...ip.map(t => `- ◉ **${t.title}**${t.description ? `\n  > ${t.description.slice(0, 120)}` : ''}`),
        ip.length === 0 ? '_none_' : '',
        '',
        '## Todo',
        ...todo.map(t => `- ○ **${t.title}**${t.description ? `\n  > ${t.description.slice(0, 120)}` : ''}`),
        todo.length === 0 ? '_none_' : '',
      ]
      return { contents: [{ uri: 'kontinue://board', mimeType: 'text/plain', text: lines.filter(l => l !== undefined).join('\n') }] }
    }
  )

  server.registerResource(
    'context',
    'kontinue://context',
    { description: 'Current session context — last handoff, open questions, checkpoint status', mimeType: 'text/plain' },
    async (_uri) => {
      const project = getProject(cwd)
      const last  = getLastSession(project.id)
      const cp    = getLastCheckpoint(project.id)
      const qs    = getOpenQuestions(project.id)
      const cpLine = cp
        ? `${Math.round((Date.now() - new Date(cp.created_at).getTime()) / 60_000)}m ago — ${cp.progress}${cp.next_step ? ` → ${cp.next_step}` : ''}`
        : '_none_'
      const lines = [
        `# Kontinue Context — ${project.name}`,
        '',
        '## Last Handoff',
        last?.handoff_note ? last.handoff_note.slice(0, 500) : '_none_',
        '',
        `## Last Checkpoint\n${cpLine}`,
        '',
        '## Open Questions',
        qs.length > 0 ? qs.map(q => `- ❓ ${q.question}`).join('\n') : '_none_',
      ]
      return { contents: [{ uri: 'kontinue://context', mimeType: 'text/plain', text: lines.join('\n') }] }
    }
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
