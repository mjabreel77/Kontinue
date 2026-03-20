# Kontinue v2 — Architecture

> **System overview:** Kontinue v2 is an autonomous coding agent with built-in structured memory controlled by an orchestrator runtime that manages LLM interactions, tool execution, context windows, and subagent coordination.

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface                           │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │Terminal CLI  │  │  VS Code Panel   │  │  Web Dashboard   │   │
│  └──────┬───────┘  └────────┬─────────┘  └────────┬─────────┘   │
│         └──────────────────┬┘                     │             │
│                            ↓                      │             │
│                    Chat Protocol                  │             │
│                   (WebSocket/stdio)               │             │
└────────────────────────┬──────────────────────────┘             │
                         ↓                                        │
┌───────────────────────────────────────────────────────────────┐ │
│                     Agent Runtime                             │ │
│  ┌─────────────────────────────────────────────────────────┐  │ │
│  │                    Orchestrator                         │  │ │
│  │  • Receives user goals                                  │  │ │
│  │  • Manages agent loop (think → act → observe)           │  │ │
│  │  • Enforces workflow rules (plan before multi-step, e.) │  │ │
│  │  • Decides when to use subagents vs. direct work        │  │ │
│  │  • Routes signals and user messages                     │  │ │
│  └──────────┬───────────────────────────────────┬──────────┘  │ │
│             ↓                                   ↓             │ │
│  ┌──────────────────┐              ┌─────────────────────────┐│ │
│  │   LLM Gateway    │              │    Subagent Spawner     ││ │
│  │  • Model routing │              │  • Explore (read-only)  ││ │
│  │  • Token counting│              │  • Planner (read-only)  ││ │
│  │  • Retry/fallback│              │  • Worker (full access) ││ │
│  │  • Streaming     │              │  • Reviewer (read-only) ││ │
│  └──────────────────┘              └─────────────────────────┘│ │
│             ↓                                   ↓             │ │
│  ┌──────────────────────────────────────────────────────────┐ │ │
│  │                  Tool Executor                           │ │ │
│  │  ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────┐  │ │ │
│  │  │  Files   │ │Terminal │ │  Search  │ │    Memory    │  │ │ │
│  │  │ read     │ │ run     │ │ grep     │ │ checkpoint   │  │ │ │
│  │  │ edit     │ │ bg      │ │ semantic │ │ decision     │  │ │ │
│  │  │ create   │ │ output  │ │ glob     │ │ observation  │  │ │ │
│  │  │ delete   │ │ kill    │ │ errors   │ │ task/plan    │  │ │ │
│  │  └──────────┘ └─────────┘ └──────────┘ └──────────────┘  │ │ │
│  │  ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────┐  │ │ │
│  │  │   Git    │ │  HTTP   │ │  Comms   │ │   Signals    │  │ │ │
│  │  │ commit   │ │ fetch   │ │ ask_user │ │ check        │  │ │ │
│  │  │ branch   │ │ browse  │ │ report   │ │ acknowledge  │  │ │ │
│  │  │ diff     │ │         │ │          │ │ inject       │  │ │ │
│  │  └──────────┘ └─────────┘ └──────────┘ └──────────────┘  │ │ │
│  └──────────────────────────────────────────────────────────┘ │ │
│             ↓                                                 │ │
│  ┌───────────────────────────────────────────────────────────┐│ │
│  │                  Context Manager                          ││ │
│  │  • Token budget tracking                                  ││ │
│  │  • Automatic checkpointing at thresholds                  ││ │
│  │  • Rolling context window management                      ││ │
│  │  • Proactive compaction (summarize old context)           ││ │
│  │  • Session continuity (auto hand-off at limit)            ││ │
│  └───────────────────────────────────────────────────────────┘│ │
└───────────────────────────────────────────────────────────────┘ │
                         ↓                                        │
┌───────────────────────────────────────────────────────────────┐ │
│                    Persistence Layer                          │ │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────────┐ │ │
│  │  PostgreSQL   │  │    Qdrant     │  │  File System       │ │ │
│  │  (structured) │  │  (vectors)    │  │  (workspace files) │ │ │
│  └───────────────┘  └───────────────┘  └────────────────────┘ │ │
│  ┌───────────────────────────────────────────────────────────┐  │ │
│  │  Real-time Event Bus (WebSocket broadcast)                │──┘ │
│  └───────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. User Interface Layer

Two primary frontends for MVP, with a Cursor-like IDE as the long-term vision:

