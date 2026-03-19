import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { resolve } from 'node:path'
import type { Decision, Plan, PlanStep, Session, Task } from '../types.js'

function kontinueDir(cwd: string): string {
  return join(cwd, '.kontinue')
}

function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
}

function datePrefix(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  return d.toISOString().slice(0, 10)
}

function datePrefixWithTime(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  return d.toISOString().slice(0, 16).replace('T', '-').replace(':', '-')
}

// ── identity.md ───────────────────────────────────────────────────────────────

export function writeIdentity(cwd: string, name: string, description?: string, techStack?: string): void {
  const path = join(kontinueDir(cwd), 'identity.md')
  ensureDir(path)
  const content = `# ${name}

${description ?? ''}

## Tech Stack

${techStack ?? '_Not specified_'}

## Conventions

_Add project conventions here._
`
  writeFileSync(path, content, 'utf8')
}

// ── tasks/todo.md ────────────────────────────────────────────────────────────

export function rewriteTaskList(cwd: string, inProgress: Task[], todo: Task[], done: Task[]): void {
  const path = join(kontinueDir(cwd), 'tasks', 'todo.md')
  ensureDir(path)

  const fmt = (tasks: Task[], marker: string) =>
    tasks.map(t => {
      const desc = t.description ? `\n  > ${t.description}` : ''
      const outcome = t.outcome ? `\n  _Done: ${t.outcome}_` : ''
      return `- ${marker} #${t.id} ${t.title}${desc}${outcome}`
    }).join('\n') || '_none_'

  const content = `# Task List

_Auto-maintained by Kontinue. Last updated: ${new Date().toISOString()}_

## In Progress

${fmt(inProgress, '◉')}

## Todo

${fmt(todo, '○')}

## Done

${fmt(done, '✓')}
`
  writeFileSync(path, content, 'utf8')
}

// ── decisions/YYYY-MM-DD-<slug>.md ───────────────────────────────────────────

export function writeDecision(cwd: string, decision: Decision): void {
  const filename = `${datePrefix(decision.created_at)}-${slug(decision.summary)}.md`
  const path = join(kontinueDir(cwd), 'decisions', filename)
  ensureDir(path)

  const tagLine = decision.tags
    ? `\n**Tags:** ${decision.tags.split(',').map(t => `\`${t.trim()}\``).join(' ')}`
    : ''

  const fileLines = decision.files
    ? `\n## Related Files\n\n${decision.files.split(',').map(f => `- \`${f.trim()}\``).join('\n')}\n`
    : ''

  const contextSection = decision.context
    ? `\n## Context\n\n${decision.context}\n`
    : ''

  const content = `# ${decision.summary}

**Date:** ${decision.created_at}${decision.branch ? `  \n**Branch:** \`${decision.branch}\`` : ''}${decision.git_commit ? `  \n**Commit:** \`${decision.git_commit}\`` : ''}${tagLine}
${contextSection}
## Rationale

${decision.rationale ?? '_Not specified_'}

## Alternatives Considered

${decision.alternatives ?? '_Not specified_'}
${fileLines}`
  writeFileSync(path, content, 'utf8')
}

// ── sessions/YYYY-MM-DD-HH-MM.md ─────────────────────────────────────────────

export function writeSession(cwd: string, session: Session): void {
  const filename = `${datePrefixWithTime(session.ended_at ?? undefined)}.md`
  const path = join(kontinueDir(cwd), 'sessions', filename)
  ensureDir(path)

  const started = session.started_at
  const ended = session.ended_at ?? new Date().toISOString()

  const content = `# Session Handoff

**Started:** ${started}  
**Ended:** ${ended}${session.branch ? `  
**Branch:** \`${session.branch}\`` : ''}${session.start_commit ? `  
**Commits:** \`${session.start_commit}\` → \`${session.end_commit ?? 'HEAD'}\`` : ''}

## Summary

${session.handoff_note ?? '_No summary provided_'}

## Blockers

${session.blockers ?? '_None_'}
`
  writeFileSync(path, content, 'utf8')
}

// ── notes/YYYY-MM-DD-<slug>.md ───────────────────────────────────────────────

export function writeNote(cwd: string, content: string, createdAt?: string): void {
  const filename = `${datePrefix(createdAt)}-${slug(content)}.md`
  const path = join(kontinueDir(cwd), 'notes', filename)
  ensureDir(path)
  writeFileSync(path, `# Note\n\n**Date:** ${createdAt ?? new Date().toISOString()}\n\n${content}\n`, 'utf8')
}

// ── plans/<slug>.md ────────────────────────────────────────────────────────

function planPath(cwd: string, plan: Plan): string {
  return join(kontinueDir(cwd), 'plans', `${slug(plan.title)}.md`)
}

