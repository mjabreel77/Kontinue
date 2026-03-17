import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { resolve } from 'node:path'
import type { Decision, Session, Task } from '../types.js'

function kontinueDir(): string {
  return join(resolve(process.cwd()), '.kontinue')
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

export function writeIdentity(name: string, description?: string, techStack?: string): void {
  const path = join(kontinueDir(), 'identity.md')
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

export function rewriteTaskList(inProgress: Task[], todo: Task[], done: Task[]): void {
  const path = join(kontinueDir(), 'tasks', 'todo.md')
  ensureDir(path)

  const fmt = (tasks: Task[], marker: string) =>
    tasks.map(t => `- ${marker} ${t.title}`).join('\n') || '_none_'

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

export function writeDecision(decision: Decision): void {
  const filename = `${datePrefix(decision.created_at)}-${slug(decision.summary)}.md`
  const path = join(kontinueDir(), 'decisions', filename)
  ensureDir(path)

  const content = `# ${decision.summary}

**Date:** ${decision.created_at}${decision.branch ? `  
**Branch:** \`${decision.branch}\`` : ''}${decision.git_commit ? `  
**Commit:** \`${decision.git_commit}\`` : ''}

## Rationale

${decision.rationale ?? '_Not specified_'}

## Alternatives Considered

${decision.alternatives ?? '_Not specified_'}
`
  writeFileSync(path, content, 'utf8')
}

// ── sessions/YYYY-MM-DD-HH-MM.md ─────────────────────────────────────────────

export function writeSession(session: Session): void {
  const filename = `${datePrefixWithTime(session.ended_at ?? undefined)}.md`
  const path = join(kontinueDir(), 'sessions', filename)
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

export function writeNote(content: string, createdAt?: string): void {
  const filename = `${datePrefix(createdAt)}-${slug(content)}.md`
  const path = join(kontinueDir(), 'notes', filename)
  ensureDir(path)
  writeFileSync(path, `# Note\n\n**Date:** ${createdAt ?? new Date().toISOString()}\n\n${content}\n`, 'utf8')
}

// ── Agent instruction files ─────────────────────────────────────────────────

const AGENT_INSTRUCTIONS_PATHS: Record<string, string> = {
  'vscode':      '.github/copilot-instructions.md',
  'claude-code': 'CLAUDE.md',
  'cursor':      '.cursor/rules/kontinue.mdc',
  'windsurf':    '.windsurfrules',
}

function buildInstructionsContent(agent: string): string {
  // Cursor MDC files require a frontmatter block
  const frontmatter = agent === 'cursor'
    ? `---
description: Kontinue memory system — agent instructions
globs:
alwaysApply: true
---

`
    : ''

  return `${frontmatter}# Kontinue Agent Instructions

You have access to a persistent memory system via the **Kontinue MCP tools**. These tools maintain context across sessions, track decisions, and keep work organized. Follow the rules below strictly and proactively — do not wait to be asked.

---

## Session Start (REQUIRED)

**Always call \`kontinue_read_context\` as the very first action** when a new conversation begins or when you are asked to work on code. Do this before reading any files, before asking clarifying questions, and before writing any code.

The output tells you:
- What branch you are on and recent commits
- What was accomplished in the last session and what was left unfinished
- Tasks currently in-progress and todo
- Recent architectural decisions that constrain the current work

Do not start work without reading this first.

---

## Tracking Tasks

Use \`kontinue_update_task\` to keep the task list accurate throughout the session.

| Situation | Action |
|---|---|
| User asks you to implement something new | \`add\` a task before starting |
| You begin actively working on a task | \`start\` it |
| A task is fully complete and verified | \`done\` |
| A task is being dropped or deferred | \`abandon\` + log a decision explaining why |

- Add tasks with short imperative titles: \`"Add rate limiting to /api/auth"\`, \`"Fix null ref in session middleware"\`
- Do not add tasks for trivial one-liner changes
- Mark tasks \`done\` immediately when finished — do not batch completions

---

## Recording Decisions

Call \`kontinue_log_decision\` whenever you:
- Choose one library, approach, or architecture over another
- Decide **not** to do something and why (dropped a pattern, avoided a dependency)
- Establish a convention that future work should follow
- Resolve a non-trivial trade-off that took reasoning

**Do not log** implementation details, file edits, or routine choices. Only log decisions a future session would need context for.

Always fill in \`rationale\` and \`alternatives\` — these are what make memory useful across sessions.

---

## Before Touching Unfamiliar Code

Call \`kontinue_search_memory\` or \`kontinue_read_entity\` before modifying a component, module, or API you haven't worked with in this session. This surfaces prior decisions and notes that may constrain your approach.

Examples:
- Before changing auth middleware → search "auth"
- Before touching the database layer → search "sqlite" or "schema"
- Before adding a new dependency → search for prior decisions about that area

---

## Flagging Blockers

Call \`kontinue_flag_blocker\` immediately when you are stuck and cannot proceed without external input:
- Waiting for credentials, API keys, or environment access
- Ambiguous requirements that need user clarification
- A dependency or system outside your control is broken

This does **not** close the session — it just records the blocker so the next session knows about it immediately.

---

## Session End

Call \`kontinue_write_handoff\` when:
- The user ends the conversation
- The context window is nearing its limit
- A natural stopping point is reached

Write the handoff so a future agent can read it cold and immediately continue:
- **Summary**: specific files changed, features completed, what state things are in
- **Blockers**: unresolved issues, outstanding questions, next steps

---

## What NOT to do

- Do not skip \`kontinue_read_context\` at session start — ever
- Do not ask the user "should I log this decision?" — just log it if it qualifies
- Do not use these tools for every small action — only meaningful state changes
- Do not call \`kontinue_write_handoff\` mid-session unless context is full
`
}

/**
 * Writes agent-specific instruction files for every selected agent.
 * Never overwrites existing files — user edits are preserved.
 * Returns the list of relative paths written.
 */
export function writeAgentInstructions(cwd: string, agents: string[]): string[] {
  const written: string[] = []
  for (const agent of agents) {
    const relPath = AGENT_INSTRUCTIONS_PATHS[agent]
    if (!relPath) continue
    const absPath = join(cwd, relPath)
    if (existsSync(absPath)) continue // preserve user edits
    mkdirSync(dirname(absPath), { recursive: true })
    writeFileSync(absPath, buildInstructionsContent(agent), 'utf8')
    written.push(relPath)
  }
  return written
}

/** @deprecated Use writeAgentInstructions instead */
export function writeCopilotInstructions(cwd: string): void {
  writeAgentInstructions(cwd, ['vscode'])
}
