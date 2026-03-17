# Persistent Memory Layer for AI Coding Agents — Project Proposal

**Date:** March 17, 2026  
**Status:** Draft / Brainstorm

---

## 1. The Problem

Modern AI coding agents — Claude Code, GitHub Copilot, Cursor, etc. — are powerful but fundamentally amnesiac. Every new chat is a blank slate. Every context overflow throws away progress. Every session boundary is a hard reset.

The developer experience today looks like this:

- Developer starts vibecoding a new feature or bug fix.
- AI agent does great work in the session.
- Context window fills up, or the developer closes the chat.
- Next session: the agent has no idea what was being built, what decisions were made, what was tried and failed, or what step comes next.
- Developer must re-explain everything, paste in code snippets, and re-establish context from scratch — every single time.

### What's Wrong With the Current Workarounds

| Workaround | Why It Falls Short |
|---|---|
| Scrolling/reviewing chat history | Manual, time-consuming, doesn't scale |
| Copy-pasting context at session start | Error-prone, incomplete, cognitive overhead on developer |
| Chat checkpoints / forks | Chat is still the source of truth — brittle |
| Custom instructions / system prompts | Static, not project-specific, not updated automatically |
| `AGENTS.md` / `copilot-instructions.md` files | Manual, not structured, not machine-queryable |

**The root cause:** Chat is treated as both the interaction gate AND the source of truth. It should only be the former.

---

## 2. The Vision

> **Memory is infrastructure, not a feature. It should live at the project level, not the conversation level.**

AI agents need a persistent, structured, queryable memory layer that:

- Survives across sessions, context resets, and tool switches.
- Is maintained automatically by the agent during work.
- Can be injected selectively into a new session's context.
- Tracks not just *what* was built but *why*, *what was tried*, and *what comes next*.
- Works with existing agents — not replacing them, augmenting them.

---

## 3. Project Name (Candidates)

| Name | Notes |
|---|---|
| **Kontinue** | Continuity across sessions — memorable, domain-relevant |
| **Recall** | Simple, intuitive |
| **Engram** | Biological memory trace — technical/branded feel |
| **AgentMind** | Descriptive |
| **Nexus** | The connective layer between sessions |

> **Recommendation:** `Kontinue` — it communicates the core value proposition immediately.

---

## 4. MVP Scope

### 4.1 What We Are NOT Building

- A new AI model or agent from scratch.
- A new IDE or code editor.
- A replacement for Claude Code or GitHub Copilot.

### 4.2 What We ARE Building

A **memory and execution-tracing layer** that plugs into existing AI coding agents, giving them:

1. **Persistent project memory** — structured facts about the codebase, architecture decisions, in-progress tasks.
2. **Session handoff notes** — auto-generated summaries written by the agent at the end of a session, injected at the start of the next.
3. **Task graph** — a live, machine-readable plan: what needs doing, what's in progress, what's done, what was abandoned and why.
4. **Decision log** — a time-stamped record of key choices: tech chosen, approaches tried, bugs hit, solutions found.
5. **Semantic search** — query memory across sessions ("what did we decide about auth?", "why did we abandon the Redis approach?").

### 4.3 Integration Targets (MVP)

| Agent | Integration Mechanism |
|---|---|
| **Claude Code** | MCP (Model Context Protocol) server + hooks |
| **GitHub Copilot** | VS Code Extension + custom instruction injection |

Both are achievable without forking or modifying the underlying agents.

---

## 5. Architecture

### 5.1 High-Level Overview

```
┌──────────────────────────────────────────────────────┐
│             Developer (via chat / terminal)          │
└──────────────────────┬───────────────────────────────┘
                       │
          ┌────────────▼────────────┐
          │   AI Agent              │
          │  (Claude Code / Copilot)│
          └────────────┬────────────┘
                       │  MCP tools / VS Code extension hooks
          ┌────────────▼────────────┐
          │   Kontinue Memory Layer │  ← THIS IS WHAT WE BUILD
          │                         │
          │  • read_memory()        │
          │  • write_memory()       │
          │  • update_task()        │
          │  • log_decision()       │
          │  • search_memory()      │
          │  • generate_handoff()   │
          └────────────┬────────────┘
                       │
          ┌────────────▼────────────┐
          │       Storage           │
          │  Local:  SQLite + MD    │
          │  Cloud:  PostgreSQL     │
          │          + pgvector     │
          └─────────────────────────┘
```