export function writePlan(cwd: string, plan: Plan, steps: PlanStep[]): void {
  const path = planPath(cwd, plan)
  ensureDir(path)

  const statusIcon = { draft: '○', active: '●', complete: '✓', archived: '–' }[plan.status]

  const stepLines = steps.length
    ? steps.map(s => {
        const icon = { pending: '○', 'in-progress': '◉', done: '✓', skipped: '–' }[s.status]
        return `- ${icon} ${s.content}`
      }).join('\n')
    : '_No steps defined yet._'

  const content = `# ${statusIcon} ${plan.title}

**Status:** ${plan.status}  
**Updated:** ${plan.updated_at}

## Goal

${plan.goal ?? '_Not specified_'}

## Steps

${stepLines}
`
  writeFileSync(path, content, 'utf8')
}

export function deletePlanFile(cwd: string, plan: Plan): void {
  const path = planPath(cwd, plan)
  if (existsSync(path)) unlinkSync(path)
}

const AGENT_INSTRUCTIONS_PATHS: Record<string, string> = {
  'vscode':      '.github/copilot-instructions.md',
  'claude-code': 'CLAUDE.md',
  'cursor':      '.cursor/rules/kontinue.mdc',
  'windsurf':    '.windsurfrules',
}

function buildInstructionsContent(agent: string): string {
  const frontmatter = agent === 'cursor'
    ? `---\ndescription: Kontinue — autonomous agent operating model\nglobs:\nalwaysApply: true\n---\n\n`
    : ''

  return `${frontmatter}# Kontinue — Autonomous Agent Operating Model

You are an **autonomous agent**. You receive goals from a human, translate them into work, and execute that work proactively. You do not wait for step-by-step direction. You do not treat the conversation as your notebook — Kontinue is your notebook.

You have access to a persistent memory system via the **Kontinue MCP tools**. These tools are not optional utilities — they are your operating system. Every insight, decision, observation, and progress update is persisted through Kontinue so that **you or any future agent** can pick up exactly where work left off.

---

## Core Principles

1. **Chat is a communication gate, not a source of truth.** The conversation is for receiving goals, asking clarifying questions, and reporting outcomes. Anything worth remembering goes into Kontinue. If the conversation were deleted, Kontinue should contain everything needed to continue.

2. **Identify intent → persist as task → decompose → execute → report outcome.** Do not stop at analysis. Analysis is a means, not an end. If you find bugs, fix them. If a task implies tests, run them.

3. **Proactive over reactive.** Do not ask permission for obvious next steps. Only pause for genuine ambiguity or destructive/irreversible actions.

4. **Persist everything that matters, display only what's needed.** Observations, decisions, progress → Kontinue. Summaries and outcomes → chat.

---

## Session Lifecycle

### Starting a session
**Always call \`read_context\` first.** Before reading files, before asking questions, before writing code.

This tells you:
- What the last session accomplished and what was left unfinished
- Tasks currently in-progress (resume them)
- Open questions and blockers (address them)
- Recent decisions that constrain current work

If there are in-progress tasks from a previous session, **resume them** unless the user gives you a different goal.

### During a session
- **Checkpoint every 15 minutes** or after any significant step via \`checkpoint\`
- **After completing any task:** call \`checkpoint\` immediately, then \`check_signals\` — do this before starting the next task, every time
- **Persist as you go** — don't batch observations or decisions for later
- **Log observations immediately** when you discover something — not after finishing the task: right now
- One task \`in_progress\` at a time. Complete it before starting the next.
- **Self-monitor for context length.** If the conversation is long (many exchanges, large files read, many tool calls), call \`write_handoff\` proactively — do not wait for compaction to happen.

### Inter-task ritual (mandatory between every task transition)
1. \`update_task\` action=\`done\` with outcome → auto-checkpoint is created
2. \`check_signals\` — check for developer signals
3. Then and only then: start the next task

### Ending a session
Call \`write_handoff\` with a summary that a cold agent can act on immediately. Name files, functions, exact state.

### Pre-compaction triggers — call \`write_handoff\` when ANY of these are true:
- The conversation has had many back-and-forth exchanges
- You have just completed a major task or milestone
- You are about to read many large files or make many tool calls
- You feel uncertain whether there will be room to finish the current task

Do not wait to be told. **A handoff written before compaction is infinitely more useful than one that never gets written.**

---

## Conversation Compaction Protocol

When the context window compresses, **you lose chat history but Kontinue persists.** This is by design.

**After compaction:**
1. Call \`read_context\` — it has everything you need
2. Check the latest checkpoint for where work stopped
3. Read active tasks for what "done" looks like
4. Resume work — do NOT ask the user "what were we doing?"

**Write compaction-proof state:**
- Checkpoints describe concrete state, not vague summaries
- Task descriptions are self-contained — a future you with no chat reads only the description
- Observations capture context that otherwise only exists in conversation

---

## Intent → Goals → Execution

1. **Capture**: Understand user's real outcome. Persist as a task with acceptance criteria.
2. **Decompose**: Break into executable steps. If the goal has 3+ steps or spans multiple phases, **create a plan immediately** with \`update_plan\` — do not wait to be asked.
3. **Execute**: Start the task, do the work, checkpoint after each step, log decisions and observations.
4. **Report**: Mark task done with outcome. Tell user what was accomplished. Create follow-up tasks if needed.

---

## Tool Reference

| Tool | When |
|---|---|
| \`read_context\` | Always first. After compaction. |
| \`update_task\` | Add (with description), start, done (with outcome), abandon, item_done |
| \`log_decision\` | Chose one approach over another. Always: rationale, alternatives, context, files, tags |
| \`supersede_decision\` | Replace an outdated decision with a new one. Archives the old. |
| \`add_observation\` | **Any** finding, bug, constraint, scope clarification, or discovery. Always include task_title and files. Log IMMEDIATELY when discovered. |
| \`resolve_observation\` | Mark an observation as addressed — removes from active context |
| \`checkpoint\` | Every ~15 min, after task completion, after reasoning-heavy edits |
| \`flag_blocker\` | Cannot proceed without external input |
| \`ask_question\` / \`answer_question\` | Uncertainty that doesn't block but needs resolution |
| \`search_memory\` | Before modifying unfamiliar code. Pass a keyword to search. |
| \`read_entity\` | Look up everything known about a specific file, module, or concept |
| \`update_plan\` | **Required** whenever the goal has 3+ steps or multiple phases |
| \`write_handoff\` | Session end **or proactively** at 50+ tool calls, 60+ min, or after major milestones |
| \`check_signals\` | Between tasks, after completing one, before starting the next |
| \`prepare_delegation\` | Before spawning a subagent — generates context brief and subagent instructions |

---

## Developer Signals

Developers can send real-time signals mid-session. These are injected into tool responses automatically.

- **MESSAGE** — read and act accordingly
- **PRIORITY** — reprioritize to the named task
- **ABORT** _(URGENT)_ — stop current task immediately
- **ANSWER** — developer answered one of your open questions

When you receive a signal: read it, act on it, then call \`acknowledge_signal\`.

---

## Context Hygiene

Keep context clean so future sessions don't read stale information:
- **Supersede** outdated decisions → \`supersede_decision\`
- **Resolve** addressed observations → \`resolve_observation\`
- **Answer** open questions → \`answer_question\`
- **Complete** plans → \`update_plan\` action=\`status\` status=\`complete\`

---

## Subagent Coordination

You are the sole interface between subagents and Kontinue. Subagents do NOT have Kontinue tools.

1. **Before spawning a subagent:** Call \`prepare_delegation\` with the task description
2. **Include** the returned "Subagent Instructions" block in the Agent tool prompt
3. **After subagent returns:** Persist key findings via \`add_observation\`
4. **If findings influence a decision:** Log via \`log_decision\`
5. **Never rely on subagent chat results** — they are lost on compaction

---

## Anti-Patterns

- **Report and stop**: Producing analysis without acting on it
- **Chat-as-notebook**: Writing long observations into conversation instead of Kontinue
- **Permission-seeking**: Asking "should I do X?" for obvious next steps
- **Amnesia after compaction**: Asking "what were we working on?" instead of reading Kontinue
- **Bare tasks/decisions**: Missing descriptions, outcomes, rationale, or file references
- **Batching persistence**: Waiting until the end to log. Persist as you go.
- **Context pollution**: Never resolving observations or superseding outdated decisions
- **Skipping plans for multi-step work**: Starting tasks directly without a plan when the goal has 3+ steps
- **Waiting for compaction to write a handoff**: By the time compaction happens, it is too late
- **Findings in chat only**: Describing findings in chat without logging as an observation
- **Deferring observations**: Thinking "I'll log this after I finish." Log it NOW.
- **Skipping inter-task rituals**: Moving to the next task without checkpoint + check_signals
- **Losing subagent results**: After a subagent returns, call \`process_subagent_result\` with the full response
`
}