| Frontend | Protocol | Use Case | Phase |
|---|---|---|---|
| **Terminal CLI** | stdio JSON-RPC | Primary agent interface, headless, CI/CD, SSH | MVP |
| **Web Dashboard** | WebSocket | Real-time monitoring, signal sending, team use, session replay | MVP |
| **Kontinue IDE** | Native | Full coding environment with integrated agent (like Cursor) | Future |

The Chat Protocol is intentionally minimal:
- `user_message` — human sends text or structured intent
- `agent_message` — agent sends status, question, or outcome
- `agent_activity` — real-time feed of agent actions (tool calls, decisions, observations)
- `signal` — developer signal injection

### 2. Agent Runtime

#### Orchestrator

The brain. Receives goals, decomposes them, executes via tools, and reports outcomes.

**Core loop:**

```
1. Receive goal (user message or resumed task)
2. Read context (load session state, active tasks, last checkpoint)
3. Plan (create/update plan if multi-step)
4. Execute loop:
   a. Think (LLM decides next action)
   b. Act (execute tool call)
   c. Observe (process result, update memory)
   d. Check (signals? budget? errors?)
   e. Repeat until task complete or blocked
5. Report outcome to user
6. Check for next task or wait for user
```

**Workflow enforcement rules:**

| Rule | Trigger | Action |
|---|---|---|
| Plan required | Goal has 3+ steps | Block task start until plan exists |
| Checkpoint required | Every N tool calls or M minutes | Auto-trigger checkpoint |
| Decision logging | Choice between alternatives detected | Prompt for `log_decision` |
| Signal check | Between tasks | Auto-call `check_signals` |
| Handoff required | Session ending or context budget > 90% | Auto-trigger `write_handoff` |
| Confirmation required | Destructive action detected | Pause and ask user |

#### LLM Gateway

Abstracts the underlying model(s). **Multi-model by design** — user picks the primary model, orchestrator selects optimal models for subagents:

- **Model routing** — different models for different tasks:
  - Fast model (e.g., Haiku/GPT-4o-mini) for explore subagents, classification
  - Strong model (e.g., Opus/o3) for orchestrator reasoning, complex code changes
  - Worker model (e.g., Sonnet) for subagent code edits
  - Embedding model for semantic search
  - User configures per-subagent-type overrides in `config.subagents`
- **BYOK for MVP** — users bring their own API keys (Anthropic, OpenAI, Azure, local)
- **Managed service later** — Kontinue-provided keys with usage-based billing
- **Token counting** — pre-flight token estimation for context management
- **Streaming** — stream responses for real-time activity display
- **Retry & fallback** — rate limit handling, model fallback chain
- **Provider abstraction** — Anthropic, OpenAI, local models, Azure

#### Subagent Spawner

Creates isolated agent instances with scoped access:

```
Orchestrator
  ├── spawn_explore("What does the auth middleware do?")
  │     → Read-only access to files, search, memory
  │     → Returns: structured findings
  │
  ├── spawn_planner("Implement rate limiting")
  │     → Read-only access + plan creation
  │     → Returns: proposed plan with steps
  │
  ├── spawn_worker("Add token bucket to middleware")
  │     → Full access: files, terminal, memory
  │     → Returns: outcome + files changed
  │
  └── spawn_reviewer("Review the rate limiting changes")
        → Read-only access + observation logging
        → Returns: findings, concerns, approval/rejection
```