### 5.2 Memory Taxonomy

Every write operation is a **dual write**: SQLite row (machine-queryable, embedding-indexed) + `.md` file (human-readable, Obsidian-browsable, git-committable). The `.md` files are the source of truth developers can read and edit directly; SQLite is the index layer on top.

```
.kontinue/                          ← lives in the project root
├── identity.md                     # Project name, purpose, tech stack, conventions
├── architecture/
│   └── YYYY-MM-DD-<slug>.md        # One ADR per decision (auto-generated)
├── tasks/
│   ├── todo.md                     # Live task list (updated in-place)
│   └── done.md                     # Completed / abandoned tasks log
├── decisions/
│   └── YYYY-MM-DD-<slug>.md        # Decision record: summary, rationale, alternatives
├── sessions/
│   └── YYYY-MM-DD-HH-MM.md        # Handoff note per session
├── notes/
│   └── YYYY-MM-DD-<slug>.md        # Free-form notes and observations
├── entities/                       # Key files, modules, APIs, data models
│   └── <name>.md
└── kontinue.db                     # SQLite index + embeddings (do not edit directly)
```

**What each MCP write tool produces:**

| Tool | SQLite row | Markdown file written |
|---|---|---|
| `kontinue_log_decision` | `decisions` table | `decisions/YYYY-MM-DD-<slug>.md` |
| `kontinue_write_handoff` | `sessions` table (ended_at + handoff_note) | `sessions/YYYY-MM-DD-HH-MM.md` |
| `kontinue_update_task` | `tasks` table | updates `tasks/todo.md` in-place |
| `kontinue_flag_blocker` | `sessions` table (blockers field) | appended to current session `.md` |
| `kontinue_read_entity` | — (read only) | — |
| `kontinue_search_memory` | — (read only) | — |
| `kontinue_read_context` | — (read only) | — |

### 5.3 Session Lifecycle

```
Session Start
  └─▶ Kontinue injects: project identity + open tasks + last handoff note
      └─▶ Agent reads: "Here's where we left off and what's next"

During Session
  └─▶ Agent calls memory tools: update task states, log decisions, note findings

Session End (manually or on context pressure)
  └─▶ Agent generates handoff note: summary of progress, blockers, next steps
      └─▶ Stored in sessions/ for next session pickup
```

---

## 6. Tech Stack

### 6.1 CLI (Phase 1 — MVP)

