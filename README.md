# Kontinue

> Persistent memory and execution-tracing layer for AI coding agents.

**The problem:** AI coding agents are powerful but amnesiac. Every new chat session is a blank slate. Switch agents mid-task and all context is gone. Ask the same agent tomorrow and it starts over.

**Kontinue fixes this.** It gives agents structured, queryable, session-spanning memory — so every session starts exactly where the last one ended, and switching agents mid-task loses nothing.

Three things Kontinue changes:

1. **Memory** — decisions, tasks, observations, plans, and handoffs are persisted in SQLite and human-readable markdown. The agent always knows what was done, why, and what comes next.
2. **Proactiveness** — operating instructions embedded into agent context tell it when to create plans, log decisions, capture findings, and write handoffs — without being asked.
3. **Seamless agent handoff** — any agent on any tool (Copilot, Claude, Cursor, Windsurf) calls `read_context` and instantly recovers the full picture: open tasks, active plans, last handoff, recent decisions, pending questions. No re-briefing. No information loss.

Works with **GitHub Copilot (VS Code)**, **Claude Code**, **Cursor**, and **Windsurf** via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io).

---

## How It Works

Kontinue runs as an MCP server that your AI agent connects to. It supports two backend modes:

- **Local** (default) — SQLite + markdown files, zero dependencies, works offline
- **Remote** — .NET API server with PostgreSQL + Qdrant vector search, multi-workspace support, real-time WebSocket dashboard

The agent is given operating instructions through `kontinue setup` — these tell it exactly when and how to use each tool, so the behavior is automatic, not prompted.

**Every session follows the same contract:**

1. **Start** → agent calls `read_context` → recovers last handoff, open tasks, active plans, recent decisions, pending questions, and any developer signals
2. **Work** → agent proactively logs decisions (with rationale), tasks (with outcomes), observations (bugs found, constraints discovered), and plan progress as it goes
3. **End** → agent calls `write_handoff` → writes a precise, actionable summary that any agent can act on immediately

**Switch agents at any point.** A new agent — different tool, different model, next day — calls `read_context` and resumes exactly where the previous one stopped. No re-briefing, no lost context.

**Local mode** dual-writes: SQLite (queryable, fast) + `.kontinue/*.md` files (human-readable, Obsidian-browsable, git-committable).

```
~/.kontinue/kontinue.db           ← global DB, all projects keyed by path
<project>/.kontinue/
  identity.md                     ← project metadata
  tasks/todo.md                   ← live task list
  decisions/YYYY-MM-DD-*.md       ← one file per decision
  sessions/YYYY-MM-DD-HH-MM.md   ← session handoffs
  notes/                          ← observations and free-form notes
```

**Remote mode** stores everything in PostgreSQL with Qdrant for vector/hybrid search, served via .NET Aspire.



---

## Installation

**Requirements:** Node.js ≥ 22.13 (LTS)

```bash
npm install -g kontinue
```

Or from source:

```bash
git clone <repo>
cd kontinue/cli
pnpm install
pnpm build
npm link
```

---

## Quick Start

```bash
# Local mode (default — SQLite, zero dependencies):
kontinue init          # initialize memory, configure your AI agent
kontinue start         # start a session (shows last handoff + open tasks)
```

```bash
# Remote mode (.NET backend + PostgreSQL):
kontinue init --backend=remote --api-url=http://localhost:5152
kontinue start         # start a session (shows last handoff + open tasks)

# During work (the agent does most of this automatically):
kontinue task add "Implement rate limiting"
kontinue task progress "rate limiting"
kontinue decision "Use token bucket over leaky bucket" -r "More predictable burst behavior"
kontinue note "Redis TTL on the session key is 24h — affects logout behavior"
kontinue task done "rate limiting"
kontinue end           # write handoff for next session

# Review & navigate:
kontinue status        # current session, tasks, recent decisions
kontinue board         # visual task board (Todo / In Progress / Done)
kontinue log           # full decision log with rationale and context
kontinue search auth   # search all memory for "auth"
```

---

## Authentication

Remote mode uses token-based authentication. Two token types:

- **Session tokens** (`kns_*`) — created via browser login, 30-day expiry, full user access
- **API keys** (`knt_*`) — created per-project, scoped via grants, used by MCP servers and automation

```bash
# Log in via browser (stores session token in encrypted credential store)
kontinue auth login

# Create a project-scoped API key (stored in credential store, used by MCP)
kontinue auth create

# Check current auth status
kontinue auth status

# List your API keys
kontinue auth list

# Revoke a key
kontinue auth revoke <key-id>

# Rotate: revoke current key and create a new one
kontinue auth rotate
```

