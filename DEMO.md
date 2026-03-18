# Kontinue Demo Scenario

> A walkthrough showing how Kontinue gives AI agents persistent memory across sessions — demonstrated by using Kontinue to build a new feature *in Kontinue itself*.

---

## The Setup

You're working on Kontinue with an AI coding agent (GitHub Copilot, Claude Code, Cursor — any agent that supports MCP). Kontinue is already connected as an MCP server. You want to add a new CLI command: **`kontinue export`** — which generates a portable Markdown report of the project's memory (decisions, tasks, and recent sessions) so you can share context with a teammate or attach it to a PR.

The twist: the feature touches multiple layers of the codebase and is too large to finish in one context window. Without Kontinue, each session starts from scratch. With Kontinue, the agent picks up exactly where it left off.

---

## Session 1: "Add a kontinue export command"

### You say:

> "Add a `kontinue export` command that writes a Markdown report of the project's decisions, open tasks, and recent session handoffs to a file. Should default to the last 30 days."

### What the agent does (with Kontinue):

**1. Reads context first** — `kontinue_read_context`
```
No prior sessions. Clean slate.
```

**2. Explores the codebase** — reads `src/commands/decision.ts`, `src/store/queries.ts`, `src/store/markdown.ts` to understand existing patterns before writing anything.

**3. Captures intent as a task** — `kontinue_update_task`
```
Title: Add kontinue export command
Description: New CLI command that generates a portable Markdown report of
  project memory. Acceptance criteria:
  - `kontinue export` writes a .md file to the current directory
  - Report includes: open tasks, decisions from the last N days, recent session handoffs
  - --days flag controls the lookback window (default 30)
  - --output flag controls the filename (default kontinue-export-YYYY-MM-DD.md)
  - Command follows the same patterns as src/commands/decision.ts and src/commands/log.ts
```

**4. Creates a plan** — `kontinue_update_plan`
```
Plan: kontinue export command
Steps:
  1. Add date-range query helpers to src/store/queries.ts
  2. Add report template to src/store/markdown.ts
  3. Implement src/commands/export.ts
  4. Wire up command in package.json oclif config
  5. Manual test end-to-end
```

**5. Starts executing** — adds `getDecisionsSince()` and `getSessionsSince()` to `src/store/queries.ts`, then starts on the markdown template. Hits a design question:

**6. Logs a decision** — `kontinue_log_decision`
```
Summary: Export defaults to 30-day lookback window, not "all time"
Rationale: Projects accumulate hundreds of decisions over months. A full
  export becomes unreadable and slow. 30 days covers the active work window
  for most features and is overridable with --days.
Alternatives: Export everything (unreadable at scale), user must always
  specify a range (poor DX for the common case)
Files: src/commands/export.ts, src/store/queries.ts
Tags: ux, cli
```

**7. Checkpoints progress** — `kontinue_checkpoint`
```
Completed plan steps 1-2.
  Added getDecisionsSince(projectId, days) and getSessionsSince(projectId, days)
  to src/store/queries.ts (around line 210).
  Added renderExportReport(project, decisions, tasks, sessions) to
  src/store/markdown.ts — returns a full Markdown string.
Files active: src/store/queries.ts, src/store/markdown.ts
Next step: Implement src/commands/export.ts — wire up flags, call renderExportReport(),
  write output file. Then step 4: register command in package.json.
```

**8. Context window fills up** — the agent writes a handoff:

```
Summary: Added DB query helpers and report template. getDecisionsSince() and
  getSessionsSince() added to src/store/queries.ts at line 210.
  renderExportReport() added to src/store/markdown.ts — accepts project,
  decisions, tasks[], sessions[] and returns a Markdown string.
NOT finished: src/commands/export.ts does not exist yet. Needs to:
  - Parse --days (default 30) and --output flags
  - Call requireProject(cwd) like other commands
  - Call getDecisionsSince, getSessionsSince, getAllOpenTasks
  - Call renderExportReport(), write result to flags.output path
  - Print success with ok() helper (see src/utils/display.ts)
  Step 4 (package.json oclif registration) and step 5 (manual test) also remain.
```

---

## Session 2: "Keep going"

### You say:

> "Keep going on the export command."

### What the agent does:

**1. Reads context** — `kontinue_read_context`
```
Last session accomplished:
  - getDecisionsSince() and getSessionsSince() in src/store/queries.ts:210
  - renderExportReport() in src/store/markdown.ts

Not finished:
  - src/commands/export.ts (does not exist yet)
  - package.json oclif registration
  - Manual test

Decision: 30-day default lookback; full history unreadable at scale.
Plan: export command — steps 1-2 done, step 3 next.
```

