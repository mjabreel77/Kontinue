# Kontinue

> Persistent memory and execution-tracing layer for AI coding agents.

AI coding agents are powerful but amnesiac — every new chat is a blank slate. Kontinue gives them structured, queryable, session-spanning memory so they can pick up exactly where they left off.

Works with **GitHub Copilot (VS Code)**, **Claude Code**, **Cursor**, and **Windsurf** via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io).

---

## How It Works

Kontinue runs as a local MCP server that your AI agent connects to. During a session, the agent:

1. Calls `kontinue_read_context` at the start → gets branch, last handoff, open tasks, and recent decisions
2. Logs decisions, tasks, and observations as it works
3. Calls `kontinue_write_handoff` at the end → structured note for the next session

Everything is dual-written: SQLite (for querying) + `.kontinue/*.md` files (human-readable, Obsidian-browsable).

```
~/.kontinue/kontinue.db        ← global DB, all projects keyed by path
<project>/.kontinue/
  identity.md                  ← project metadata
  tasks/todo.md                ← live task list
  decisions/YYYY-MM-DD-*.md    ← one file per decision
  sessions/YYYY-MM-DD-HH-MM.md ← session handoffs
  notes/                       ← free-form notes and observations
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

# During work (from CLI):
kontinue task add "Implement rate limiting"
kontinue task progress "rate limiting"
kontinue decision "Use token bucket over leaky bucket" -r "More predictable burst behavior"
kontinue note "Redis TTL on the session key is 24h — affects logout behavior"
kontinue task done "rate limiting"

kontinue end           # write handoff for next session

# Review:
kontinue status        # current session, tasks, recent decisions
kontinue log           # full decision log with rationale and context
kontinue search auth   # search all memory for "auth"
```

---

## MCP Tools (for AI Agents)

The MCP server exposes 9 tools that agents use directly:

| Tool | Purpose |
|---|---|
| `kontinue_read_context` | **Always call first.** Returns branch, last handoff, open tasks with descriptions, recent decisions |
| `kontinue_update_task` | Add / start / done / abandon tasks. `add` requires `description`. `done` requires `outcome`. |
| `kontinue_log_decision` | Record an architectural decision. Always include `rationale`, `alternatives`, `context`, `files`, `tags`. |
| `kontinue_add_observation` | Lightweight mid-task finding — constraint discovered, scope clarification, code insight |
| `kontinue_write_handoff` | End the session with a specific summary + next action for the next agent |
| `kontinue_flag_blocker` | Record a block without ending the session |
| `kontinue_search_memory` | Keyword search across all sessions, decisions, notes, handoffs |
| `kontinue_read_decision` | Get full decision details (rationale, alternatives, context, files) by keyword |
| `kontinue_read_entity` | Look up everything known about a named module, file, or concept |

---

## Agent Setup

### VS Code (GitHub Copilot)

`kontinue init` writes `.vscode/mcp.json` and `.github/copilot-instructions.md` automatically.

To configure after the fact:
```bash
kontinue setup
```

Invoke the guided session prompt with: **`@workspace /kontinue`**

### Claude Code

`kontinue init` writes `.mcp.json` and `CLAUDE.md`.

### Cursor

`kontinue init` writes `.cursor/mcp.json` and `.cursor/rules/kontinue.mdc` (with `alwaysApply: true`).

### Windsurf

`kontinue init` writes `.windsurf/mcp.json` and `.windsurfrules`.

---

## CLI Reference

```
kontinue init [--force]         Initialize (--force resets existing project)
kontinue setup                  Re-configure agent MCP + instruction files
kontinue start                  Start a session
kontinue end                    End session + write handoff
kontinue status                 Current session, tasks, decisions
kontinue log                    Full decision log
kontinue search <query>         Search all memory
kontinue task add <title>       Add a task
kontinue task progress <title>  Mark in-progress
kontinue task done <title>      Mark done
kontinue task abandon <title>   Mark abandoned
kontinue decision <summary>     Log a decision (-r rationale, -a alternatives,
                                -c context, -f files, -t tags)
kontinue note <content>         Add a free-form note
kontinue mcp [--project <path>] Start MCP server (used by agents, not humans)
```

---

## Why Dual-Write?

The SQLite DB enables fast search and structured queries by the MCP server. The `.kontinue/` markdown files give you a human-readable audit trail you can browse in Obsidian, commit to git, or diff in code review.

Neither replaces the other.

---

## License

EL-2.0
