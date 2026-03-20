/**
 * MCP proxy server — translates stdio JSON-RPC to HTTP calls against Kontinue.Api.
 * Launched via: kontinue mcp --backend=remote --api-url=http://... --project-id=<guid>
 *
 * The proxy mirrors the same tool surface as the local MCP server (server.ts)
 * but routes all persistence to the remote .NET backend via api-client.ts.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { KontinueApiClient, toStringArray } from './api-client.js'
import { getBranch, getCommit } from '../utils/git.js'

export interface ProxyConfig {
  apiUrl: string
  projectId: string
  apiKey?: string
  cwd: string
}

export async function startProxyMcpServer(config: ProxyConfig): Promise<void> {
  const api = new KontinueApiClient({
    baseUrl: config.apiUrl,
    projectId: config.projectId,
    apiKey: config.apiKey,
  })

  const server = new McpServer({
    name: 'kontinue',
    version: '0.1.0',
  })

  // ── Helpers ─────────────────────────────────────────────────────

  let activeSessionId: string | null = null

  async function ensureSession(): Promise<string> {
    if (activeSessionId) return activeSessionId
    const existing = await api.getActiveSession()
    if (existing) {
      activeSessionId = existing.id
      return activeSessionId!
    }
    let branch: string | undefined
    let commit: string | undefined
    try { branch = getBranch(config.cwd) ?? undefined } catch {}
    try { commit = getCommit(config.cwd) ?? undefined } catch {}
    const session = await api.startSession(branch, commit)
    activeSessionId = session.id
    return activeSessionId!
  }

  function fmtAge(dateStr: string): string {
    const ms = Date.now() - new Date(dateStr).getTime()
    if (ms < 60_000) return 'just now'
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
    return `${Math.floor(ms / 86_400_000)}d ago`
  }

  async function statusLine(): Promise<string> {
    const tasks = await api.getTasks()
    const ip = tasks.filter((t: any) => t.status === 'InProgress').length
    const todo = tasks.filter((t: any) => t.status === 'Todo').length
    const cp = await api.getLatestCheckpoint()
    const cpAge = cp ? fmtAge(cp.createdAt) : 'none'
    return `\n\n---\n_[${ip} active · ${todo} todo | checkpoint: ${cpAge}]_`
  }

  async function signalCheck(): Promise<string> {
    const signals = await api.getPendingSignals()
    if (signals.length === 0) return ''
    const lines = signals.map((s: any) => {
      api.deliverSignal(s.id).catch(() => {})
      return `> **SIGNAL FROM DEVELOPER** — Read and act on this:\n> [${s.type.toUpperCase()}] ${s.content}\n>\n> Call \`acknowledge_signal\` after you have processed this.`
    })
    return '\n\n' + lines.join('\n\n')
  }

  // ── read_context ────────────────────────────────────────────────

  server.registerTool(
    'read_context',
    {
      description: 'REQUIRED FIRST ACTION — reads session context from remote backend. Auto-starts session.',
      inputSchema: {
        mode: z.enum(['brief', 'full']).optional().default('brief'),
      },
    },
    async ({ mode }) => {
      const sessionId = await ensureSession()
      await api.markContextRead(sessionId)

      const lastSession = await api.getLastSession()
      const handoff = await api.getLatestHandoff()
      const tasks = await api.getTasks()
      const cp = await api.getLatestCheckpoint()
      const questions = await api.getQuestions(true)
      const signals = await api.getPendingSignals()

      const ip = tasks.filter((t: any) => t.status === 'InProgress')
      const todoTasks = tasks.filter((t: any) => t.status === 'Todo')

      const sections: string[] = [`# Kontinue — Remote Backend\n`]

      // Resume section
      if (handoff) {
        sections.push(`## Resume\n${handoff.summary}`)
        if (handoff.blockers) sections.push(`\n**Blockers:** ${handoff.blockers}`)
      } else {
        sections.push('## Resume\n_No prior handoff found._')
      }

      // In-progress tasks
      sections.push('\n## In Progress')
      if (ip.length > 0) {
        ip.forEach((t: any) => {
          sections.push(`- **${t.title}** ${t.description ? `— ${t.description.slice(0, 100)}` : ''}`)
        })
      } else {
        sections.push('_none_')
      }

      if (mode === 'full') {
        // Todo tasks
        if (todoTasks.length > 0) {
          sections.push('\n## Todo')
          todoTasks.forEach((t: any) => sections.push(`- ${t.title}`))
        }

        // Active decisions
        const decisions = await api.getDecisions('Active')
        if (decisions.length > 0) {
          sections.push('\n## Active Decisions')
          decisions.forEach((d: any) => sections.push(`- ${d.summary}${d.tags ? ` [${d.tags}]` : ''}`))
        }

        // Active plans
        const plans = await api.getPlans('Active')
        if (plans.length > 0) {
          sections.push('\n## Active Plans')
          plans.forEach((p: any) => {
            const done = p.steps?.filter((s: any) => s.status === 'Done').length ?? 0
            const total = p.steps?.length ?? 0
            sections.push(`- **${p.title}** [${done}/${total}]`)
          })
        }
      }

      // Open questions
      if (questions.length > 0) {
        sections.push('\n## Open Questions')
        questions.forEach((q: any) => sections.push(`- ❓ ${q.text}`))
      }

      // Checkpoint warning
      if (cp) {
        const cpAge = Math.round((Date.now() - new Date(cp.createdAt).getTime()) / 60_000)
        if (cpAge > 15) {
          sections.push(`\n> ⚠️ **Last checkpoint ${cpAge}m ago.** Call \`checkpoint\` now.`)
        }
      }

      const signalText = await signalCheck()
      const status = await statusLine()

      return { content: [{ type: 'text' as const, text: sections.join('\n') + signalText + status }] }
    }
  )

  // ── update_task ─────────────────────────────────────────────────

  server.registerTool(
    'update_task',
    {
      description: 'Task lifecycle management — add, start, done, abandon tasks. Also manage checklist items and dependencies.',
      inputSchema: {
        action: z.enum(['add', 'start', 'done', 'abandon', 'item_add', 'item_done', 'item_remove', 'block', 'unblock']),
        title: z.string().optional().describe('Task title (for add/start/done/abandon)'),
        description: z.string().optional(),
        outcome: z.string().optional(),
        item: z.string().optional().describe('Checklist item content'),
        blocked_by: z.string().optional().describe('Title of blocking task (for block/unblock)'),
      },
    },
    async ({ action, title, description, outcome, item, blocked_by }) => {
      const sessionId = await ensureSession()
      await api.incrementToolCalls(sessionId)

      let result = ''

      switch (action) {
        case 'add': {
          if (!title) return { content: [{ type: 'text' as const, text: 'Title is required for add action' }] }
          const task = await api.createTask(title, description, sessionId)
          result = `Task "${title}" created ✓`
          break
        }
        case 'start': {
          if (!title) return { content: [{ type: 'text' as const, text: 'Title is required' }] }
          const tasks = await api.getTasks()
          const task = tasks.find((t: any) => t.title.toLowerCase().includes(title.toLowerCase()))
          if (!task) return { content: [{ type: 'text' as const, text: `No task matching "${title}"` }] }
          await api.updateTaskStatus(task.id, 'InProgress')
          result = `Task "${task.title}" — start ✓`
          break
        }
        case 'done': {
          if (!title) return { content: [{ type: 'text' as const, text: 'Title is required' }] }
          const tasks = await api.getTasks()
          const task = tasks.find((t: any) => t.title.toLowerCase().includes(title.toLowerCase()))
          if (!task) return { content: [{ type: 'text' as const, text: `No task matching "${title}"` }] }
          await api.updateTaskStatus(task.id, 'Done', outcome)
          result = `Task "${task.title}" — done ✓`
          if (outcome) result += `\n\nOutcome: ${outcome}`
          break
        }
        case 'abandon': {
          if (!title) return { content: [{ type: 'text' as const, text: 'Title is required' }] }
          const tasks = await api.getTasks()
          const task = tasks.find((t: any) => t.title.toLowerCase().includes(title.toLowerCase()))
          if (!task) return { content: [{ type: 'text' as const, text: `No task matching "${title}"` }] }
          await api.updateTaskStatus(task.id, 'Abandoned', outcome)
          result = `Task "${task.title}" — abandon ✓`
          break
        }
        case 'item_add': {
          if (!title || !item) return { content: [{ type: 'text' as const, text: 'Title and item are required' }] }
          const tasks = await api.getTasks()
          const task = tasks.find((t: any) => t.title.toLowerCase().includes(title.toLowerCase()))
          if (!task) return { content: [{ type: 'text' as const, text: `No task matching "${title}"` }] }
          await api.addTaskItem(task.id, item)
          result = `Item added to "${task.title}" ✓`
          break
        }
        case 'item_done': {
          if (!title || !item) return { content: [{ type: 'text' as const, text: 'Title and item are required' }] }
          const tasks = await api.getTasks()
          const task = tasks.find((t: any) => t.title.toLowerCase().includes(title.toLowerCase()))
          if (!task) return { content: [{ type: 'text' as const, text: `No task matching "${title}"` }] }
          const taskDetail = await api.getTask(task.id)
          const taskItem = taskDetail.items?.find((i: any) => i.content.toLowerCase().includes(item.toLowerCase()))
          if (!taskItem) return { content: [{ type: 'text' as const, text: `No item matching "${item}"` }] }
          await api.toggleTaskItem(task.id, taskItem.id)
          result = `Item "${item}" toggled ✓`
          break
        }
        case 'item_remove': {
          if (!title || !item) return { content: [{ type: 'text' as const, text: 'Title and item are required' }] }
          const tasks = await api.getTasks()
          const task = tasks.find((t: any) => t.title.toLowerCase().includes(title.toLowerCase()))
          if (!task) return { content: [{ type: 'text' as const, text: `No task matching "${title}"` }] }
          const taskDetail = await api.getTask(task.id)
          const taskItem = taskDetail.items?.find((i: any) => i.content.toLowerCase().includes(item.toLowerCase()))
          if (!taskItem) return { content: [{ type: 'text' as const, text: `No item matching "${item}"` }] }
          await api.deleteTaskItem(task.id, taskItem.id)
          result = `Item "${item}" removed ✓`
          break
        }
        case 'block': {
          if (!title || !blocked_by) return { content: [{ type: 'text' as const, text: 'Title and blocked_by are required' }] }
          const tasks = await api.getTasks()
          const task = tasks.find((t: any) => t.title.toLowerCase().includes(title.toLowerCase()))
          const blocker = tasks.find((t: any) => t.title.toLowerCase().includes(blocked_by.toLowerCase()))
          if (!task || !blocker) return { content: [{ type: 'text' as const, text: 'Could not find one or both tasks' }] }
          await api.addDependency(task.id, blocker.id)
          result = `"${task.title}" now blocked by "${blocker.title}" ✓`
          break
        }
        case 'unblock': {
          if (!title || !blocked_by) return { content: [{ type: 'text' as const, text: 'Title and blocked_by are required' }] }
          const tasks = await api.getTasks()
          const task = tasks.find((t: any) => t.title.toLowerCase().includes(title.toLowerCase()))
          const blocker = tasks.find((t: any) => t.title.toLowerCase().includes(blocked_by.toLowerCase()))
          if (!task || !blocker) return { content: [{ type: 'text' as const, text: 'Could not find one or both tasks' }] }
          await api.removeDependency(task.id, blocker.id)
          result = `Dependency removed ✓`
          break
        }
      }

      const signalText = await signalCheck()
      const status = await statusLine()
      return { content: [{ type: 'text' as const, text: result + signalText + status }] }
    }
  )

  // ── log_decision ────────────────────────────────────────────────

  server.registerTool(
    'log_decision',
    {
      description: 'Record an architectural or technical decision with rationale and alternatives considered.',
      inputSchema: {
        summary: z.string(),
        rationale: z.string().optional(),
        alternatives: z.string().optional(),
        context: z.string().optional(),
        files: z.string().optional(),
        tags: z.string().optional(),
        scope: z.enum(['project', 'task']).optional().default('project'),
        share: z.boolean().optional().default(false),
      },
    },
    async ({ summary, rationale, alternatives, context, files, tags, scope }) => {
      const sessionId = await ensureSession()
      await api.incrementToolCalls(sessionId)

      let branch: string | undefined
      let commit: string | undefined
      try { branch = getBranch(config.cwd) ?? undefined } catch {}
      try { commit = getCommit(config.cwd) ?? undefined } catch {}

      const decision = await api.createDecision({
        summary, rationale, alternatives: toStringArray(alternatives),
        context, files: toStringArray(files), tags: toStringArray(tags),
        scope, sessionId, branch, gitCommit: commit,
      })

      // Upsert memory chunk
      await api.upsertMemoryChunk('decision', `${summary}\n${rationale ?? ''}`, decision.id, sessionId)

      const signalText = await signalCheck()
      const status = await statusLine()
      return { content: [{ type: 'text' as const, text: `Decision recorded: "${summary}" ✓${signalText}${status}` }] }
    }
  )

  // ── write_handoff ───────────────────────────────────────────────

  server.registerTool(
    'write_handoff',
    {
      description: 'Write a session-end summary so the next agent can resume immediately. Call proactively before session end.',
      inputSchema: {
        summary: z.string(),
        blockers: z.string().optional(),
      },
    },
    async ({ summary, blockers }) => {
      const sessionId = await ensureSession()
      await api.incrementToolCalls(sessionId)

      await api.createHandoff(sessionId, summary, toStringArray(blockers))

      let commit: string | undefined
      try { commit = getCommit(config.cwd) ?? undefined } catch {}
      await api.endSession(sessionId, commit)
      activeSessionId = null

      return { content: [{ type: 'text' as const, text: `Handoff saved ✓` }] }
    }
  )

  // ── add_observation ─────────────────────────────────────────────

  server.registerTool(
    'add_observation',
    {
      description: 'Log a mid-task discovery, bug, constraint, or finding. Persists beyond the conversation.',
      inputSchema: {
        content: z.string(),
        task_title: z.string().optional(),
        files: z.string().optional(),
      },
    },
    async ({ content, task_title, files }) => {
      const sessionId = await ensureSession()
      await api.incrementToolCalls(sessionId)

      let taskId: string | undefined
      if (task_title) {
        const tasks = await api.getTasks()
        const task = tasks.find((t: any) => t.title.toLowerCase().includes(task_title.toLowerCase()))
        taskId = task?.id
      }

      await api.createObservation(content, toStringArray(files), sessionId, taskId)
      await api.upsertMemoryChunk('note', content, undefined, sessionId)

      const signalText = await signalCheck()
      const status = await statusLine()
      return { content: [{ type: 'text' as const, text: `Observation logged ✓${signalText}${status}` }] }
    }
  )

  // ── checkpoint ──────────────────────────────────────────────────

  server.registerTool(
    'checkpoint',
    {
      description: 'Save a mid-task recovery point. Call every ~15 minutes or after significant steps.',
      inputSchema: {
        progress: z.string(),
        summary: z.string().optional(),
        next_step: z.string().optional(),
        files_active: z.string().optional(),
      },
    },
    async ({ progress, next_step, files_active }) => {
      const sessionId = await ensureSession()
      await api.incrementToolCalls(sessionId)

      let commit: string | undefined
      try { commit = getCommit(config.cwd) ?? undefined } catch {}

      await api.createCheckpoint(sessionId, progress, next_step, toStringArray(files_active), commit)

      const signalText = await signalCheck()
      const status = await statusLine()
      return { content: [{ type: 'text' as const, text: `Checkpoint saved ✓\n\n_If this session ends, the next agent will resume from here._${signalText}${status}` }] }
    }
  )

  // ── search_memory ───────────────────────────────────────────────

  server.registerTool(
    'search_memory',
    {
      description: 'Search indexed knowledge from past sessions — decisions, observations, tasks, architecture notes.',
      inputSchema: {
        query: z.string(),
        type: z.enum(['task', 'decision', 'note', 'session', 'architecture', 'identity']).optional(),
        limit: z.number().optional().default(10),
      },
    },
    async ({ query, type, limit }) => {
      const sessionId = await ensureSession()
      await api.incrementToolCalls(sessionId)

      const results = await api.searchMemory(query, type, limit)

      if (results.length === 0) {
        return { content: [{ type: 'text' as const, text: `No results for "${query}".` }] }
      }

      const lines = results.map((r: any, i: number) =>
        `**${i + 1}.** [${r.type}] ${r.content.slice(0, 300)}`
      )

      const signalText = await signalCheck()
      const status = await statusLine()
      return { content: [{ type: 'text' as const, text: lines.join('\n\n') + signalText + status }] }
    }
  )

  // ── update_plan ─────────────────────────────────────────────────

  server.registerTool(
    'update_plan',
    {
      description: [
        'Manage multi-step plans. Plans track execution progress across tasks.',
        '',
        '**Creating a plan:** Draft in chat first → get user approval → then call action="add" to persist.',
        '',
        '**Tracking progress (no approval needed):**',
        '- After completing each step in a plan, call action="step_done" with the step content.',
        '- After skipping a step, call action="step_skip".',
        '- When ALL steps are done/skipped, the plan auto-completes. You can also set status manually.',
        '',
        '**This is critical:** Every time you finish work that corresponds to a plan step, you MUST call step_done.',
        'Do not wait until the end — mark steps done as you go. Plans are your progress tracker.',
        '',
        'Actions:',
        '- "add"       — Persist an approved plan (title required, optional goal, optional steps array).',
        '- "status"    — Change plan status: draft | active | complete | archived.',
        '- "step_done" — Mark a step done by step_keyword match. Auto-completes plan if all steps are done.',
        '- "step_skip" — Mark a step skipped. Auto-completes plan if all remaining steps are done/skipped.',
        '- "step_add"  — Append new steps to an existing plan.',
      ].join('\n'),
      inputSchema: {
        action: z.enum(['add', 'status', 'step_done', 'step_skip', 'step_add']),
        title: z.string(),
        goal: z.string().optional(),
        status: z.enum(['draft', 'active', 'complete', 'archived']).optional(),
        steps: z.array(z.string()).optional(),
        step_keyword: z.string().optional(),
      },
    },
    async ({ action, title, goal, status: planStatus, steps, step_keyword }) => {
      const sessionId = await ensureSession()
      await api.incrementToolCalls(sessionId)

      let result = ''

      switch (action) {
        case 'add': {
          const plan = await api.createPlan(title, goal, steps)
          result = `Plan "${title}" created with ${plan.steps?.length ?? 0} steps ✓`
          break
        }
        case 'status': {
          const plans = await api.getPlans()
          const plan = plans.find((p: any) => p.title.toLowerCase().includes(title.toLowerCase()))
          if (!plan) return { content: [{ type: 'text' as const, text: `No plan matching "${title}"` }] }
          if (!planStatus) return { content: [{ type: 'text' as const, text: 'Status is required' }] }
          await api.updatePlanStatus(plan.id, planStatus.charAt(0).toUpperCase() + planStatus.slice(1))
          result = `Plan "${plan.title}" → ${planStatus} ✓`
          break
        }
        case 'step_done':
        case 'step_skip': {
          const plans = await api.getPlans()
          const plan = plans.find((p: any) => p.title.toLowerCase().includes(title.toLowerCase()))
          if (!plan) return { content: [{ type: 'text' as const, text: `No plan matching "${title}"` }] }
          const stepStatus = action === 'step_done' ? 'Done' : 'Skipped'
          if (step_keyword) {
            const step = plan.steps?.find((s: any) => s.content.toLowerCase().includes(step_keyword.toLowerCase()))
            if (!step) return { content: [{ type: 'text' as const, text: `No step matching "${step_keyword}"` }] }
            await api.updatePlanStepStatus(plan.id, step.id, stepStatus)
            result = `Step "${step.content.slice(0, 50)}" → ${stepStatus.toLowerCase()} ✓`
          } else {
            // Mark first pending step
            const pending = plan.steps?.find((s: any) => s.status === 'Pending')
            if (!pending) return { content: [{ type: 'text' as const, text: 'No pending steps' }] }
            await api.updatePlanStepStatus(plan.id, pending.id, stepStatus)
            result = `Step "${pending.content.slice(0, 50)}" → ${stepStatus.toLowerCase()} ✓`
          }

          // Auto-complete plan when all steps are done/skipped
          const refreshed = await api.getPlans()
          const updatedPlan = refreshed.find((p: any) => p.id === plan.id)
          if (updatedPlan?.steps?.length > 0 && updatedPlan.steps.every((s: any) => s.status === 'Done' || s.status === 'Skipped')) {
            await api.updatePlanStatus(plan.id, 'Complete')
            result += ` — Plan "${plan.title}" auto-completed ✓`
          }
          break
        }
        case 'step_add': {
          const plans = await api.getPlans()
          const plan = plans.find((p: any) => p.title.toLowerCase().includes(title.toLowerCase()))
          if (!plan) return { content: [{ type: 'text' as const, text: `No plan matching "${title}"` }] }
          if (steps && steps.length > 0) {
            for (const s of steps) await api.addPlanStep(plan.id, s)
            result = `Added ${steps.length} step(s) to "${plan.title}" ✓`
          } else {
            return { content: [{ type: 'text' as const, text: 'Steps array is required for step_add' }] }
          }
          break
        }
      }

      const signalText = await signalCheck()
      const status = await statusLine()
      return { content: [{ type: 'text' as const, text: result + signalText + status }] }
    }
  )

  // ── supersede_decision ──────────────────────────────────────────

  server.registerTool(
    'supersede_decision',
    {
      description: 'Replace an outdated decision with a new one, archiving the old.',
      inputSchema: {
        old_summary: z.string().describe('Partial match for the decision to supersede'),
        summary: z.string(),
        rationale: z.string().optional(),
        alternatives: z.string().optional(),
        context: z.string().optional(),
        files: z.string().optional(),
        tags: z.string().optional(),
      },
    },
    async ({ old_summary, summary, rationale, alternatives, context, files, tags }) => {
      const sessionId = await ensureSession()
      await api.incrementToolCalls(sessionId)

      const decisions = await api.getDecisions('Active')
      const old = decisions.find((d: any) => d.summary.toLowerCase().includes(old_summary.toLowerCase()))
      if (!old) return { content: [{ type: 'text' as const, text: `No active decision matching "${old_summary}"` }] }

      let branch: string | undefined
      let commit: string | undefined
      try { branch = getBranch(config.cwd) ?? undefined } catch {}
      try { commit = getCommit(config.cwd) ?? undefined } catch {}

      const replacement = await api.supersedeDecision(old.id, {
        summary, rationale, alternatives: toStringArray(alternatives),
        context, files: toStringArray(files), tags: toStringArray(tags),
        sessionId, branch, gitCommit: commit,
      })

      const signalText = await signalCheck()
      const status = await statusLine()
      return { content: [{ type: 'text' as const, text: `Decision superseded: "${old.summary}" → "${summary}" ✓${signalText}${status}` }] }
    }
  )

  // ── resolve_observation ─────────────────────────────────────────

  server.registerTool(
    'resolve_observation',
    {
      description: 'Mark an observation as resolved/addressed.',
      inputSchema: {
        keyword: z.string().describe('Partial match for the observation content'),
      },
    },
    async ({ keyword }) => {
      const sessionId = await ensureSession()
      await api.incrementToolCalls(sessionId)

      const obs = await api.getObservations(true)
      const match = obs.find((o: any) => o.content.toLowerCase().includes(keyword.toLowerCase()))
      if (!match) return { content: [{ type: 'text' as const, text: `No unresolved observation matching "${keyword}"` }] }

      await api.resolveObservation(match.id)

      const signalText = await signalCheck()
      const status = await statusLine()
      return { content: [{ type: 'text' as const, text: `Observation resolved ✓${signalText}${status}` }] }
    }
  )

  // ── flag_blocker ────────────────────────────────────────────────

  server.registerTool(
    'flag_blocker',
    {
      description: 'Record a blocking issue that prevents progress.',
      inputSchema: {
        content: z.string(),
        task_title: z.string().optional(),
      },
    },
    async ({ content, task_title }) => {
      const sessionId = await ensureSession()
      await api.incrementToolCalls(sessionId)

      let taskId: string | undefined
      if (task_title) {
        const tasks = await api.getTasks()
        const task = tasks.find((t: any) => t.title.toLowerCase().includes(task_title.toLowerCase()))
        taskId = task?.id
      }

      await api.createObservation(`🚫 BLOCKER: ${content}`, undefined, sessionId, taskId)

      const signalText = await signalCheck()
      const status = await statusLine()
      return { content: [{ type: 'text' as const, text: `Blocker flagged ✓${signalText}${status}` }] }
    }
  )

  // ── ask_question ────────────────────────────────────────────────

  server.registerTool(
    'ask_question',
    {
      description: 'Log a non-blocking open question for later resolution.',
      inputSchema: {
        question: z.string(),
        task_title: z.string().optional(),
      },
    },
    async ({ question, task_title }) => {
      const sessionId = await ensureSession()
      await api.incrementToolCalls(sessionId)

      let taskId: string | undefined
      if (task_title) {
        const tasks = await api.getTasks()
        const task = tasks.find((t: any) => t.title.toLowerCase().includes(task_title.toLowerCase()))
        taskId = task?.id
      }

      await api.createQuestion(question, sessionId, taskId)

      const signalText = await signalCheck()
      const status = await statusLine()
      return { content: [{ type: 'text' as const, text: `Question logged ✓${signalText}${status}` }] }
    }
  )

  // ── answer_question ─────────────────────────────────────────────

  server.registerTool(
    'answer_question',
    {
      description: 'Resolve a previously logged question.',
      inputSchema: {
        keyword: z.string().describe('Partial match for the question text'),
        answer: z.string(),
      },
    },
    async ({ keyword, answer }) => {
      const sessionId = await ensureSession()
      await api.incrementToolCalls(sessionId)

      const questions = await api.getQuestions(true)
      const match = questions.find((q: any) => q.text.toLowerCase().includes(keyword.toLowerCase()))
      if (!match) return { content: [{ type: 'text' as const, text: `No open question matching "${keyword}"` }] }

      await api.answerQuestion(match.id, answer)

      const signalText = await signalCheck()
      const status = await statusLine()
      return { content: [{ type: 'text' as const, text: `Question answered ✓${signalText}${status}` }] }
    }
  )

  // ── check_signals ───────────────────────────────────────────────

  server.registerTool(
    'check_signals',
    {
      description: 'Poll for pending developer signals.',
      inputSchema: {},
    },
    async () => {
      const sessionId = await ensureSession()
      await api.incrementToolCalls(sessionId)

      const signals = await api.getPendingSignals()

      if (signals.length === 0) {
        const status = await statusLine()
        return { content: [{ type: 'text' as const, text: `No pending signals.${status}` }] }
      }

      const lines = signals.map((s: any) => {
        api.deliverSignal(s.id).catch(() => {})
        return `> **SIGNAL FROM DEVELOPER** — Read and act on this:\n> [${s.type.toUpperCase()}] ${s.content}\n>\n> Call \`acknowledge_signal\` after you have processed this.`
      })

      const status = await statusLine()
      return { content: [{ type: 'text' as const, text: lines.join('\n\n') + status }] }
    }
  )

  // ── acknowledge_signal ──────────────────────────────────────────

  server.registerTool(
    'acknowledge_signal',
    {
      description: 'Confirm receipt and processing of a developer signal.',
      inputSchema: {
        response: z.string().optional(),
      },
    },
    async ({ response }) => {
      const sessionId = await ensureSession()
      await api.incrementToolCalls(sessionId)

      const signals = await api.getSignals('Delivered')
      if (signals.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No delivered signals to acknowledge.' }] }
      }

      // Acknowledge most recent delivered signal
      const signal = signals[0]
      await api.acknowledgeSignal(signal.id, response)

      const status = await statusLine()
      return { content: [{ type: 'text' as const, text: `Signal acknowledged ✓${status}` }] }
    }
  )

  // ── read_entity ─────────────────────────────────────────────────

  server.registerTool(
    'read_entity',
    {
      description: 'Pre-edit context check — recall what Kontinue knows about a module or file before editing it.',
      inputSchema: {
        name: z.string().describe('Module, file, or concept name'),
      },
    },
    async ({ name }) => {
      const sessionId = await ensureSession()
      await api.incrementToolCalls(sessionId)

      const results = await api.searchMemory(name, undefined, 5)
      const decisions = await api.getDecisions('Active')
      const relevant = decisions.filter((d: any) =>
        d.summary.toLowerCase().includes(name.toLowerCase()) ||
        (d.files && d.files.toLowerCase().includes(name.toLowerCase()))
      )

      const sections: string[] = []
      if (relevant.length > 0) {
        sections.push('## Related Decisions')
        relevant.forEach((d: any) => sections.push(`- ${d.summary}${d.tags ? ` [${d.tags}]` : ''}`))
      }
      if (results.length > 0) {
        sections.push('\n## Related Memory')
        results.forEach((r: any) => sections.push(`- [${r.type}] ${r.content.slice(0, 200)}`))
      }
      if (sections.length === 0) {
        sections.push(`No prior context found for "${name}".`)
      }

      const status = await statusLine()
      return { content: [{ type: 'text' as const, text: sections.join('\n') + status }] }
    }
  )

  // ── read_decision ───────────────────────────────────────────────

  server.registerTool(
    'read_decision',
    {
      description: 'Look up a specific decision by keyword.',
      inputSchema: {
        keyword: z.string(),
      },
    },
    async ({ keyword }) => {
      const sessionId = await ensureSession()
      await api.incrementToolCalls(sessionId)

      const decisions = await api.getDecisions()
      const matches = decisions.filter((d: any) =>
        d.summary.toLowerCase().includes(keyword.toLowerCase()) ||
        (d.tags && d.tags.toLowerCase().includes(keyword.toLowerCase()))
      )

      if (matches.length === 0) {
        return { content: [{ type: 'text' as const, text: `No decision matching "${keyword}"` }] }
      }

      const lines = matches.map((d: any) =>
        `**${d.summary}**\n- Status: ${d.status}\n- Rationale: ${d.rationale ?? '_none_'}\n- Alternatives: ${d.alternatives ?? '_none_'}\n- Files: ${d.files ?? '_none_'}\n- Tags: ${d.tags ?? '_none_'}`
      )

      const status = await statusLine()
      return { content: [{ type: 'text' as const, text: lines.join('\n\n---\n\n') + status }] }
    }
  )

  // ── link_external ───────────────────────────────────────────────

  server.registerTool(
    'link_external',
    {
      description: 'Link a task to an external issue (GitHub, Linear).',
      inputSchema: {
        task_title: z.string(),
        provider: z.enum(['github', 'linear']),
        external_id: z.string(),
        external_url: z.string().optional(),
      },
    },
    async ({ task_title, provider, external_id, external_url }) => {
      const sessionId = await ensureSession()
      await api.incrementToolCalls(sessionId)

      const tasks = await api.getTasks()
      const task = tasks.find((t: any) => t.title.toLowerCase().includes(task_title.toLowerCase()))
      if (!task) return { content: [{ type: 'text' as const, text: `No task matching "${task_title}"` }] }

      await api.addExternalLink(task.id, provider, external_id, external_url)

      const status = await statusLine()
      return { content: [{ type: 'text' as const, text: `Linked to ${provider}:${external_id} ✓${status}` }] }
    }
  )

  // ── prepare_delegation ──────────────────────────────────────────

  server.registerTool(
    'prepare_delegation',
    {
      description: 'Prepare context for a subagent delegation.',
      inputSchema: {
        task_description: z.string(),
      },
    },
    async ({ task_description }) => {
      const sessionId = await ensureSession()
      await api.incrementToolCalls(sessionId)

      const decisions = await api.getDecisions('Active')
      const decisionSummary = decisions.slice(0, 5).map((d: any) => `- ${d.summary}`).join('\n')

      const context = [
        '## Subagent Instructions',
        '',
        '**Task:** ' + task_description,
        '',
        '**Active Decisions:**',
        decisionSummary || '_none_',
        '',
        'You have access to: `add_observation`, `search_memory`, `read_entity`.',
        'You do NOT have access to: `update_task`, `update_plan`, `write_handoff`, `checkpoint`, `log_decision`.',
      ].join('\n')

      return { content: [{ type: 'text' as const, text: context }] }
    }
  )

  // ── process_subagent_result ─────────────────────────────────────

  server.registerTool(
    'process_subagent_result',
    {
      description: 'Process and persist results returned by a subagent.',
      inputSchema: {
        result: z.string().describe('Full text response from the subagent'),
      },
    },
    async ({ result }) => {
      const sessionId = await ensureSession()
      await api.incrementToolCalls(sessionId)

      // Store as memory chunk for future reference
      await api.upsertMemoryChunk('session', `Subagent result: ${result.slice(0, 2000)}`, undefined, sessionId)

      const status = await statusLine()
      return { content: [{ type: 'text' as const, text: `Subagent result processed and persisted ✓${status}` }] }
    }
  )

  // ── Resources ──────────────────────────────────────────────────

  server.resource(
    'kontinue://board',
    'kontinue://board',
    { description: 'Live task board — in-progress + todo tasks', mimeType: 'text/plain' },
    async (_uri) => {
      const tasks = await api.getTasks()
      const ip = tasks.filter((t: any) => t.status === 'InProgress')
      const todo = tasks.filter((t: any) => t.status === 'Todo')

      const lines = ['# Kontinue Board\n']
      if (ip.length > 0) {
        lines.push('## In Progress')
        ip.forEach((t: any) => lines.push(`- 🔵 ${t.title}`))
      }
      if (todo.length > 0) {
        lines.push('\n## Todo')
        todo.forEach((t: any) => lines.push(`- ⬜ ${t.title}`))
      }
      if (ip.length === 0 && todo.length === 0) {
        lines.push('_Board is empty._')
      }
      return { contents: [{ uri: 'kontinue://board', mimeType: 'text/plain', text: lines.join('\n') }] }
    }
  )

  server.resource(
    'kontinue://context',
    'kontinue://context',
    { description: 'Session context — last handoff, open questions, checkpoint status', mimeType: 'text/plain' },
    async (_uri) => {
      const handoff = await api.getLatestHandoff()
      const cp = await api.getLatestCheckpoint()
      const questions = await api.getQuestions(true)

      const cpLine = cp
        ? `${Math.round((Date.now() - new Date(cp.createdAt).getTime()) / 60_000)}m ago — ${cp.progress}`
        : '_none_'

      const lines = [
        '# Kontinue Context — Remote Backend\n',
        '## Last Handoff',
        handoff?.summary?.slice(0, 500) ?? '_none_',
        '',
        `## Last Checkpoint\n${cpLine}`,
        '',
        '## Open Questions',
        questions.length > 0 ? questions.map((q: any) => `- ❓ ${q.text}`).join('\n') : '_none_',
      ]
      return { contents: [{ uri: 'kontinue://context', mimeType: 'text/plain', text: lines.join('\n') }] }
    }
  )

  // ── Connect ────────────────────────────────────────────────────

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