**Subagent isolation:**
- Each subagent gets its own LLM conversation
- Scoped tool access (read-only agents can't edit files)
- Shared memory (can read observations/decisions, explore can add observations)
- Results flow back to orchestrator for integration

### 3. Tool Executor

All tools are native — same execution environment, same process, no MCP overhead.

#### File Operations

| Tool | Description |
|---|---|
| `read_file(path, startLine, endLine)` | Read file contents with optional line range |
| `edit_file(path, oldString, newString)` | Precise string replacement |
| `create_file(path, content)` | Create new file with content |
| `delete_file(path)` | Delete file (requires confirmation) |
| `multi_edit(operations[])` | Batch edits across files |
| `search_files(glob)` | Find files by name/path pattern |
| `list_dir(path)` | List directory contents |

#### Terminal Operations

| Tool | Description |
|---|---|
| `run_command(cmd, cwd, timeout)` | Execute command, return output |
| `run_background(cmd, cwd)` | Start background process, return ID |
| `get_output(id)` | Get background process output |
| `kill_process(id)` | Terminate background process |

#### Search & Analysis

| Tool | Description |
|---|---|
| `grep(pattern, glob, isRegex)` | Text search across files |
| `semantic_search(query)` | Vector-based codebase search |
| `get_errors(paths?)` | Compile/lint diagnostics |
| `symbol_references(symbol)` | Find all usages of a symbol |
| `rename_symbol(old, new)` | Cross-file rename |

#### Memory Operations (Native)

| Tool | Description |
|---|---|
| `checkpoint(progress, nextStep, filesActive)` | Snapshot current state |
| `log_decision(summary, rationale, alternatives, files, tags)` | Record architectural choice |
| `supersede_decision(oldSummary, newDecision)` | Replace outdated decision |
| `add_observation(content, taskTitle, files)` | Record finding/discovery |
| `resolve_observation(content)` | Mark observation addressed |
| `update_task(action, title, description, outcome)` | Task lifecycle management |
| `update_plan(action, title, goal, steps)` | Plan lifecycle management |
| `write_handoff(summary)` | Session-ending summary |
| `search_memory(query)` | Search all historical memory |
| `read_entity(name)` | Everything known about a concept |

#### Git Operations

| Tool | Description |
|---|---|
| `git_status()` | Current repo state |
| `git_diff(ref?)` | Show changes |
| `git_commit(message)` | Commit staged changes |
| `git_branch(name, action)` | Branch management |
| `git_log(count)` | Recent commit history |

#### Communication

| Tool | Description |
|---|---|
| `ask_user(question, options?)` | Put human in the loop |
| `report_progress(message)` | Non-blocking status update |
| `report_outcome(summary)` | Task completion report |

### 4. Context Manager

**The most critical component.** Manages what's in the LLM's context window.

#### Token Budget System

```
Total budget: ~128K tokens (model-dependent)

Allocation:
  System prompt:        ~4K   (fixed)
  Session context:      ~8K   (loaded at start, compressed over time)
  Active plan + task:   ~2K   (always present)
  Working files:        ~40K  (managed set of currently-relevant files)
  Recent tool results:  ~30K  (rolling window, oldest evicted first)
  Chat history:         ~10K  (user messages, agent responses)
  Reserve:              ~34K  (for next LLM response + tool calls)
```

#### Compaction Strategy

When budget thresholds are hit:

| Threshold | Action |
|---|---|
| 50% | Log info: "Context at 50%, monitoring" |
| 70% | Summarize tool results older than 10 turns |
| 80% | Write checkpoint, compress chat history to key points |
| 90% | Write handoff, start new session transparently |
| 95% | Emergency: truncate oldest context, preserve system + current task |

#### Working File Set

Instead of blindly reading files, the Context Manager tracks:
- Which files are currently being edited
- Which files were recently referenced
- Which files are likely relevant to the current task (via plan/task metadata)

When new files are read, old ones are summarized or evicted based on recency and relevance.

### 5. Persistence Layer

Reuses v1's infrastructure but accessed directly (not via HTTP):

- **PostgreSQL** — tasks, decisions, observations, plans, sessions, checkpoints, handoffs, signals, users, workspaces, projects
- **Qdrant** — vector embeddings for semantic memory search
- **File System** — the actual codebase being worked on

#### Event Bus

Every memory mutation emits an event:
- `TaskCreated`, `TaskStatusChanged`, `DecisionLogged`, etc.
- Events broadcast via WebSocket to all connected dashboards
- Events also available as a queryable audit log

---

## Deployment Modes

> **Strategy: Local-first during development, cloud eventually.**

### Mode 1: Local Agent (MVP — Development Phase)

```
Developer Machine
├── Kontinue Agent (Node.js process)
│   ├── LLM Gateway → Cloud API (BYOK: Anthropic/OpenAI/Azure)
│   ├── Tool Executor → Local filesystem + terminal
│   └── Memory → Local PostgreSQL (or SQLite for simple mode)
├── Terminal CLI → stdio (primary interface)
└── Dashboard → localhost:3000 (monitoring + signals)
```

- Agent runs locally — full access to workspace
- LLM calls go to cloud APIs with user's own keys
- Files are local, memory is local
- Dashboard is local web UI
- **This is the MVP target**

### Mode 2: Cloud Agent (Future — Managed Service)

```
Cloud
├── Kontinue Agent (container)
│   ├── LLM Gateway → Kontinue-managed API keys
│   ├── Tool Executor → Sandboxed container filesystem
│   └── Memory → Managed PostgreSQL + Qdrant
├── Dashboard → kontinue.dev
└── WebSocket → Real-time to developer's terminal/browser
```

- Agent runs in cloud
- Sandboxed execution environment
- Code is cloned/synced from git
- Results pushed back via git
- Real-time streaming to developer
- Usage-based billing

### Mode 3: Hybrid (Future)

- Agent runs locally for file operations
- Memory stored in cloud for cross-device access
- Dashboard available remotely

---

## Collaboration Model

Multiple developers on the same project using **git worktrees**:

```
Shared Repository
├── main/                      ← main branch
├── worktrees/
│   ├── dev-alice/             ← Alice's agent session
│   ├── dev-bob/               ← Bob's agent session
│   └── dev-charlie/           ← Charlie's agent session
└── Shared PostgreSQL          ← decisions, observations, plans
```

- Each developer gets an **isolated worktree** — no file conflicts between agents
- **Shared memory**: decisions, observations, and plans visible to all developers
- **Signal system** enables cross-developer coordination
- **Merge coordination**: agent detects conflicts, assists with resolution
- Checkpoints are per-session (private); decisions are project-wide (shared)

---

## Rollback Architecture

Multi-layer rollback with increasing scope:

| Layer | Scope | Mechanism | Triggered By |
|---|---|---|---|
| **Edit** | Single file edit | Stored old content → restore | `undo_edit(id)` |
| **Batch** | Multi-file staged edits | `abort_batch()` before write | User reject in preview |
| **Task** | All changes in a task | `git revert <task-commit>` | `kontinue rollback --task` |
| **Session** | All changes in a session | `git revert --no-commit <commits>` | `kontinue rollback --session` |
| **File** | Single file to specific state | `git checkout <commit> -- <file>` | `kontinue rollback --file` |

- Rollback never deletes memory — decisions/observations preserved with "rolled back" flag
- Rollback always creates its own commit — fully auditable
- Rollback triggers a checkpoint — future sessions know the state

---

## Observability Architecture

Structured audit trail at every layer:

```
Tool Call → Audit Entry (automatic)
         → Decision/Observation (agent-logged, explains "why")
         → Dashboard View (human-readable)
         → CLI Commands (machine-queryable)
```

| View | Purpose |
|---|---|
| **Timeline** | Chronological feed of all agent actions |
| **Decision Tree** | Decisions with rationale, alternatives, linked files |
| **Diff View** | Per-task file changes with before/after |
| **Session Replay** | Step-by-step replay of agent actions |
| **Cost Tracker** | Token usage by session, task, model, subagent |

CLI: `kontinue log`, `kontinue audit`, `kontinue replay`, `kontinue cost`

---

## Technology Stack

| Component | Technology | Rationale |
|---|---|---|
| Agent Runtime | **TypeScript (Node.js)** or **Rust** | TS: familiar, fast iteration, same as CLI. Rust: performance, memory safety |
| LLM Gateway | TypeScript | Provider SDKs are JS/TS-first |
| Tool Executor | TypeScript + native bindings | File I/O, process spawning need native access |
| Persistence | PostgreSQL + Qdrant | Proven from v1, no migration needed |
| Dashboard | React + Vite | Proven from v1 |
| CLI Interface | oclif (TypeScript) | Proven from v1 |
| Kontinue IDE (future) | Electron + TypeScript | Cursor-like full coding environment with native agent |
| Event Bus | WebSocket | Proven from v1 |

**Recommendation: TypeScript for v2.0, consider Rust rewrite for performance-critical paths in v2.x.**

---

## Security Model

### Sandbox Boundaries

| Operation | Permission | Confirmation Required |
|---|---|---|
| Read files in workspace | Always allowed | No |
| Edit files in workspace | Allowed | No (reversible via git) |
| Create files | Allowed | No |
| Delete files | Allowed | **Yes** |
| Run terminal commands | Allowed | **For destructive patterns** |
| Git push | Allowed | **Yes** |
| Git force push | Allowed | **Always** |
| HTTP fetch | URLs in workspace/docs only | Prompt for unknown domains |
| Access outside workspace | **Denied** | N/A |
| Spawn background processes | Allowed | No |
| Install packages | Allowed | **Yes** |

### API Key Security

- LLM API keys stored encrypted (same AES-256-GCM store as v1 credentials)
- Never logged, never sent to chat, never stored in memory
- Provider-specific rate limiting and budget caps

---

## Migration from v1

v2 is backward-compatible with v1 data:

1. **Memory database** — same PostgreSQL schema, no migration needed
2. **Dashboard** — same WebSocket protocol, same event types
3. **CLI commands** — superset of v1 commands
4. **MCP compatibility** — v2 can still expose an MCP server for agents that want to use Kontinue as a memory layer (backward compat mode)

The agent instructions (`.github/copilot-instructions.md`, `CLAUDE.md`) become unnecessary — the agent IS Kontinue, it doesn't need to be told how to use its own tools.
