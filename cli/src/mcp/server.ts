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
  getTasksByStatus,
  addDecision,
  addNote,
  addTask,
  findTaskByTitle,
  updateTaskStatus,
  getAllChunks,
  getChunkCount,
  upsertChunk,
  endSession,
} from '../store/queries.js'
import { writeDecision, writeNote, writeSession, rewriteTaskList } from '../store/markdown.js'
import { getBranch, getCommit, getRecentLog } from '../utils/git.js'

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

  // ── kontinue_read_context ─────────────────────────────────────────────────

  server.registerTool(
    'kontinue_read_context',
    {
      description: [
        'Call this tool at the very start of every coding session, before doing any other work.',
        '',
        'Returns a structured Markdown summary containing:',
        '- Project name and description',
        '- The handoff note from the previous session (what was accomplished, what was left unfinished)',
        '- Any blockers flagged in the last session',
        '- All tasks currently in-progress and todo',
        '- The 5 most recent architectural decisions',
        '',
        'Use this output to orient yourself before writing any code. Do not start work without reading this first.',
      ].join('\n'),
    },
    async () => {
      const project = getProject(cwd)
      const last = getLastSession(project.id)
      const open = getAllOpenTasks(project.id)
      const inProgress = open.filter(t => t.status === 'in-progress')
      const todo = open.filter(t => t.status === 'todo')
      const decisions = getRecentDecisions(project.id, 5)

      const branch = getBranch(cwd)
      const commit = getCommit(cwd)
      const recentLog = getRecentLog(cwd, 5)

      const lines: string[] = [
        `# Kontinue Context — ${project.name}`,
        '',
        project.description ? `**Description:** ${project.description}` : '',
        '',
        '## Git',
        branch ? `**Branch:** \`${branch}\`` : '_Not a git repository_',
        commit ? `**HEAD:** \`${commit}\`` : '',
        recentLog ? `\n### Recent Commits\n\`\`\`\n${recentLog}\n\`\`\`` : '',
        '',
        '## Last Handoff',
        last?.handoff_note ?? '_No previous session_',
        last?.blockers ? `\n**Blocker:** ${last.blockers}` : '',
        '',
        '## In Progress',
        ...inProgress.map(t => `- ◉ ${t.title}${t.branch ? ` _(${t.branch})_` : ''}`),
        inProgress.length === 0 ? '_none_' : '',
        '',
        '## Todo',
        ...todo.map(t => `- ○ ${t.title}`),
        todo.length === 0 ? '_none_' : '',
        '',
        '## Recent Decisions',
        ...decisions.map(d => `- ${d.created_at.slice(0, 10)}${d.branch ? ` \`${d.branch}\`` : ''} — ${d.summary}`),
        decisions.length === 0 ? '_none_' : '',
      ]

      return { content: [{ type: 'text' as const, text: lines.filter(l => l !== undefined).join('\n') }] }
    }
  )

  // ── kontinue_update_task ──────────────────────────────────────────────────

  server.registerTool(
    'kontinue_update_task',
    {
      description: [
        'Keep the task list accurate throughout the session. Call it whenever task state changes.',
        '',
        'Actions:',
        '- "add"     — Create a new task before starting a unit of work. Title should be a short imperative (e.g. "Add rate limiting to /api/auth").',
        '- "start"   — Mark a task in-progress when you begin actively working on it.',
        '- "done"    — Mark a task completed immediately after finishing it, before moving on.',
        '- "abandon" — Mark a task dropped. Always pair with kontinue_log_decision to record why.',
        '',
        'Title matching for start/done/abandon is fuzzy — a partial match is sufficient.',
        'Dual-writes: updates the SQLite tasks table AND rewrites .kontinue/tasks/todo.md in-place.',
      ].join('\n'),
      inputSchema: {
        action: z.enum(['add', 'start', 'done', 'abandon']).describe('"add" creates a task; "start" marks it in-progress; "done" marks it complete; "abandon" marks it dropped'),
        title: z.string().describe('Full task title for "add", or a partial match string for "start" / "done" / "abandon"'),
      },
    },
    async ({ action, title }) => {
      const project = getProject(cwd)
      const session = getActiveSession(project.id)

      if (action === 'add') {
        addTask(project.id, title, session?.id, getBranch(cwd))
      } else {
        const task = findTaskByTitle(project.id, title)
        if (!task) return { content: [{ type: 'text' as const, text: `No open task found matching: "${title}"` }] }
        const statusMap = { start: 'in-progress', done: 'done', abandon: 'abandoned' } as const
        updateTaskStatus(task.id, statusMap[action])
      }

      const open = getAllOpenTasks(project.id)
      rewriteTaskList(
        open.filter(t => t.status === 'in-progress'),
        open.filter(t => t.status === 'todo'),
        getTasksByStatus(project.id, 'done')
      )

      return { content: [{ type: 'text' as const, text: `Task "${title}" — ${action} ✓` }] }
    }
  )

  // ── kontinue_log_decision ─────────────────────────────────────────────────

  server.registerTool(
    'kontinue_log_decision',
    {
      description: [
        'Record a meaningful architectural or implementation decision into persistent memory.',
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
        '3. Indexes the decision as a memory chunk',
        '',
        'The rationale and alternatives fields are strongly recommended — they are what make memory useful across sessions.',
      ].join('\n'),
      inputSchema: {
        summary: z.string().describe('One-line decision written as a statement, e.g. "Chose PKCE over client_secret for public OAuth clients"'),
        rationale: z.string().optional().describe('Why this decision was made — the reasoning, constraints, or evidence that led to it'),
        alternatives: z.string().optional().describe('Other options considered and why they were not chosen'),
      },
    },
    async ({ summary, rationale, alternatives }) => {
      const project = getProject(cwd)
      const session = getActiveSession(project.id)

      const decision = addDecision(project.id, summary, rationale, alternatives, session?.id, getBranch(cwd), getCommit(cwd))
      writeDecision(decision)

      const chunkContent = [`Decision: ${summary}`, rationale && `Rationale: ${rationale}`, alternatives && `Alternatives: ${alternatives}`].filter(Boolean).join('\n')
      upsertChunk(project.id, 'decision', decision.id, chunkContent)

      return { content: [{ type: 'text' as const, text: `Decision recorded: "${summary}" → .kontinue/decisions/` }] }
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

      endSession(session.id, summary, blockers ?? '')
      const updated = { ...session, ended_at: new Date().toISOString(), handoff_note: summary, blockers: blockers ?? null }
      writeSession(updated)
      upsertChunk(project.id, 'session', session.id, summary)

      return { content: [{ type: 'text' as const, text: `Handoff saved → .kontinue/sessions/` }] }
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
      addNote(project.id, `BLOCKER: ${blocker}`, getActiveSession(project.id)?.id)
      writeNote(`BLOCKER: ${blocker}`)
      upsertChunk(project.id, 'note', Date.now(), `Blocker: ${blocker}`)
      return { content: [{ type: 'text' as const, text: `Blocker noted: "${blocker}"` }] }
    }
  )

  // ── kontinue_search_memory ────────────────────────────────────────────────

  server.registerTool(
    'kontinue_search_memory',
    {
      description: [
        "Search the project's persistent memory across all past sessions, decisions, notes, and handoffs.",
        '',
        'Use this when you need to recall:',
        '- Why a past decision was made (e.g. "why did we drop Redis?")',
        '- Whether something was already tried and what the outcome was',
        '- The current status of a feature that started in a previous session',
        '- Context about a file, module, or API before modifying it',
        '- Anything the developer or a previous agent noted as relevant',
        '',
        'Returns the top matching memory chunks as plain text. You synthesize the answer from these chunks — Kontinue does not call an LLM on your behalf.',
        '',
        'Phase 1: keyword/substring match. Semantic vector search arrives in Phase 2.',
      ].join('\n'),
      inputSchema: {
        query: z.string().describe('Natural language query, e.g. "Redis timeout issue" or "auth middleware null reference"'),
        limit: z.number().optional().default(5).describe('Maximum memory chunks to return (default 5)'),
      },
    },
    async ({ query, limit }) => {
      const project = getProject(cwd)
      const chunks = getAllChunks(project.id)
      const q = query.toLowerCase()

      const results = chunks
        .filter(c => c.content.toLowerCase().includes(q))
        .slice(0, limit)
        .map(c => `[${c.source_type}] ${c.content}`)
        .join('\n\n---\n\n')

      const text = results || `No memory chunks matched "${query}".`
      return { content: [{ type: 'text' as const, text }] }
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
      const text = matches.length
        ? matches.map(c => `[${c.source_type}]\n${c.content}`).join('\n\n---\n\n')
        : `No entity found matching "${keyword}".`
      return { content: [{ type: 'text' as const, text }] }
    }
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