Credentials are stored in `~/.config/kontinue/credentials.enc` (AES-256-GCM encrypted). The MCP server resolves credentials automatically: API key from credential store → session token → config fallback.

---

## Developer Signals

Send real-time instructions to the active agent mid-session without interrupting its flow. Signals are automatically injected into the next tool response the agent makes.

```bash
kontinue signal "please prioritize the auth bug"
kontinue signal --type priority "focus on the login flow"
kontinue signal --type abort "stop — CI is broken"
kontinue signal --type answer --question "rate limit" "Use per-IP"
```

**Signal types:**
- `message` — free-text instruction
- `priority` — reprioritize to a specific task immediately
- `abort` _(urgent)_ — stop current work and check for new instructions
- `answer` — answer an open question the agent logged; also resolves it in memory

The agent calls `acknowledge_signal` once it has acted on the signal.

---

## Dashboard

The Kontinue Dashboard is a standalone Electron + React app that connects to the .NET API server via WebSocket for real-time updates.

```bash
# Start the .NET API server (via Aspire):
cd server && dotnet run --project src/Kontinue.AppHost

# Start the dashboard:
cd dashboard && npm run electron:dev
```

Features:

- **Kanban task board** — Todo / In Progress / Done columns with drag grip, card count badges, stale task indicators
- **Task detail modal** — full description, outcome, timestamps, notes with markdown rendering
- **Signal widget** — send messages, priorities, or abort signals to the active agent
- **Signal history** — filterable log of all signals with type, status, and source filters
- **Activity feed** — checkpoints, tasks, decisions, signals merged chronologically
- **Plans view** — multi-step plans with step status tracking
- **Decisions & observations** — full rationale, alternatives, and context with markdown rendering
- **Multi-workspace overview** — aggregate health stats across all projects
- **Project switching** — connect to any workspace/project on the server
- **Dark mode** — toggle between light and dark themes
- **Real-time updates** — WebSocket-driven, no polling

---

## Plans

Plans are multi-step roadmaps that span multiple tasks and context windows. They appear in every `read_context` response so any agent (or future session) always knows the larger picture.

```bash
kontinue plan add "Implement OAuth" --goal "Full OAuth2 login flow"
kontinue plan list
kontinue plan step --plan "OAuth" --content "Add token refresh endpoint"
kontinue plan step --plan "OAuth" --done "Add token refresh endpoint"
```

---

## Agent Setup

### VS Code (GitHub Copilot)

`kontinue init` writes `.vscode/mcp.json` and `.github/copilot-instructions.md` automatically.

To configure after the fact:
```bash
kontinue setup
```

### Claude Code

`kontinue init` writes `.mcp.json` and `CLAUDE.md`.

### Cursor

`kontinue init` writes `.cursor/mcp.json` and `.cursor/rules/kontinue.mdc` (with `alwaysApply: true`).

### Windsurf

`kontinue init` writes `.windsurf/mcp.json` and `.windsurfrules`.

---

## Switching Agents Without Losing Context

This is the core workflow Kontinue enables. Typical scenario:

1. You start a session with **GitHub Copilot** in VS Code — it reads context, works for an hour, checkpoints progress
2. You switch to **Claude Code** in the terminal — it calls `read_context` and gets: last handoff, open tasks, active plans with step status, recent decisions with rationale, and any pending questions
3. Claude picks up exactly where Copilot stopped — same task, same plan step, same understanding of why decisions were made
4. Later you open **Cursor** — same story

No copy-pasting context. No re-explaining. No lost progress. The handoff is always there.

```bash
# Agent 1 (Copilot) ends its session:
# → calls write_handoff("Finished auth middleware. Next: add refresh token endpoint.")

# Agent 2 (Claude Code) starts next day:
# → calls read_context
# → sees: task "Add refresh token", plan step "auth middleware" marked done,
#         decision "JWT over sessions" with rationale,
#         observation "cookie SameSite=Lax on staging"
# → starts working immediately with full context
```

---

## MCP Tools (for AI Agents)

The MCP server exposes 17 tools. Agents should call `read_context` at the start of every session — the tool descriptions themselves contain the operating instructions.

