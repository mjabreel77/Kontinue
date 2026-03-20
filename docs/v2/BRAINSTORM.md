# Kontinue v2 — Brainstorming

> **Vision:** Kontinue stops being a memory layer bolted onto other agents and becomes the agent itself — a fully autonomous coding agent where structured memory is a first-class primitive, not an afterthought.

---

## The Problem with v1

In v1, Kontinue is an MCP server. The actual agent is Copilot, Claude, Cursor, or Windsurf. This creates fundamental friction:

1. **The agent doesn't really own the workflow.** It follows instructions embedded in system prompts to call MCP tools at the right time. If the prompt is weak, memory quality degrades. The agent's "autonomy" is simulated through prompt engineering.

2. **Tool surface is split.** The agent's native tools (file editing, terminal, search) live in the host. Memory tools live in Kontinue's MCP server. The agent context-switches between two systems.

3. **Subagent coordination is host-dependent.** Whether the agent can spawn subagents depends entirely on the host IDE. Copilot has it, Claude Code doesn't, Cursor is different again.

4. **Chat is the agent's notebook.** Despite our instructions saying "persist to Kontinue," agents still dump analysis into chat because that's how LLMs naturally work. When the context window compresses, that work is lost.

5. **No control over planning quality.** The agent plans however the LLM feels like planning. We can nudge via prompts, but we can't enforce planning discipline.

---

## The v2 Insight

**What if Kontinue IS the agent?**

- Memory tools aren't add-ons. They're as fundamental as `read_file` or `run_terminal`.
- The agent doesn't need to be told when to checkpoint. The runtime does it.
- Planning isn't a prompt suggestion. It's a structured workflow the runtime enforces.
- Chat isn't the agent's workspace. It's a status display for the human.
- Subagents aren't IDE features. They're first-class runtime primitives.

---

## Core Identity Shift

| Aspect | v1 (MCP Layer) | v2 (The Agent) |
|---|---|---|
| What Kontinue is | Memory server that agents connect to | The autonomous coding agent itself |
| Who controls the workflow | The host agent (Copilot/Claude) | Kontinue's runtime + LLM backbone |
| Where memory lives | Separate MCP tool calls | Native primitives, same as file I/O |
| Chat purpose | Agent's primary output + user communication | User communication only (status, questions, outcomes) |
| Planning | Prompt-guided, optional | Runtime-enforced, mandatory for multi-step work |
| Subagents | Depends on host IDE | First-class runtime primitive |
| Context management | Hope the LLM manages it well | Runtime-managed with proactive compaction |

---

## What the Agent Needs

### Native Tool Categories

**1. Code Intelligence (replaces host IDE tools)**
- `read_file` — read file contents by path + line range
- `edit_file` — precise string replacement in files
- `create_file` — create new files
- `search_files` — glob-based file search
- `grep` — text/regex search across workspace
- `semantic_search` — codebase-wide semantic search
- `list_directory` — directory listing
- `get_errors` — compile/lint diagnostics
- `rename_symbol` — cross-file rename refactoring

**2. Terminal / Execution**
- `run_command` — execute shell commands (foreground, with output)
- `run_background` — start long-running processes (servers, watchers)
- `get_output` — check background process output
- `kill_process` — terminate background processes

**3. Memory (native, not MCP)**
- `checkpoint` — mid-session state snapshot (auto-triggered by runtime too)
- `log_decision` — record choice with rationale, alternatives, files, tags
- `add_observation` — mid-task discovery, constraint, bug finding
- `resolve_observation` — mark finding addressed
- `ask_question` — log uncertainty for developer input
- `answer_question` — resolve open question
- `flag_blocker` — hard block requiring external input
- `search_memory` — query past decisions, observations, handoffs
- `read_entity` — everything known about a module/file/concept

**4. Task & Planning**
- `update_task` — create / start / complete / abandon tasks
- `update_plan` — create plans, mark steps, change status
- `write_handoff` — session-ending summary for next session