| Layer | Choice | Rationale |
|---|---|---|
| **Language** | TypeScript (Node.js) | Cross-platform, great ecosystem for CLI tools, native VS Code extension language, npm distribution |
| **CLI framework** | [Commander.js](https://github.com/tj/commander.js) or [Oclif](https://oclif.io/) | Oclif is better for multi-command CLIs with plugin support — future-proof |
| **Local storage** | SQLite via `better-sqlite3` | Zero-infra local persistence, fast, reliable |
| **Markdown files** | `.md` files alongside SQLite | Human-readable, git-committable memory — developers can read/edit memory directly |
| **MCP server** | `@modelcontextprotocol/sdk` | First-class Claude Code integration |
| **VS Code Extension** | VS Code Extension API (TypeScript) | GitHub Copilot integration |
| **Semantic search (local)** | `@xenova/transformers` (ONNX, runs locally) | No API key required for local embeddings |
| **Config** | `cosmiconfig` | Standard project-level config discovery |

### 6.2 Backend Server (Phase 2 — Product)

| Layer | Choice | Rationale |
|---|---|---|
| **Language / Runtime** | .NET 10 (C#) | Excellent performance, great ecosystem for SaaS backends, team experience |
| **API** | ASP.NET Core (minimal APIs) | Lightweight, fast, OpenAPI support built-in |
| **Database** | PostgreSQL | Reliable, supports `pgvector` for semantic search |
| **Vector search** | pgvector extension | Keeps vectors and relational data in same DB — operational simplicity |
| **Auth** | ASP.NET Core Identity + JWT | Industry standard |
| **Messaging/jobs** | Hangfire or .NET Channels | Background summarization, indexing jobs |
| **Deployment** | Docker / containers | Cloud-agnostic |

### 6.3 UI Frameworks

#### VS Code Extension Sidebar (Phase 2)

| Layer | Choice | Rationale |
|---|---|---|
| **UI framework** | React 18 + Vite | Standard for VS Code webview panels; fast HMR, great ecosystem |
| **Styling** | Tailwind CSS + VS Code CSS variables | Respects user's VS Code theme (light/dark/high-contrast) automatically |
| **Component library** | [shadcn/ui](https://ui.shadcn.com/) (headless, copy-paste) | No runtime dependency, Tailwind-native, fully customizable |
| **State management** | Zustand | Lightweight, no boilerplate — fits the constrained webview environment |
| **Webview ↔ Extension messaging** | VS Code `postMessage` API (typed with Zod) | Only available IPC in webview context |

The extension sidebar surfaces: current task list, last handoff note, decision log timeline, and a search input — all read from the local memory store via the extension's Node.js backend, not the webview.

#### Web Dashboard (Phase 3 — SaaS)

| Layer | Choice | Rationale |
|---|---|---|
| **Framework** | Next.js 15 (App Router) | SSR + static export, great DX, pairs well with .NET API backend |
| **Styling** | Tailwind CSS | Consistent with extension, fast iteration |
| **Component library** | shadcn/ui | Shared design language with VS Code extension |
| **Data fetching** | TanStack Query (React Query) | Server state, caching, background refresh |
| **Charts / analytics** | Recharts or Tremor | Task velocity, session frequency, decision heatmaps |
| **Auth UI** | NextAuth.js or Clerk | Delegates to .NET 10 backend JWT endpoints |

#### Desktop App (Optional — Phase 4)

If a standalone desktop app is warranted (e.g., for teams not using VS Code):

| Option | Stack | Trade-off |
|---|---|---|
| **Preferred** | Tauri 2 (Rust shell + React webview) | Much smaller binary than Electron, better performance, same web UI reused |
| **Fallback** | Electron | Familiar but heavy (~150 MB); use only if Tauri proves limiting |

### 6.4 Shared / Protocol

- **Memory format**: JSON + Markdown hybrid (machine-writable, human-readable)
- **MCP**: Used as the primary tool protocol for Claude Code integration
- **REST API**: CLI → Backend communication in Phase 2
- **Local-first**: Phase 1 is entirely local, no server required
- **Design system**: Shared Tailwind config + shadcn/ui tokens across VS Code extension, web dashboard, and any desktop app

---

## 7. Integration Details

### 7.1 Claude Code Integration (MCP Server)

Claude Code supports MCP servers natively. Kontinue runs as a local MCP server, exposing tools the agent calls automatically during a session:

```typescript
// Example MCP tools exposed by Kontinue
tools: [
  // ── Read tools (inject memory into agent context) ──────────────────
  "kontinue_read_context",      // Returns project identity + open tasks + last handoff note as text
  "kontinue_read_entity",       // Returns the .md content for a named file, module, or concept
  "kontinue_search_memory",     // Semantic search → returns top-k .md chunks as text

  // ── Write tools (dual-write: SQLite row + .md file) ────────────────
  "kontinue_update_task",       // Updates tasks table + rewrites tasks/todo.md in-place
  "kontinue_log_decision",      // Inserts decisions row + writes decisions/YYYY-MM-DD-<slug>.md
  "kontinue_write_handoff",     // Closes session row + writes sessions/YYYY-MM-DD-HH-MM.md
  "kontinue_flag_blocker",      // Updates session.blockers + appends to session .md
]
```

**Why dual-write matters:** The `.md` files mean developers (and Obsidian) can read, search, and even edit memory without any tools. SQLite is the fast query/embedding index on top — not the only copy. If the DB is deleted, memory can be re-indexed from the `.md` files.

Claude Code picks these up from `.claude/mcp.json` in the project root — no code changes to the agent needed.

### 7.2 GitHub Copilot Integration (VS Code Extension)

GitHub Copilot reads from `.github/copilot-instructions.md` and `.instructions.md` / `.prompt.md` files. Kontinue's VS Code extension:

1. Maintains a dynamically-updated `copilot-instructions.md` injected with current task context and last handoff.
2. Exposes VS Code commands: `Kontinue: Start Session`, `Kontinue: End Session`, `Kontinue: Show Memory`.
3. Hooks into chat participants API (`@kontinue`) if available.
4. Injects `#file:` references for entities relevant to the current task.

---

## 8. Developer Workflow (Target UX)

```bash
# Initialize memory for a project
kontinue init

# Start a session — prints context summary, injects into agent
kontinue start

# During work — agent calls memory tools automatically via MCP
# Developer can also call these manually:
kontinue task add "Implement OAuth refresh token rotation"
kontinue task done "Fix null pointer in auth middleware"
kontinue decision "Chose PKCE over client_secret — public clients can't secure secrets"
kontinue note "Redis connection pooling was causing timeouts under load — switched to single connection + retry"

# End session — generates handoff note
kontinue end

# Search memory across all sessions
kontinue search "why did we drop Redis"
kontinue search "what's the status of the auth feature"

# View current state
kontinue status
kontinue tasks
kontinue log
```

### How `kontinue search` Works

There are two distinct search contexts — **in-session** and **standalone CLI** — and neither blindly calls an LLM on behalf of the user.

**In-session (via MCP tool call):**

```
 Developer asks agent: "why did we drop Redis?"
     └─▶ Agent calls kontinue_search_memory({ query: "Redis abandonment reason" })
         └─▶ Kontinue: embed query → cosine similarity over memory store → return top-k chunks
             └─▶ Chunks land in agent's context window
                 └─▶ Agent synthesizes the answer itself — no extra LLM call from Kontinue
```

The agent is already in context; Kontinue just provides the relevant memory chunks as tool output. The model does the synthesis from what it already received.

**Standalone CLI (out of session):**

```
 $ kontinue search "why did we drop Redis"
     └─▶ Embed query using local ONNX model (no API key)
         └─▶ Cosine similarity over SQLite-stored embeddings
             └─▶ Print top-k matching memory chunks with source + timestamp
```

This is **pure vector search** — fast, local, offline-capable. The developer reads the results themselves.

**Optional RAG mode (Phase 2, explicit opt-in):**

```bash
kontinue search "why did we drop Redis" --synthesize
```

If the user has an API key configured, Kontinue calls the LLM with the top-k chunks and the query, and prints a synthesized answer. This is never the default — the user must explicitly opt in.

---

## 9. Licensing Strategy

### 9.1 Goals

- Make the code open and inspectable (build trust, attract contributors).
- Prevent third parties from embedding it in commercial products or selling hosted versions.
- Reserve commercialization rights for yourself.

### 9.2 Recommendation: Business Source License (BUSL 1.1)

The **Business Source License** (used by HashiCorp/Terraform, MariaDB, Sentry) is the best fit:

- Source code is fully public and readable.
- Free for non-production and non-commercial use.
- **Commercial use requires a paid license** (defined by you).
- Includes a **Change Date** (e.g., 4 years) after which the code converts to a permissive license (Apache 2.0), which also builds long-term goodwill.

Alternatively, consider **Elastic License 2.0 (ELv2)** — simpler, two-clause:
1. You may use, copy, distribute, and make derivative works for any purpose **except** offering the software as a managed service / SaaS.
2. You may not alter or remove license notices.

| License | Pros | Cons |
|---|---|---|
| **BUSL 1.1** | Well-understood, time-limited restriction, large precedent | Slightly complex definition of "production use" |
| **ELv2** | Simple, clear, battle-tested (Elastic, Grafana) | No auto-conversion to open source |
| **Commons Clause + MIT** | Familiar MIT base | Legal grey areas, less precedent |
| **AGPL + CLA** | OSI-approved, copyleft forces contribution | Complex CLA management, AGPL misunderstood |

> **Recommendation:** Start with **Elastic License 2.0** for simplicity. Switch to **BUSL 1.1** when you launch the commercial product. Include a **Contributor License Agreement (CLA)** from day one so you can relicense without hunting down contributors.

### 9.3 What "Commercial Use" Means in Practice

- ✅ **Allowed free:** Individual developers, open source projects, internal company tooling (non-redistributed).
- ❌ **Requires license:** Embedding in a product sold to customers, offering as a hosted/managed service, redistributing as part of a commercial offering.

---

## 10. Phased Roadmap

### Phase 1 — CLI + MCP (MVP, Open Source)
- [ ] `kontinue init` — initialize memory store in project
- [ ] Local SQLite + markdown storage
- [ ] MCP server for Claude Code
- [ ] Core memory tools: read context, update task, log decision, write handoff
- [ ] `kontinue start` / `kontinue end` commands
- [ ] Basic semantic search (local embeddings)
- [ ] VS Code extension alpha (Copilot instruction injection)

### Phase 2 — VS Code Extension + Team Sync
- [ ] Full VS Code extension with UI sidebar
- [ ] GitHub Copilot chat participant integration
- [ ] Git-based memory sync (memory lives in repo, optionally committed)
- [ ] Team-shared memory (same project, multiple developers)

### Phase 3 — SaaS Backend (.NET 10)
- [ ] Cloud memory storage (PostgreSQL + pgvector)
- [ ] Multi-project dashboard
- [ ] Team workspace management
- [ ] Analytics: session health, task velocity, decision frequency
- [ ] REST API for third-party integrations
- [ ] Billing and license management

### Phase 4 — Platform
- [ ] Plugin SDK (let other tools write to Kontinue memory)
- [ ] Integrations: Linear, GitHub Issues, Jira (two-way task sync)
- [ ] Agent SDK for custom agents to adopt the protocol
- [ ] Memory export / audit log

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| AI agents change their extension APIs | Abstract integration layer — swap adapters without changing core |
| MCP protocol is still evolving | Version-lock, follow Anthropic's changelog closely |
| Developers don't want another CLI tool | VS Code extension as primary UX; CLI is power-user / CI option |
| Memory grows stale / incorrect | Add `last_verified` timestamps; allow agents to flag stale memory; periodic review prompts |
| Competitors (Anthropic, GitHub) build this natively | Focus on multi-agent, cross-tool, local-first story — native solutions will be siloed |
| Licensing confusion | Clear documentation, simple two-clause license, FAQ on website |

---

## 12. Open Questions

- [ ] Should memory be git-committed by default (makes it portable but pollutes history) or stored separately (`.kontinue/` in `.gitignore`)?
- [ ] What's the right granularity for "project" — monorepo? repo? feature branch?
- [ ] Should the agent auto-call memory tools, or should the developer trigger them manually?
- [ ] How do we handle conflicting memory written by two developers working in parallel?
- [ ] Pricing model: per-seat SaaS? Per-project? Usage-based?

---

## 13. Competitive Landscape

| Tool | What it does | Gap |
|---|---|---|
| **Mem0** | AI memory for agents (API) | Not coding-specific, not local-first |
| **Graphiti** | Temporal knowledge graph for AI | Complex infra, not developer-facing |
| **OpenMemory MCP** | Personal memory MCP server | General purpose, no task/decision structure |
| **Cursor** (background context) | Indexes codebase for search | No persistent session memory, no task tracking |
| **Copilot memory files** | `copilot-instructions.md` | Manual, static, not machine-maintained |
| **Obsidian** | Local-first markdown knowledge base (personal second brain) | Not agent-facing, not auto-maintained, no task/session concept |

**The gap:** No tool exists that provides structured, automatically-maintained, session-persistent memory specifically for AI coding agents, with multi-agent support and a local-first model.

### Obsidian as an Analogy (and Optional Integration)

Obsidian's vault model — a local folder of interlinked `.md` files — is conceptually close to what Kontinue's human-readable memory layer looks like on disk. Developers who already use Obsidian for notes could point it at `.kontinue/` and browse/edit memory visually with zero extra tooling. This is a free integration worth advertising, not something to build.

---

## 14. UI Designs (Wireframes)

### 14.1 VS Code Extension — Sidebar Panel

```
┌─────────────────────────────────────┐
│  KONTINUE                      ⚙ ↺  │
│─────────────────────────────────────│
│  📁 my-saas-app                     │
│─────────────────────────────────────│
│  SESSION                            │
│  ● Active · Started 14m ago         │
│  Last: "Wiring up OAuth refresh     │
│         token rotation"             │
│                            [End]    │
│─────────────────────────────────────│
│  TASKS                    [+ Add]   │
│                                     │
│  ▶ IN PROGRESS                      │
│    ◉ OAuth refresh token rotation   │
│    ◉ Fix null ref in auth middleware │
│                                     │
│  ▶ UP NEXT                          │
│    ○ Add rate limiting to /api/auth  │
│    ○ Write integration tests         │
│                                     │
│  ▶ DONE  (12)              [Show]   │
│─────────────────────────────────────│
│  LAST HANDOFF  · Mar 16, 11:42 PM   │
│  ┌───────────────────────────────┐  │
│  │ Completed: PKCE flow. Blocked │  │
│  │ on refresh token expiry edge  │  │
│  │ case. Next: handle 401 retry  │  │
│  │ loop in interceptor.          │  │
│  └───────────────────────────────┘  │
│─────────────────────────────────────│
│  DECISIONS                  [View]  │
│  🔵 Mar 16  PKCE over client_secret │
│  🔵 Mar 14  Dropped Redis pooling   │
│  🔵 Mar 12  Chose Postgres+pgvector │
│─────────────────────────────────────│
│  🔍 Search memory...                │
└─────────────────────────────────────┘
```

---

### 14.2 VS Code Extension — Search Results Panel

```
┌─────────────────────────────────────────┐
│  🔍 "why did we drop Redis"        ✕    │
│─────────────────────────────────────────│
│  3 results · searched 847 memory chunks │
│─────────────────────────────────────────│
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🗒 DECISION · Mar 14, 3:18 PM  │    │
│  │ Redis connection pooling caused │    │
│  │ timeouts under load (>200 rps). │    │
│  │ Switched to single conn + retry │    │
│  │ with exponential backoff.       │    │
│  │                    [Open entry] │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 📋 SESSION · Mar 14 handoff    │    │
│  │ "...dropped Redis. See decision │    │
│  │ log. Next session: validate     │    │
│  │ single-conn approach under load"│    │
│  │                    [Open entry] │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🏗 ARCHITECTURE · Mar 13       │    │
│  │ Caching layer: considered Redis,│    │
│  │ Memcached, in-process. Chose    │    │
│  │ in-process for MVP simplicity.  │    │
│  │                    [Open entry] │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

---

### 14.3 CLI Output — `kontinue start`

```
$ kontinue start

  ╔══════════════════════════════════════════════╗
  ║  KONTINUE · my-saas-app                      ║
  ║  Session started · Mar 17, 2026 · 9:04 AM    ║
  ╚══════════════════════════════════════════════╝

  📋 LAST HANDOFF  (Mar 16 · 11:42 PM)
  ─────────────────────────────────────
  Completed PKCE implementation. Blocked on refresh token
  expiry edge case — 401 retry loop in the HTTP interceptor
  causes infinite loop when refresh token itself is expired.
  Next: detect expired refresh token before retry attempt.

  ✅ IN PROGRESS
  ─────────────
  ◉ OAuth refresh token rotation
  ◉ Fix null ref in auth middleware

  📌 UP NEXT
  ──────────
  ○ Add rate limiting to /api/auth
  ○ Write integration tests for auth flow

  🔵 RECENT DECISIONS
  ───────────────────
  Mar 16  PKCE over client_secret for public clients
  Mar 14  Dropped Redis — timeout issues, switched to single-conn

  ─────────────────────────────────────────────────
  Memory: 847 chunks · 3 sessions · 12 decisions
  MCP server: running on :3742
  ─────────────────────────────────────────────────
```

---

### 14.4 CLI Output — `kontinue end`

```
$ kontinue end

  Wrapping up session (47 min) ...

  What was accomplished? (blank = auto-summarize from memory)
  > Solved the 401 retry loop — detect expired refresh token
    via exp claim before attempting refresh. Also fixed null
    ref in auth middleware (missing guard on req.user).

  Blockers for next session? (blank = none)
  > Rate limiting middleware needs to run before auth —
    current middleware order causes 429s to bypass logging.

  ✔  Handoff note saved
  ✔  2 tasks marked done
  ✔  1 blocker flagged
  ✔  Memory indexed (6 new chunks)

  ╔══════════════════════════════════════════════╗
  ║  See you next session. Memory saved.         ║
  ╚══════════════════════════════════════════════╝
```

---

### 14.5 Web Dashboard — Project Overview (Phase 3)

```
┌────────────────────────────────────────────────────────────────────┐
│  Kontinue                              🔔  Muhammad ▾    [+ New]  │
├──────────┬─────────────────────────────────────────────────────────┤
│          │  my-saas-app                                 [Settings] │
│ Projects │──────────────────────────────────────────────────────── │
│          │                                                          │
│ ▶ my-    │  ACTIVE SESSION                                          │
│   saas-  │  ┌───────────────────────────────────────────────────┐  │
│   app    │  │  ● Muhammad · Started 14m ago · VS Code           │  │
│          │  │  Working on: OAuth refresh token rotation         │  │
│ ○ api-   │  └───────────────────────────────────────────────────┘  │
│   gateway│                                                          │
│          │  TASK BOARD                                              │
│ ○ mobile │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│   app    │  │  TODO (3)   │ │IN PROGRESS  │ │  DONE (12)  │       │
│          │  │─────────────│ │─────────────│ │─────────────│       │
│          │  │○ Rate limit │ │◉ OAuth      │ │✓ PKCE impl  │       │
│          │  │  /api/auth  │ │  refresh    │ │✓ DB schema  │       │
│          │  │○ Int. tests │ │  rotation   │ │✓ User model │       │
│          │  │○ Staging    │ │◉ Null ref   │ │  ...        │       │
│          │  │  deploy     │ │  auth mdlwr │ │             │       │
│          │  └─────────────┘ └─────────────┘ └─────────────┘       │
│          │                                                          │
│          │  SESSION ACTIVITY  (last 7 days)                        │
│          │  ┌───────────────────────────────────────────────────┐  │
│          │  │  Mon  Tue  Wed  Thu  Fri  Sat  Sun                │  │
│          │  │  ███  ███  ░░░  ███  ███  ██░  ░░░                │  │
│          │  │  2h   3h   —    4h   2h   1h   —                  │  │
│          │  └───────────────────────────────────────────────────┘  │
│          │                                                          │
│          │  RECENT DECISIONS                                        │
│          │  Mar 16  🔵 PKCE over client_secret                     │
│          │  Mar 14  🔵 Dropped Redis connection pooling            │
│          │  Mar 12  🔵 PostgreSQL + pgvector for memory store      │
│          │                                     [View all 12 →]     │
└──────────┴─────────────────────────────────────────────────────────┘
```

---

### 14.6 Web Dashboard — Decision Log (Phase 3)

```
┌─────────────────────────────────────────────────────────────────┐
│  Decision Log · my-saas-app                   🔍 Search...      │
│─────────────────────────────────────────────────────────────────│
│  Filter: [All ▾]  [All sessions ▾]  [All authors ▾]            │
│─────────────────────────────────────────────────────────────────│
│                                                                  │
│  MAR 16                                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 🔵  PKCE over client_secret for public OAuth clients     │   │
│  │     Public clients can't securely store a secret.        │   │
│  │     PKCE is the RFC 7636 standard for this case.         │   │
│  │     Considered: client_secret, device flow               │   │
│  │     Session: Mar 16 PM · Muhammad                [Edit]  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  MAR 14                                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 🔵  Dropped Redis — timeout issues under load            │   │
│  │     Pooling caused cascading timeouts >200rps.           │   │
│  │     Switched to single-conn + exponential backoff.       │   │
│  │     Considered: Redis cluster, Memcached, in-proc        │   │
│  │     Session: Mar 14 AM · Muhammad                [Edit]  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  MAR 12                                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 🔵  PostgreSQL + pgvector for memory store               │   │
│  │     Keeps vectors + relational data in one system.       │   │
│  │     Avoids Pinecone/Weaviate ops overhead for MVP.       │   │
│  │     Considered: Pinecone, Weaviate, Qdrant               │   │
│  │     Session: Mar 12 PM · Muhammad                [Edit]  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 15. Summary

| Dimension | Decision |
|---|---|
| **What** | Persistent memory + execution tracing layer for AI coding agents |
| **How** | MCP server (Claude Code) + VS Code Extension (Copilot) — no new agent |
| **Phase 1 tech** | TypeScript CLI + MCP + SQLite |
| **Phase 3 tech** | .NET 10 backend + PostgreSQL + pgvector |
| **License** | Elastic License 2.0 → BUSL 1.1 at product launch + CLA |
| **Model** | Open source core, commercial SaaS / enterprise licenses |

---

*This document is a living proposal. Update as the design evolves.*