**2. Resumes immediately** — no "what were we working on?" questions. Creates `src/commands/export.ts` following the same `Command` + `Flags` + `requireProject()` pattern seen in `src/commands/decision.ts`.

**3. Discovers an edge case, logs an observation** — `kontinue_add_observation`
```
Observation: renderExportReport() in src/store/markdown.ts escapes decision
  summaries with HTML entities when summaries contain angle brackets
  (e.g. "Use <Type> for generics"). Output file looks fine but a unit test
  would catch regressions. Logged for follow-up.
Files: src/store/markdown.ts
Task: Add kontinue export command
```

**4. Registers the command** — adds `"./dist/commands/export.js"` to the `oclif.commands` array in `package.json`.

**5. Builds and runs it against the Kontinue repo itself:**
```bash
pnpm build && kontinue export --days 7
# → Wrote kontinue-export-2026-03-18.md (4 decisions, 8 tasks, 2 sessions)
```

**6. Marks everything done:**

```
Task outcome: kontinue export command fully implemented.
Files changed:
  - src/store/queries.ts (getDecisionsSince, getSessionsSince at line 210)
  - src/store/markdown.ts (renderExportReport function)
  - src/commands/export.ts (new file — CLI command implementation)
  - package.json (oclif command registration)
All 5 plan steps complete. HTML-entity edge case noted as follow-up observation.
```

### What you see in chat:

> "`kontinue export` is working. Running it against this repo produces a readable Markdown report with all open tasks, decisions from the last N days, and recent session handoffs. There's a minor HTML-entity escaping quirk in `renderExportReport()` that I logged as an observation for follow-up."

---

## Session 3 (three weeks later): "Why 30 days?"

### You say:

> "A contributor is asking why `kontinue export` defaults to 30 days instead of exporting everything."

### What the agent does:

**1. Reads context** — `kontinue_read_context`. No active tasks.

**2. Searches memory** — `kontinue_search_memory` for "export"
```
Decision (Session 1): Export defaults to 30-day lookback window, not "all time"
Rationale: Projects accumulate hundreds of decisions over months. Full export
  becomes unreadable and slow. 30 days covers the active work window for most
  features; overridable with --days.
Alternatives considered: export everything (unreadable at scale), always require
  the user to specify a range (poor DX).
Files: src/commands/export.ts, src/store/queries.ts
```

### What you see in chat:

> "The 30-day default was a deliberate UX call: a full project history can be hundreds of entries and becomes unreadable as a shareable document. 30 days covers the active development window for most features. The `--days` flag overrides it when you need more. This was decided during the initial implementation and is logged with the alternatives that were considered."

No digging through git history. No guessing. The reasoning was captured when the decision was made and is still there three weeks later.

---

## What This Demonstrates

| Capability | How it showed up |
|---|---|
| **Session continuity** | Session 2 resumed in seconds — exact files, line numbers, and next step from the handoff |
| **Autonomous execution** | Agent read the codebase, designed the feature, and implemented it without step-by-step direction |
| **Decision persistence** | 30-day default rationale was available to a *different person* weeks later in Session 3 |
| **Compaction recovery** | Mid-session checkpoint named exact file and line so nothing was re-derived after context overflow |
| **Structured planning** | 5-step plan tracked progress across two context windows |
| **Observation capture** | HTML-entity edge case discovered mid-implementation and preserved for follow-up |
| **Clean handoffs** | Handoff named exact function signatures, existence/non-existence of files, and what still needed doing |
| **Dogfooding** | The demo uses Kontinue to build Kontinue — the memory system is its own best demonstration |

---

## The Difference Without Kontinue

| With Kontinue | Without Kontinue |
|---|---|
| Session 2 opens the right file at the right line | Agent re-reads entire codebase, asks "what were we doing?" |
| Decision rationale available to teammates weeks later | "Not sure why it defaults to 30 days — check git blame" |
| Edge case observation preserved for follow-up | Rediscovered (or silently shipped) in a future session |
| Plan tracks progress across context windows | Progress lost on context overflow |
| Handoff names exact function signatures and what doesn't exist yet | Vague "I was working on an export command" |

---

## Try It Yourself

```bash
# In your project directory:
npx kontinue init

# Connect to your AI agent via MCP, then say:
# "Add [any feature] to this project."

# Watch the agent plan, execute, checkpoint, and hand off.
# Start a new session and see it resume without asking what you were doing.
```