**5. Session Lifecycle (runtime-managed)**
- `read_context` — called automatically at session start
- `check_signals` — poll for developer signals (also auto-injected)
- `acknowledge_signal` — confirm signal receipt

**6. Subagents**
- `spawn_explore` — read-only codebase exploration (safe to parallelize)
- `spawn_planner` — decompose a goal into an executable plan
- `spawn_worker` — delegate a scoped code change task
- `spawn_reviewer` — review code changes before committing

**7. Communication**
- `ask_user` — put human in the loop for genuine ambiguity
- `report_progress` — status update to chat (not for agent's own notes)
- `report_outcome` — task/goal completion summary

**8. External Integration**
- `fetch_url` — HTTP requests (API docs, external resources)
- `git_operations` — commit, branch, diff, log
- `browser_preview` — open/screenshot web pages

---

## Subagent Model

### Why Subagents?

Large tasks benefit from decomposition. A monolithic agent holding the full codebase in context degrades in quality. Subagents:

1. **Scope isolation** — each subagent gets a focused slice of context
2. **Parallel execution** — explore multiple files simultaneously
3. **Quality** — smaller context = more accurate reasoning
4. **Safety** — read-only subagents can't break things

### Subagent Types

| Type | Access | Purpose |
|---|---|---|
| **Explore** | Read-only (files, search, memory) | Answer questions about the codebase |
| **Planner** | Read-only + plan creation | Decompose a goal into steps |
| **Worker** | Full access (files, terminal, memory) | Execute a scoped code change |
| **Reviewer** | Read-only + observation logging | Review changes, find issues |

### Coordination Model

The **orchestrator** (main agent loop) manages subagents:
- Decides when to spawn vs. do work directly
- Passes focused context (not the whole conversation)
- Collects results and persists them in memory
- Handles conflicts between subagent recommendations

---

## Runtime Architecture Ideas

### Option A: Single Process, LLM Loop

```
User → Chat Interface → Agent Loop → LLM API
                             ↕
                     Tool Executor
                     (files, terminal, memory, subagents)
                             ↕
                     State Manager
                     (context, checkpoints, compaction)
```

Simplest. One process, one LLM call at a time. Subagents are sequential.

### Option B: Orchestrator + Worker Pool

```
User → Chat Interface → Orchestrator
                              ↕
                    ┌─────────┼─────────┐
                    ↓         ↓         ↓
                Worker    Worker    Worker
                (explore) (code)   (review)
                    ↓         ↓         ↓
                    └─────────┼─────────┘
                              ↕
                     Shared State
                     (memory, files, git)
```

More complex. Orchestrator delegates to specialized workers. Workers can run in parallel (especially read-only ones).

### Option C: Event-Driven Pipeline

```
User Message → Intent Classifier → Plan Generator → Task Queue
                                                         ↓
                                                   Executor Pool
                                                   (1 writer, N readers)
                                                         ↓
                                                   Result Aggregator
                                                         ↓
                                                   User Response
```

Most ambitious. Event-driven, async, with a task queue. Good for long-running autonomous work.

**Initial recommendation: Start with Option A, design interfaces for B.**

---

## Context Management

### The Core Problem

LLMs have finite context windows. Long sessions accumulate:
- File contents read
- Terminal outputs
- Conversation history
- Tool call results

Eventually the window fills and quality degrades or the session crashes.

### v1 Approach (broken)

Rely on the host IDE's context management. Hope the LLM writes a handoff before compaction. Cross fingers.

### v2 Approach

**Runtime-managed context with proactive checkpointing:**

1. **Context budget tracking** — the runtime knows how many tokens have been consumed
2. **Automatic checkpointing** — when token usage crosses thresholds (50%, 75%, 90%), the runtime triggers a checkpoint
3. **Proactive compaction** — at 80% usage, the runtime summarizes and compresses older context, keeping recent + critical items
4. **Session continuity** — if a session hits the limit, the runtime writes a handoff and starts a new session seamlessly
5. **Working memory vs. long-term memory** — recent context stays in the LLM window; older context lives in the database and is retrieved on demand

### Context Hierarchy

```
┌─────────────────────────────────────────┐
│ System prompt (agent identity, rules)    │  Fixed
├─────────────────────────────────────────┤
│ Session context (from read_context)      │  Loaded at start
├─────────────────────────────────────────┤
│ Active plan + current task               │  Always present
├─────────────────────────────────────────┤
│ Recent tool results (last N)             │  Rolling window
├─────────────────────────────────────────┤
│ Working files (currently being edited)   │  Managed set
├─────────────────────────────────────────┤
│ User messages                            │  Chat history
└─────────────────────────────────────────┘
```

Items higher in the hierarchy are never evicted. Items lower can be summarized or dropped.

---

## Chat as Communication Gate

### What goes to chat (user sees)

- Task outcomes ("Implemented rate limiting with token bucket algorithm")
- Questions that need human input ("Should I use Redis or in-memory for the rate limiter?")
- Progress milestones ("3 of 5 tasks complete")
- Errors that block progress ("Tests failing — need your input on the expected behavior")
- Confirmation requests for destructive actions ("About to delete the legacy auth module — OK?")

### What does NOT go to chat

- Analysis and reasoning (goes to observations/decisions in memory)
- File contents being examined (stays in tool context)
- Intermediate progress ("reading file X, searching for Y")
- Plans and task decomposition (goes to plans in memory, summary to chat)

### UX Model

```
┌──────────────────────────────────┐
│          Chat Panel              │
│  (compact, outcome-focused)      │
│                                  │
│  ✓ Rate limiting implemented     │
│  ? Redis or in-memory?           │
│  ⟳ Working on auth refactor...   │
│                                  │
├──────────────────────────────────┤
│       Activity Sidebar           │
│  (live view of agent actions)    │
│                                  │
│  📝 Decision: token bucket       │
│  📋 Task started: auth refactor  │
│  💡 Observation: TTL is 24h      │
│  🔖 Checkpoint: middleware done   │
│  📊 Plan: 3/5 steps complete     │
└──────────────────────────────────┘
```

The chat is minimalist. The sidebar shows everything the agent is doing in real-time. The user can drill into any item.

---

## Developer Signals (Enhanced)

v1 signals are text messages injected into tool responses. v2 makes them richer:

- **Priority shift** — "drop everything, fix the production bug"
- **Approval** — "yes, proceed with that approach"
- **Rejection** — "no, don't do that — here's why: ..."
- **Context injection** — "FYI: the staging DB was reset last night"
- **Scope change** — "actually, don't worry about tests for now"
- **Pause/Resume** — "stop working, I need to think" / "ok continue"

Signals are not chat messages. They're structured intents that the runtime interprets and acts on.

---

## Resolved Questions

1. **LLM backbone** — **Multiple models.** User picks the primary model; orchestrator also selects models for subagents (e.g., fast model for explore, strong model for code changes). Configurable per-subagent-type in config.

2. **Hosting** — **Local during development, cloud eventually.** MVP runs entirely on developer machine. Cloud deployment comes in a later phase as a managed service.

3. **IDE integration** — **Standalone terminal + web dashboard.** Primary interfaces are a terminal CLI agent and a web dashboard. Final goal: something like Cursor — a full coding environment where the agent is native.

4. **Pricing model** — **BYOK for MVP, managed service later.** Users bring their own API keys initially. A managed service with Kontinue-provided keys comes in a later commercial phase.

5. **Multi-file editing** — **Cursor-style staging + preview + atomic apply.** Agent stages all edits into a batch, presents diffs to the user, user approves/rejects per-file or in bulk. Git-backed rollback. Live edit buffer in session state prevents context drift across 20+ files. (See [Multi-File Editing Strategy](#multi-file-editing-strategy) below.)

6. **Testing** — **Configurable.** User sets `behavior.autoTest` in config (always / on-change / never). Default: run tests after code changes if a test command is configured.

7. **Git integration** — **Configurable.** User sets `behavior.autoCommit` in config (per-task / per-session / manual). Default: auto-commit per task with a generated commit message.

8. **Collaboration** — **Yes, via git worktrees.** Multiple developers work on the same project using separate git worktrees. Each developer has their own agent session with isolated working directory. Shared memory (decisions, observations, plans) via the same PostgreSQL database. (See [Collaboration Model](#collaboration-model) below.)

9. **Rollback** — **Robust multi-layer strategy.** Git-backed rollback for file changes (per-edit undo, per-task revert, per-session revert). Staged edit buffer allows abort before apply. Memory rollback via decision superseding and observation resolving. (See [Rollback Strategy](#rollback-strategy) below.)

10. **Observability** — **Efficient structured audit trail.** Every tool call logged with parameters and results. Decisions and observations form the "why" layer. Dashboard provides timeline view, diff view, decision tree. CLI provides `kontinue log` and `kontinue audit` commands. (See [Observability Model](#observability-model) below.)

---

## Multi-File Editing Strategy

Learned from comparing Claude Code (sequential, context drift), VS Code Copilot (atomic WorkspaceEdit), and Cursor (Composer staging + preview):

### Approach: Staging + Preview + Atomic Apply

```
1. Agent generates edits for all files
2. Edits staged to session.pending_edits (not yet written to disk)
3. Preview displayed: file list with diff summaries
4. User reviews: accept all / reject all / per-file accept/reject
5. Approved edits applied atomically (written + git add)
6. Rejected edits logged as observations for context
```

### Edit Buffer (prevents context drift)

When editing file #21, the LLM context includes a rolling summary of prior edits:
```
Recent edits:
- src/auth/token.ts: Added IToken interface (+15 lines)
- src/middleware/auth.ts: Updated signature to use IToken
- src/stores/token-store.ts: Refactored to new interface
[Current file: src/api/routes.ts — use IToken, not old Token type]
```

### Transaction Layer

| Tool | Description |
|---|---|
| `begin_edit_batch()` | Start a multi-file change batch |
| `stage_edit(file, old, new)` | Add edit to batch (not yet applied) |
| `preview_batch()` | Show user all pending diffs |
| `apply_batch()` | Write all + git add + optional commit |
| `abort_batch()` | Discard all pending (nothing written) |

---

## Collaboration Model

Multiple developers, same project, using **git worktrees**:

```
Shared Repository
├── main/                      ← main branch
├── worktrees/
│   ├── dev-alice/             ← Alice's worktree (her agent session)
│   ├── dev-bob/               ← Bob's worktree (his agent session)
│   └── dev-charlie/           ← Charlie's worktree
```

- Each developer gets their own **isolated working directory** via `git worktree add`
- Each agent session operates on one worktree — no conflicts
- **Shared memory database**: all developers' decisions, observations, and plans are visible to each other
- **Signal system enables coordination**: Alice can signal Bob's agent ("I refactored the auth module, update your imports")
- **Merge coordination**: agent can detect merge conflicts and assist with resolution

### Collaboration in shared memory:

| Data | Scope | Visibility |
|---|---|---|
| Tasks | Per-developer session | Visible to all (read-only) |
| Decisions | Project-wide | Shared — all agents see and respect |
| Observations | Project-wide | Shared — avoids duplicate discovery |
| Plans | Project-wide | Shared — coordinated execution |
| Checkpoints | Per-session | Private to developer |
| Signals | Targeted or broadcast | Developer → specific agent or all agents |

---

## Rollback Strategy

Multi-layer rollback with increasing scope:

### Layer 1: Edit-level (immediate)

- Every `edit_file` stores the old content
- `undo_edit(editId)` restores the previous version
- Works even mid-task

### Layer 2: Batch-level (before apply)

- Staged edit batches can be aborted before writing to disk
- `abort_batch()` discards all pending changes — nothing was ever written

### Layer 3: Task-level (git-backed)

```
kontinue rollback --task "Add auth middleware"
```
- Each completed task has a git commit (if autoCommit enabled)
- Rollback = `git revert <task-commit>`
- Associated memory (decisions, observations) marked as "rolled back" but preserved for audit

### Layer 4: Session-level (nuclear option)

```
kontinue rollback --session <session-id>
```
- Reverts all commits made during a session
- `git revert --no-commit <commit1> <commit2> ...` then one revert commit
- Memory preserved, task status set to "rolled back"

### Layer 5: Selective rollback

```
kontinue rollback --file src/auth.ts --to <commit>
```
- Restore a single file to a specific state
- Agent logs an observation explaining the rollback

### Rollback safety:
- **Rollback never deletes memory** — decisions, observations preserved with "rolled back" flag
- **Rollback creates its own commit** — fully auditable, can be re-reverted
- **Rollback triggers a checkpoint** — future sessions know exactly what state was reverted to

---

## Observability Model

### Principle: Every "why" is already captured

The agent already logs decisions (why it chose approach A over B) and observations (what it discovered). Observability is about **surfacing** this data efficiently.

### Audit Trail (automatic)

Every tool call is logged:

```typescript
interface AuditEntry {
  timestamp: Date;
  sessionId: string;
  taskTitle: string;
  tool: string;           // "edit_file", "run_command", etc.
  parameters: unknown;    // with secrets redacted
  result: "success" | "error" | "denied";
  tokensUsed: number;
  durationMs: number;
}
```

### Dashboard Views

| View | Shows | Use Case |
|---|---|---|
| **Timeline** | Chronological feed of all agent actions | "What did the agent do in the last hour?" |
| **Decision Tree** | Decisions with rationale, alternatives, linked files | "Why did the agent choose this approach?" |
| **Diff View** | Per-task file changes with before/after | "What exactly changed?" |
| **Task Board** | Kanban of tasks with status, outcome | "What's done, what's in progress?" |
| **Memory Search** | Full-text + semantic search across all memory | "Find everything related to auth" |
| **Session Replay** | Step-by-step replay of agent actions | "Walk me through what happened" |

### CLI Commands

```bash
# Recent activity log
kontinue log                          # last 20 actions
kontinue log --task "Add auth"        # actions for specific task
kontinue log --since "2h ago"         # time-scoped

# Audit trail
kontinue audit                        # full audit with tool params
kontinue audit --file src/auth.ts     # actions touching a file
kontinue audit --decisions             # all decisions with rationale

# Session replay
kontinue replay <session-id>          # step-by-step with diffs

# Cost tracking
kontinue cost                         # token usage by session/task
kontinue cost --breakdown             # per-model, per-subagent
```

### Structured Notifications

Agent proactively reports material events:
- Task completed → outcome summary
- Decision made → summary + rationale
- Error encountered → what happened + what it tried
- Rollback performed → what was reverted and why
- Budget threshold hit → tokens used, estimated remaining

---

## Key Design Principles

1. **Memory is not optional.** Every tool call, every decision, every observation is persisted by default. The agent doesn't choose to remember — it always remembers.

2. **Chat is for humans, memory is for agents.** The agent's internal state lives in structured memory. Chat is a curated view for the human.

3. **Planning is enforced, not suggested.** Multi-step work must have a plan. The runtime rejects task creation without a plan for complex work.

4. **Subagents are cheap.** Spawning an explore subagent should be as natural as calling `grep`. No ceremony.

5. **Context is managed, not hoped for.** The runtime actively manages what's in the LLM's context window. No "hope the model doesn't forget."

6. **Destructive actions require confirmation.** File deletion, force push, dropping tables — always ask.

7. **Every session is resumable.** Any session can be interrupted and resumed by the same or different instance. The state is in memory, not in the conversation.

8. **The agent earns trust progressively.** Start with more confirmations, reduce as the developer gains confidence.