/**
 * Compact subagent instruction block (~400 tokens).
 * Designed to be included in the Agent tool prompt for subagents that don't have Kontinue MCP tools.
 * Tells the subagent to return structured findings that the parent can persist.
 */
export const SUBAGENT_INSTRUCTIONS = `## Instructions for This Subagent

You are a subagent working on behalf of a parent agent. You have LIMITED access to Kontinue memory tools.

### Tools You CAN Use
- **add_observation** — call this when you discover something important (bug, constraint, quirk, undocumented behavior). Do not defer — persist immediately.
- **search_memory** — search project memory before modifying code you haven't seen before.
- **read_entity** — look up what's known about a module/file/concept before changing it.

### Tools You MUST NOT Use
Do NOT call: update_task, update_plan, write_handoff, checkpoint, log_decision, supersede_decision, check_signals, acknowledge_signal, prepare_delegation.
These are controlled by the parent agent.

### How to Work
1. Focus on the task described above. Be thorough and specific.
2. Call search_memory or read_entity BEFORE modifying any module — check for prior decisions or known issues.
3. When you discover something unexpected, call add_observation IMMEDIATELY — do not wait until the end.
4. When you make a choice between alternatives, explain your reasoning clearly in your response (the parent will persist it as a decision).

### How to Return Results
Structure your final response with these sections as applicable:

**Findings** — what you discovered, specific file paths and line numbers
**Decisions** — choices you made and why (the parent will call log_decision)
**Observations** — anything surprising or important (already persisted if you called add_observation)
**Recommendations** — suggested next steps or follow-up work

Be specific: name files, functions, line numbers. Vague summaries are not useful.`

