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
  resolveNote,
  findUnresolvedNote,
  getPendingSignals,
  markSignalDelivered,
  markSignalAcknowledged,
  getUnacknowledgedSignals,
} from '../store/queries.js'
import { writeDecision, writeNote, writeSession, rewriteTaskList, writePlan, deletePlanFile } from '../store/markdown.js'
import { getBranch, getCommit, getRecentLog, getDiffFiles } from '../utils/git.js'

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
      return '\n\n> **WARNING:** `kontinue_read_context` has not been called this session. Call it now before continuing — you may be working without awareness of prior decisions or open tasks.'
    }
    return ''
  }

  // 1-line board+checkpoint footer appended to every mutation tool response
  function statusLine(projectId: number): string {
    const open = getAllOpenTasks(projectId)
    const ip   = open.filter(t => t.status === 'in-progress').length
    const todo = open.filter(t => t.status === 'todo').length
    const cp   = getLastCheckpoint(projectId)
    const qs   = getOpenQuestions(projectId)
    const sigs = getUnacknowledgedSignals(projectId)
    const cpAge = cp
      ? `${Math.round((Date.now() - new Date(cp.created_at).getTime()) / 60_000)}m ago`
      : 'none'
    const parts = [
      `${ip} active · ${todo} todo`,
      `checkpoint: ${cpAge}`,
      qs.length > 0 ? `${qs.length} question${qs.length > 1 ? 's' : ''} open` : '',
      sigs.length > 0 ? `${sigs.length} signal${sigs.length > 1 ? 's' : ''} pending` : '',
    ].filter(Boolean)
    return `\n\n---\n_[${parts.join(' | ')}]_`
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
    lines.push('> Call `kontinue_acknowledge_signal` after you have processed this.')
    return lines.join('\n')
  }

  // ── kontinue_read_context ─────────────────────────────────────────────────

  server.registerTool(
    'kontinue_read_context',
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

      // Auto-close zombie sessions >2h old
      closeStaleSessions(project.id, 2)

      // Auto-start session if none exists — agents shouldn't need to run `kontinue start` separately
      if (!getActiveSession(project.id)) {
        startSession(project.id, getBranch(cwd) ?? null, getCommit(cwd) ?? null)
      }

      const last        = getLastSession(project.id)
      const open        = getAllOpenTasks(project.id)
      const inProgress  = open.filter(t => t.status === 'in-progress')
      const todo        = open.filter(t => t.status === 'todo')
      const branch      = getBranch(cwd)
      const commit      = getCommit(cwd)
      const lastCp      = getLastCheckpoint(project.id)
      const openQs      = getOpenQuestions(project.id)

      // Checkpoint staleness warning
      const cpWarn = (() => {
        if (!lastCp) return '\n> ⚠️ **No checkpoint recorded yet.** Call `kontinue_checkpoint` after meaningful progress so this session can be resumed if context is lost.'
        const minsAgo = Math.round((Date.now() - new Date(lastCp.created_at).getTime()) / 60_000)
        if (minsAgo > 15) return `\n> ⚠️ **Last checkpoint ${minsAgo}m ago.** Call \`kontinue_checkpoint\` now — if this session ends, ${minsAgo} minutes of work has no recovery record.`
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
        ...inProgress.map(t => [
          `- ◉ **${t.title}**${t.branch ? ` _(${t.branch})_` : ''}`,
          t.description ? `  > ${t.description}` : '',
        ].filter(Boolean).join('\n')),
        inProgress.length === 0 ? '_none_' : '',
      ]

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
            lines.push(`- ○ **${t.title}**${t.description ? `\n  > ${t.description}` : ''}`)
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
      const activeSession = getActiveSession(project.id)
      if (activeSession && !activeSession.context_read_at) {
        markContextRead(activeSession.id)
      }

      const text = lines.filter(l => l !== undefined).join('\n') + signalCheck(project.id)
      return { content: [{ type: 'text' as const, text }] }
    }
  )

  // ── kontinue_update_task ──────────────────────────────────────────────────

  server.registerTool(
    'kontinue_update_task',
    {
      description: [
        'Create, start, complete, or abandon tasks. Call this whenever you begin or finish a unit of work.',
        '',
        'Actions:',
        '- "add"     — Create a new task before starting a unit of work.',
        '             Title: short imperative ("Add rate limiting to /api/auth").',
        '             Description: what done looks like — acceptance criteria, scope, any known constraints.',
        '             Include description ALWAYS — it makes handoffs self-contained.',
        '- "start"   — Mark a task in-progress when you begin actively working on it.',
        '- "done"    — Mark a task completed immediately after finishing it.',
        '             Outcome: describe what was done, what files were changed, what approach was taken.',
        '             ALWAYS follow with: kontinue_checkpoint, then kontinue_check_signals.',
        '- "abandon" — Mark a task dropped. Always pair with kontinue_log_decision to record why.',
        '',
        'Title matching for start/done/abandon is fuzzy — a partial match is sufficient.',
        'Dual-writes: updates the SQLite tasks table AND rewrites .kontinue/tasks/todo.md in-place.',
      ].join('\n'),
      inputSchema: {
        action:      z.enum(['add', 'start', 'done', 'abandon']).describe('"add" creates; "start" marks in-progress; "done" marks complete; "abandon" marks dropped'),
        title:       z.string().describe('Full task title for "add", or a partial match string for "start" / "done" / "abandon"'),
        description: z.string().optional().describe('For "add": what needs to be done and what done looks like (acceptance criteria). Be specific.'),
        items:       z.string().optional().describe('For "add": comma-separated checklist steps, e.g. "Write schema migration,Update queries,Add MCP tool". Each becomes a trackable sub-item.'),
        outcome:     z.string().optional().describe('For "done": what was actually done, what approach was taken, which files were changed.'),
      },
    },
    async ({ action, title, description, items, outcome }) => {
      const project = getProject(cwd)
      const session = getActiveSession(project.id)

      if (action === 'add') {
        const task = addTask(project.id, title, session?.id, getBranch(cwd), description)
        if (description) upsertChunk(project.id, 'task', task.id, `Task: ${title}\n${description}`)
        if (items) {
          const steps = items.split(',').map(s => s.trim()).filter(Boolean)
          addTaskItems(task.id, steps)
        }
      } else {
        const task = findTaskByTitle(project.id, title)
        if (!task) return { content: [{ type: 'text' as const, text: `No open task found matching: "${title}"` }] }
        const statusMap = { start: 'in-progress', done: 'done', abandon: 'abandoned' } as const
        updateTaskStatus(task.id, statusMap[action])
        if (action === 'done' && outcome) {
          updateTaskOutcome(task.id, outcome)
          upsertChunk(project.id, 'task', task.id, `Task completed: ${task.title}\nOutcome: ${outcome}`)
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
        ? '\n\n> **NEXT:** Call `kontinue_checkpoint` now to record this milestone. Then call `kontinue_check_signals` and log any decisions or observations made during this task before starting the next one.'
        : ''

      return { content: [{ type: 'text' as const, text: `Task "${title}" — ${action} ✓${warn}${descWarn}${doneNudge}${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── kontinue_log_decision ─────────────────────────────────────────────────

  server.registerTool(
    'kontinue_log_decision',
    {
      description: [
        'Record an architectural or implementation decision. Call this whenever you choose one approach over another.',
        '',
        'Call this whenever you:',
        '- Choose one technology, library, or approach over another',
        '- Decide NOT to do something and why (e.g. dropped Redis, avoided a pattern)',
        '- Establish a convention or constraint that future sessions should respect',
        '- Resolve a technical trade-off that took non-trivial reasoning',
        '',
        'Do NOT call this for trivial details — only decisions a future session would need context for.',
        '',
        'Dual-writes:',
        '1. Inserts a row into the SQLite decisions table (indexed for search)',
        '2. Writes .kontinue/decisions/YYYY-MM-DD-<slug>.md (human-readable, Obsidian-browsable)',
        '3. Indexes all fields as a memory chunk for future search',
        '',
        'The rationale and alternatives fields are strongly recommended — they are what make memory useful across sessions.',
        'Pass files you were actively editing when this decision was made so future agents can trace decisions back to code.',
      ].join('\n'),
      inputSchema: {
        summary:      z.string().describe('One-line decision written as a statement, e.g. "Chose PKCE over client_secret for public OAuth clients"'),
        rationale:    z.string().optional().describe('Why this decision was made — the reasoning, constraints, or evidence that led to it'),
        alternatives: z.string().optional().describe('Other options considered and why they were not chosen'),
        context:      z.string().optional().describe('Background discussion, relevant conversation, or what was happening when this decision was made'),
        files:        z.string().optional().describe('Comma-separated list of source files related to this decision, e.g. "src/auth/middleware.ts,src/db/schema.ts"'),
        tags:         z.string().optional().describe('Comma-separated category tags, e.g. "architecture,security,performance,dependency"'),
        task_title:   z.string().optional().describe('Partial title of the task this decision belongs to — links it to a board item'),
      },
    },
    async ({ summary, rationale, alternatives, context, files, tags, task_title }) => {
      const project = getProject(cwd)
      const session = getActiveSession(project.id)

      const linkedTask = task_title ? findTaskByTitle(project.id, task_title) : null
      const decision = addDecision(project.id, summary, rationale, alternatives, session?.id, getBranch(cwd), getCommit(cwd), context, files, tags, linkedTask?.id)
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

      const warn = contextWarning(project.id)
      const rationaleWarn = !rationale
        ? '\n\n> **REMINDER:** No `rationale` provided. Future agents cannot understand *why* this was decided. Call `kontinue_log_decision` again with the same `summary` plus a `rationale` to fill it in.'
        : ''

      return { content: [{ type: 'text' as const, text: `Decision recorded: "${summary}" → .kontinue/decisions/${warn}${rationaleWarn}${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── kontinue_write_handoff ────────────────────────────────────────────────

  server.registerTool(
    'kontinue_write_handoff',
    {
      description: [
        'Call this at the end of a session, or when the context window is nearing its limit.',
        '',
        'Write a handoff note that a future agent can read cold and immediately understand:',
        '- What was accomplished (specific: name files changed, features completed, bugs fixed)',
        '- What was NOT finished and why',
        '- The exact next step(s) to take when the session resumes',
        '- Important state, edge cases, or gotchas discovered that are not obvious from the code',
        '',
        'Do not write vague summaries like "worked on auth". Write what you would want to read with no memory of this session.',
        '',
        'Dual-writes:',
        '1. Closes the active session row in SQLite (sets ended_at, handoff_note, blockers)',
        '2. Writes .kontinue/sessions/YYYY-MM-DD-HH-MM.md with the full note',
        '3. Indexes the summary as a searchable memory chunk',
      ].join('\n'),
      inputSchema: {
        summary: z.string().describe('Specific summary of what was accomplished and what the next session should do first. Name files, functions, and decisions made.'),
        blockers: z.string().optional().describe('Unresolved issues or open questions blocking progress. Include enough context for a fresh session to understand without reading code.'),
      },
    },
    async ({ summary, blockers }) => {
      const project = getProject(cwd)
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

      const thinWarn = summary.trim().length < 80
        ? '\n\n> **WARNING:** This handoff summary is very short. Name the specific files changed, functions added/fixed, and the exact next action. A vague handoff means the next agent starts blind.'
        : ''

      return { content: [{ type: 'text' as const, text: `Handoff saved → .kontinue/sessions/${thinWarn}${signalCheck(project.id)}` }] }
    }
  )

  // ── kontinue_add_observation ────────────────────────────────────────────────

  server.registerTool(
    'kontinue_add_observation',
    {
      description: [
        'Record a mid-task finding, insight, or discovery that matters for the current or future work.',
        '',
        'Use this for lightweight notes that are NOT decisions and NOT blockers:',
        '- "Discovered the auth middleware is stateful — affects the session task"',
        '- "The DB schema has a latent N+1 issue in the tasks query — note for later"',
        '- "Found that the existing test suite skips integration tests by default"',
        '- "User clarified that pagination is out of scope for this sprint"',
        '',
        'Observations are indexed in memory and surfaced by kontinue_search_memory.',
        'They are lighter-weight than decisions (no rationale/alternatives required).',
        'Link them to the task you are working on via the task_title parameter.',
      ].join('\n'),
      inputSchema: {
        observation: z.string().describe('What you discovered or learned — write it so a future agent reading it has full context without reading the code'),
        task_title:  z.string().optional().describe('Partial title of the task this observation relates to — links it to a board item'),
        files:       z.string().optional().describe('Comma-separated file paths relevant to this observation'),
      },
    },
    async ({ observation, task_title, files }) => {
      const project = getProject(cwd)
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

      return { content: [{ type: 'text' as const, text: `Observation recorded.${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── kontinue_flag_blocker ─────────────────────────────────────────────────

  server.registerTool(
    'kontinue_flag_blocker',
    {
      description: [
        'Record a blocker or unresolved issue mid-session without ending it.',
        '',
        'Call this when you encounter something that:',
        '- Blocks further progress on a task (missing info, broken dependency, unclear requirement)',
        '- Requires an external decision before work can continue',
        '- Is a known issue you are consciously deferring',
        '',
        'The blocker is saved immediately and surfaces in the next kontinue_read_context call, even if the session ends unexpectedly.',
        '',
        'Do not use this instead of kontinue_log_decision. Blockers are temporary obstacles; decisions are permanent records.',
      ].join('\n'),
      inputSchema: {
        blocker: z.string().describe('Clear description of what is blocked, why, and what information or action would unblock it'),
      },
    },
    async ({ blocker }) => {
      const project = getProject(cwd)
      const note = addNote(project.id, `BLOCKER: ${blocker}`, getActiveSession(project.id)?.id)
      writeNote(cwd, `BLOCKER: ${blocker}`)
      upsertChunk(project.id, 'note', note.id, `Blocker: ${blocker}`)
      return { content: [{ type: 'text' as const, text: `Blocker noted: "${blocker}"${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── kontinue_search_memory ────────────────────────────────────────────────

  server.registerTool(
    'kontinue_search_memory',
    {
      description: [
        "Search the project's persistent memory by keyword.",
        '',
        'Use this when you need to recall context before modifying a module or API:',
        '- Decisions logged across sessions',
        '- Handoff notes from previous sessions',
        '- Observations and blockers recorded during prior work',
        '',
        'Pass a keyword to search (e.g. "auth", "migration", "rate limit").',
        'If no keyword is provided, returns the most recent chunks.',
        'Use the optional type filter to narrow to a specific category.',
      ].join('\n'),
      inputSchema: {
        keyword: z.string().optional().describe('Search keyword — matches against memory chunk content. If omitted, returns most recent chunks.'),
        limit: z.number().optional().default(20).describe('Maximum memory chunks to return (default 20)'),
        type:  z.enum(['task','decision','note','session','architecture','identity']).optional().describe('Filter to a specific chunk type'),
      },
    },
    async ({ keyword, limit, type }) => {
      const project = getProject(cwd)
      const chunks = keyword
        ? searchChunks(project.id, keyword, type, limit)
        : (() => {
            let all = getAllChunks(project.id)
            if (type) all = all.filter(c => c.source_type === type)
            return all.slice(0, limit)
          })()

      const warn = contextWarning(project.id)

      if (chunks.length === 0) {
        return { content: [{ type: 'text' as const, text: `No memory indexed yet. Start a session and log some decisions.${warn}` }] }
      }

      const text = chunks
        .map(c => `### [${c.source_type}]\n${c.content}`)
        .join('\n\n---\n\n')

      return { content: [{ type: 'text' as const, text: `${text}${warn}` }] }
    }
  )

  // ── kontinue_read_decision ────────────────────────────────────────────────

  server.registerTool(
    'kontinue_read_decision',
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
        return { content: [{ type: 'text' as const, text: `No decisions found matching "${keyword}".${warn}` }] }
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

      return { content: [{ type: 'text' as const, text: `${text}${warn}` }] }
    }
  )

  // ── kontinue_update_plan ──────────────────────────────────────────────────

  server.registerTool(
    'kontinue_update_plan',
    {
      description: [
        'Create or update a structured plan — a sequence of steps toward a goal.',
        '',
        'Actions:',
        '- "add"      — Create a new plan. Provide title, optional goal, optional comma-separated steps.',
        '- "status"   — Change plan status: draft | active | complete | archived.',
        '- "step_done"   — Mark a step done by partial content match.',
        '- "step_skip"   — Mark a step skipped.',
        '- "step_add"    — Append a new step to an existing plan.',
        '- "delete"   — Delete the plan entirely.',
        '',
        'Dual-writes: SQLite + .kontinue/plans/<slug>.md',
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

      if (action === 'add') {
        const plan = createPlan(project.id, title, goal)
        const planSteps = steps
          ? addPlanSteps(plan.id, steps.split(',').map(s => s.trim()).filter(Boolean))
          : []
        writePlan(cwd, plan, planSteps)
        return { content: [{ type: 'text' as const, text: `Plan created: "${plan.title}" → .kontinue/plans/` }] }
      }

      const plan = findPlanByTitle(project.id, title)
      if (!plan) return { content: [{ type: 'text' as const, text: `No plan found matching: "${title}"` }] }

      if (action === 'status') {
        if (!status) return { content: [{ type: 'text' as const, text: 'Provide --status: draft | active | complete | archived' }] }
        updatePlanStatus(plan.id, status)
        if (goal) updatePlanGoal(plan.id, goal)
      } else if (action === 'step_add') {
        if (!step) return { content: [{ type: 'text' as const, text: 'Provide step content via "step" parameter' }] }
        addPlanSteps(plan.id, [step])
      } else if (action === 'step_done' || action === 'step_skip') {
        if (!step) return { content: [{ type: 'text' as const, text: 'Provide partial step content to match' }] }
        const allSteps = getPlanSteps(plan.id)
        const match = allSteps.find(s => s.content.toLowerCase().includes(step.toLowerCase()))
        if (!match) return { content: [{ type: 'text' as const, text: `No step found matching: "${step}"` }] }
        updatePlanStepStatus(match.id, action === 'step_done' ? 'done' : 'skipped')
      } else if (action === 'delete') {
        deletePlanFile(cwd, plan)
        deletePlan(plan.id)
        return { content: [{ type: 'text' as const, text: `Plan deleted: "${plan.title}"` }] }
      }

      // Re-fetch and rewrite markdown
      const updated = findPlanByTitle(project.id, title) ?? plan
      const freshSteps = getPlanSteps(plan.id)
      writePlan(cwd, updated, freshSteps)

      return { content: [{ type: 'text' as const, text: `Plan "${plan.title}" — ${action} ✓` }] }
    }
  )

  // ── kontinue_read_entity ──────────────────────────────────────────────────

  server.registerTool(
    'kontinue_read_entity',
    {
      description: [
        'Look up everything Kontinue knows about a specific named concept — a file, module, API, data model, service, or pattern.',
        '',
        'Use this before modifying or extending a part of the codebase that may have been documented in memory:',
        '- Before editing a module: find past notes, known issues, or design constraints',
        '- Before implementing an API: check if design decisions were already logged',
        '- When the developer references something by name: get context before acting',
        '',
        'Returns up to 3 matching memory chunks. Each includes its source type (decision, note, session, architecture) so you know the origin and weight of the information.',
      ].join('\n'),
      inputSchema: {
        keyword: z.string().describe('Name or keyword identifying the entity — e.g. a filename, module name, API path, or concept like "auth middleware" or "token refresh"'),
      },
    },
    async ({ keyword }) => {
      const project = getProject(cwd)
      const chunks = getAllChunks(project.id)
      const k = keyword.toLowerCase()
      const matches = chunks.filter(c => c.content.toLowerCase().includes(k)).slice(0, 3)
      const warn = contextWarning(project.id)
      const text = matches.length
        ? matches.map(c => `[${c.source_type}]\n${c.content}`).join('\n\n---\n\n')
        : `No entity found matching "${keyword}".`
      return { content: [{ type: 'text' as const, text: `${text}${warn}` }] }
    }
  )

  // ── kontinue_checkpoint ───────────────────────────────────────────────────

  server.registerTool(
    'kontinue_checkpoint',
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
      return { content: [{ type: 'text' as const, text: `Checkpoint saved ✓${resumeNote}\n\n_If this session ends, the next agent will resume from here._${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── kontinue_ask_question ─────────────────────────────────────────────────

  server.registerTool(
    'kontinue_ask_question',
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
        'Answer them with kontinue_answer_question.',
      ].join('\n'),
      inputSchema: {
        question:   z.string().describe('The question — specific enough that a future agent or human knows exactly what needs answering'),
        task_title: z.string().optional().describe('Partial task title this question relates to'),
      },
    },
    async ({ question, task_title }) => {
      const project = getProject(cwd)
      const session = getActiveSession(project.id)
      const linkedTask = task_title ? findTaskByTitle(project.id, task_title) : null
      addQuestion(project.id, question, session?.id ?? null, linkedTask?.id ?? null)
      return { content: [{ type: 'text' as const, text: `Question recorded: "${question}"\n\nIt will surface in every read_context until answered via kontinue_answer_question.${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── kontinue_answer_question ──────────────────────────────────────────────

  server.registerTool(
    'kontinue_answer_question',
    {
      description: 'Resolve an open question recorded with kontinue_ask_question.',
      inputSchema: {
        question: z.string().describe('Partial match of the question to resolve'),
        answer:   z.string().describe('The answer or decision that resolves this question'),
      },
    },
    async ({ question, answer }) => {
      const project = getProject(cwd)
      const q = findOpenQuestion(project.id, question)
      if (!q) return { content: [{ type: 'text' as const, text: `No open question found matching: "${question}"` }] }
      answerQuestion(q.id, answer)
      return { content: [{ type: 'text' as const, text: `Question resolved ✓\nQ: ${q.question}\nA: ${answer}${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── kontinue_supersede_decision ───────────────────────────────────────────

  server.registerTool(
    'kontinue_supersede_decision',
    {
      description: [
        'Replace an old decision with a new one. The old decision is marked as superseded and removed from active context.',
        '',
        'Use this when:',
        '- You made a decision earlier that is now wrong or outdated',
        '- Circumstances changed and a different approach is needed',
        '- You want to evolve a provisional decision into a confirmed one',
        '',
        'The old decision stays in history but no longer appears in read_context or search_memory.',
        'Pass the old decision summary (partial match) and the new decision details.',
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

      return { content: [{ type: 'text' as const, text: `Decision superseded ✓\nOld: "${old.summary}" → archived\nNew: "${summary}"${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── kontinue_resolve_observation ──────────────────────────────────────────

  server.registerTool(
    'kontinue_resolve_observation',
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
      const note = findUnresolvedNote(project.id, observation)
      if (!note) return { content: [{ type: 'text' as const, text: `No unresolved observation found matching: "${observation}"` }] }
      resolveNote(note.id)
      deleteChunk(project.id, 'note', note.id)
      return { content: [{ type: 'text' as const, text: `Observation resolved ✓: "${note.content.slice(0, 80)}..."${signalCheck(project.id)}${statusLine(project.id)}` }] }
    }
  )

  // ── kontinue_check_signals ─────────────────────────────────────────────────

  server.registerTool(
    'kontinue_check_signals',
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
      const signals = getUnacknowledgedSignals(project.id)
      if (signals.length === 0) {
        return { content: [{ type: 'text' as const, text: `No pending signals.${statusLine(project.id)}` }] }
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
      lines.push('Call `kontinue_acknowledge_signal` after processing.')
      return { content: [{ type: 'text' as const, text: `${lines.join('\n')}${statusLine(project.id)}` }] }
    }
  )

  // ── kontinue_acknowledge_signal ────────────────────────────────────────────

  server.registerTool(
    'kontinue_acknowledge_signal',
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
      if (signal_id) {
        markSignalAcknowledged(signal_id)
      } else {
        const delivered = getUnacknowledgedSignals(project.id)
        for (const s of delivered) markSignalAcknowledged(s.id)
      }
      const msg = response ? `Signal(s) acknowledged: ${response}` : 'Signal(s) acknowledged.'
      return { content: [{ type: 'text' as const, text: `${msg}${statusLine(project.id)}` }] }
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