### Core session tools
| Tool | Purpose |
|---|---|
| `read_context` | **Always call first.** Returns branch, last handoff, open tasks, active plans, recent decisions, open questions, and pending signals |
| `write_handoff` | End the session with a specific summary + exact next step for the next agent |
| `checkpoint` | Mid-session snapshot — concrete state, files active, next step |

### Task management
| Tool | Purpose |
|---|---|
| `update_task` | Add / start / done / abandon tasks with `description` (required on add) and `outcome` (required on done) |

### Decisions & observations
| Tool | Purpose |
|---|---|
| `log_decision` | Record an architectural decision with `rationale`, `alternatives`, `context`, `files`, `tags` |
| `supersede_decision` | Archive an outdated decision and record its replacement |
| `add_observation` | Lightweight mid-task finding — constraint, scope clarification, discovery |
| `resolve_observation` | Mark an observation addressed once the issue is fixed |

### Plans
| Tool | Purpose |
|---|---|
| `update_plan` | Create plans, mark steps done, change plan status |

### Memory & lookup
| Tool | Purpose |
|---|---|
| `search_memory` | Keyword search across all sessions, decisions, notes, and handoffs |
| `read_decision` | Full decision details (rationale, alternatives, context, files) by keyword |
| `read_entity` | Everything known about a named module, file, or concept |

### Questions
| Tool | Purpose |
|---|---|
| `ask_question` | Log a question that needs developer input without blocking work |
| `answer_question` | Resolve an open question |
| `flag_blocker` | Record a hard block that requires external input before proceeding |

### Signals
| Tool | Purpose |
|---|---|
| `check_signals` | Explicitly poll for pending developer signals |
| `acknowledge_signal` | Confirm the agent has read and acted on signal(s) |

---

## CLI Reference

```
kontinue init [--force]              Initialize (--force resets existing project)
kontinue setup                       Re-configure agent MCP + instruction files
kontinue start                       Start a session
kontinue end                         End session + write handoff
kontinue status                      Current session, tasks, decisions
kontinue board                       Visual task board
kontinue log                         Full decision log
kontinue search <query>              Search all memory
kontinue sync                        Sync local data to remote backend

kontinue task add <title>            Add a task
kontinue task list                   List all tasks
kontinue task progress <title>       Mark in-progress
kontinue task done <title>           Mark done
kontinue task abandon <title>        Mark abandoned

kontinue plan add <title>            Create a plan
kontinue plan list                   List plans
kontinue plan step ...               Manage plan steps
kontinue plan update ...             Update plan status or goal
kontinue plan delete <title>         Delete a plan

kontinue decision <summary>          Log a decision (-r rationale, -a alternatives,
                                     -c context, -f files, -t tags)
kontinue note <content>              Add a free-form observation/note

kontinue signal <content>            Send a signal to the active agent
                                     (--type message|priority|abort|answer)
                                     (--question <partial> for --type answer)

kontinue auth login                  Authenticate via browser login
kontinue auth create                 Create a project-scoped API key
kontinue auth status                 Show current auth status
kontinue auth list                   List your API keys
kontinue auth revoke <id>            Revoke an API key
kontinue auth rotate                 Revoke + create new key

kontinue doctor                      Audit memory quality — missing rationale, handoffs
kontinue mcp [--project <path>]      Start MCP server (local mode)
kontinue mcp --backend=remote        Start MCP server (remote mode, reads config from .kontinuerc.json)
kontinue export                      Export decisions, tasks, handoffs, observations
```

---

## Architecture

### Local mode
SQLite + markdown files. The MCP server reads/writes directly. Zero dependencies beyond Node.js.

### Remote mode
- **.NET Aspire** orchestrates the backend (API, Worker, MigrationService)
- **PostgreSQL** for structured data (tasks, decisions, sessions, plans, observations, signals)
- **Qdrant** for vector embeddings and hybrid search (semantic + keyword via tsvector)
- **WebSocket** for real-time event streaming to the dashboard
- **Token-based auth** — session tokens (`kns_*`) for user access, API keys (`knt_*`) for project-scoped MCP/automation access, with middleware-enforced workspace membership checks

The CLI's `--backend=remote` flag routes all MCP tool calls through the `.NET API` instead of local SQLite. Configuration is stored in `.kontinuerc.json`.

### Why dual-write? (local mode)

The SQLite DB enables fast, structured queries. The `.kontinue/` markdown files give you a human-readable audit trail you can browse in Obsidian, commit to git, or diff in code review. Neither replaces the other.

---

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free for personal and internal use; commercial use (selling, embedding in paid products, SaaS) is not permitted.
