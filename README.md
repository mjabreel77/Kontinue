# Kontinue

> Persistent memory and execution-tracing layer for AI coding agents.

AI coding agents are powerful but amnesiac — every new chat is a blank slate. Kontinue gives them structured, queryable, session-spanning memory so they can pick up exactly where they left off — and lets you send them real-time signals mid-session without breaking their flow.

Works with **GitHub Copilot (VS Code)**, **Claude Code**, **Cursor**, and **Windsurf** via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io).

---

## How It Works

Kontinue runs as a local MCP server that your AI agent connects to. During a session, the agent:

1. Calls `kontinue_read_context` at the start → gets branch, last handoff, open tasks, active plans, and recent decisions
2. Logs decisions, tasks, observations, checkpoints, and plans as it works
3. Calls `kontinue_write_handoff` at the end → structured note for the next session

Everything is dual-written: SQLite (queryable, fast) + `.kontinue/*.md` files (human-readable, Obsidian-browsable, git-committable).

```
~/.kontinue/kontinue.db        ← global DB, all projects keyed by path
<project>/.kontinue/
  identity.md                  ← project metadata
  tasks/todo.md                ← live task list
  decisions/YYYY-MM-DD-*.md    ← one file per decision
  sessions/YYYY-MM-DD-HH-MM.md ← session handoffs
  notes/                       ← observations and free-form notes
```

---

## Installation

**Requirements:** Node.js ≥ 20

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
# In your project directory:
kontinue init          # initialize memory, configure your AI agent
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
kontinue web           # open local dashboard in the browser
```

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

The agent calls `kontinue_acknowledge_signal` once it has acted on the signal.

---

## Web Dashboard

```bash
kontinue web           # starts on http://localhost:3131 by default
kontinue web --port 8080
```

The dashboard shows the real-time task board, active plans, pending signals, activity feed, and a signal bar for sending messages to the agent. Auto-refreshes every 10 seconds.

---

## Plans

Plans are multi-step roadmaps that span multiple tasks and context windows. They appear in every `kontinue_read_context` response so any agent (or future session) always knows the larger picture.

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

## MCP Tools (for AI Agents)

The MCP server exposes 17 tools. Agents should call `kontinue_read_context` at the start of every session — the tool descriptions themselves contain the operating instructions.

### Core session tools
| Tool | Purpose |
|---|---|
| `kontinue_read_context` | **Always call first.** Returns branch, last handoff, open tasks, active plans, recent decisions, open questions, and pending signals |
| `kontinue_write_handoff` | End the session with a specific summary + exact next step for the next agent |
| `kontinue_checkpoint` | Mid-session snapshot — concrete state, files active, next step |

### Task management
| Tool | Purpose |
|---|---|
| `kontinue_update_task` | Add / start / done / abandon tasks with `description` (required on add) and `outcome` (required on done) |

### Decisions & observations
| Tool | Purpose |
|---|---|
| `kontinue_log_decision` | Record an architectural decision with `rationale`, `alternatives`, `context`, `files`, `tags` |
| `kontinue_supersede_decision` | Archive an outdated decision and record its replacement |
| `kontinue_add_observation` | Lightweight mid-task finding — constraint, scope clarification, discovery |
| `kontinue_resolve_observation` | Mark an observation addressed once the issue is fixed |

### Plans
| Tool | Purpose |
|---|---|
| `kontinue_update_plan` | Create plans, mark steps done, change plan status |

### Memory & lookup
| Tool | Purpose |
|---|---|
| `kontinue_search_memory` | Keyword search across all sessions, decisions, notes, and handoffs |
| `kontinue_read_decision` | Full decision details (rationale, alternatives, context, files) by keyword |
| `kontinue_read_entity` | Everything known about a named module, file, or concept |

### Questions
| Tool | Purpose |
|---|---|
| `kontinue_ask_question` | Log a question that needs developer input without blocking work |
| `kontinue_answer_question` | Resolve an open question |
| `kontinue_flag_blocker` | Record a hard block that requires external input before proceeding |

### Signals
| Tool | Purpose |
|---|---|
| `kontinue_check_signals` | Explicitly poll for pending developer signals |
| `kontinue_acknowledge_signal` | Confirm the agent has read and acted on signal(s) |

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
kontinue web [--port <n>]            Start local web dashboard

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

kontinue doctor                      Audit memory quality — missing rationale, handoffs
kontinue mcp [--project <path>]      Start MCP server (used by agents, not humans)
```

---

## Why Dual-Write?

The SQLite DB enables fast, structured queries by the MCP server. The `.kontinue/` markdown files give you a human-readable audit trail you can browse in Obsidian, commit to git, or diff in code review.

Neither replaces the other.

---

## License

EL-2.0