/**
 * Writes agent-specific instruction files for every selected agent.
 * If a file already exists, appends the Kontinue block only if it's not already present.
 * Returns the list of relative paths written or updated.
 */
const PROMPT_CONTENT = `---
mode: agent
description: 'Kontinue autonomous agent: read context, identify intent, execute goals proactively, persist everything.'
---

You are an autonomous Kontinue-tracked agent. Your job: identify intent, translate to goals, execute, persist.

## 1. Read Context (MANDATORY)

Call \`read_context\` now. Do not read files or ask questions before this.

If there are in-progress tasks, **resume them**. If there are open questions, address them.

## 2. Capture Intent

When the user gives you a goal:
- Understand their **real outcome** (not just the literal words)
- Persist it as a task with \`update_task\` action \`add\` — include acceptance criteria in the description
- If the goal has 3+ steps or multiple phases, **create a plan first** with \`update_plan\` before starting any task
- \`start\` it before beginning work

## 3. Execute Autonomously

- **Do the work** — don't just analyze and report. If you find bugs, fix them.
- Checkpoint every ~15 min via \`checkpoint\`
- Log decisions (\`log_decision\`) with rationale, alternatives, context, files, tags
- Log observations (\`add_observation\`) for mid-task discoveries
- Mark tasks done (\`update_task\` action \`done\`) with concrete outcomes
- Create follow-up tasks for remaining work rather than leaving prose in chat

## 4. Persist, Don't Display

Chat is a communication gate, not a notebook. Persist everything that matters into Kontinue tools. Only display summaries and outcomes to the user.

## 5. Write a Handoff Early

Call \`write_handoff\` at session end — but also **whenever the conversation is getting long**, after any major milestone, or before a large block of work. Do not wait for compaction. By the time the context compresses, your chance to write a handoff is gone.
`

export function writeAgentInstructions(cwd: string, agents: string[]): string[] {
  const written: string[] = []
  for (const agent of agents) {
    const relPath = AGENT_INSTRUCTIONS_PATHS[agent]
    if (!relPath) continue
    const absPath = join(cwd, relPath)
    mkdirSync(dirname(absPath), { recursive: true })

    const content = buildInstructionsContent(agent)

    if (existsSync(absPath)) {
      const existing = readFileSync(absPath, 'utf8')
      // Only append if the Kontinue block isn't already there
      if (!existing.includes('read_context')) {
        writeFileSync(absPath, existing.trimEnd() + '\n\n---\n\n' + content, 'utf8')
        written.push(`${relPath} (appended)`)
      }
      // else: already has Kontinue instructions, leave it
    } else {
      writeFileSync(absPath, content, 'utf8')
      written.push(relPath)
    }

    // Write the .prompt.md for VS Code (one shared prompt, written once)
    if (agent === 'vscode') {
      const promptPath = join(cwd, '.github/prompts/kontinue.prompt.md')
      if (!existsSync(promptPath)) {
        mkdirSync(dirname(promptPath), { recursive: true })
        writeFileSync(promptPath, PROMPT_CONTENT, 'utf8')
        written.push('.github/prompts/kontinue.prompt.md')
      }
    }
  }
  return written
}

/** @deprecated Use writeAgentInstructions instead */
export function writeCopilotInstructions(cwd: string): void {
  writeAgentInstructions(cwd, ['vscode'])
}
