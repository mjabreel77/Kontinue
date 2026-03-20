# Kontinue Project Handoff — Fresh Start

> **Date:** March 19, 2026
> **Branch:** `feat/dotnet-backend`
> **Last commit:** `d44eeffc`
> **Status:** Steps 1–11 of 15 complete on .NET backend migration. Dashboard functional but needs live event wiring.

---

## Architecture Overview

### Solution Structure
```
server/                         — .NET Aspire solution
  src/
    Kontinue.AppHost/           — Aspire orchestrator (Postgres, Qdrant, Api, Worker, Dashboard)
    Kontinue.Api/               — ASP.NET Core REST API + WebSocket server
    Kontinue.Worker/            — Background service (embedding pipeline, decay jobs)
    Kontinue.Shared/            — Domain entities, EF Core DbContext, Protocol types
    Kontinue.ServiceDefaults/   — Aspire service defaults (OpenTelemetry, health checks)
    Kontinue.MigrationService/  — EF Core migration runner (Aspire WaitFor pattern)

cli/                            — Node.js CLI (oclif) — local SQLite + MCP proxy modes
  src/
    commands/                   — CLI commands (mcp, sync, status, etc.)
    mcp/
      server.ts                 — Local MCP server (writes to SQLite)
      proxy-server.ts           — Proxy MCP server (routes to .NET API via HTTP)
      api-client.ts             — HTTP client for .NET API
    store/                      — SQLite queries, markdown export

dashboard/                      — Vite + React + TypeScript frontend
  src/
    lib/api.ts                  — WebSocket client + REST mutations
    types.ts                    — Dashboard types (camelCase, string GUIDs)
    pages/                      — Overview, Board, Decisions, Observations, Signals, Plans
    components/                 — Layout, SignalWidget, ThemeProvider
```

### Infrastructure
- **Database:** PostgreSQL (via Aspire, persistent container)
- **Vector store:** Qdrant (via Aspire, persistent container)
- **API ports:** `http://localhost:5152` (pinned in launchSettings), `https://localhost:7204`
- **Dashboard:** Vite dev server (Aspire-managed via `AddViteApp().WithNpm()`)
- **MCP config:** `.vscode/mcp.json` — proxy mode pointing at `http://localhost:5152`

---

## Key Architectural Decisions

### .NET Backend
1. **Guid primary keys** across all domain entities (not int)
2. **Static `IEndpointRouteBuilder` extension methods** for minimal API endpoint organization
3. **Dedicated MigrationService project** with Aspire `WaitFor` (not inline in Api/Worker)
4. **EF Core with PostgreSQL** — multi-tenant schema: Workspace → Project → all entities
5. **`JsonConfig.Options`** — shared `JsonSerializerOptions` with camelCase, `JsonStringEnumConverter(CamelCase)`, `ReferenceHandler.IgnoreCycles`, ignore nulls
6. **`[JsonIgnore]`** on all back-reference navigation properties to prevent serialization cycles

### WebSocket / Real-time
7. **Raw WebSockets** with Channels, ArrayPool, and STJ (not SignalR)
8. **Bounded `Channel<T>`** per connection with `DropOldest` policy for backpressure
9. **Granular patch events** over WebSocket (not full-state on every change)
10. **`[JsonPolymorphic]` + `[JsonDerivedType]`** with `$type` discriminator for wire protocol
11. **`StateFullEvent`** sent on connect/subscribe — full state dump for initial render

### MCP Integration
12. **MCP proxy** as separate file (`proxy-server.ts`) — not shared abstraction with local server
13. **Two modes:** `--backend=local` (SQLite, default) and `--backend=remote` (HTTP → .NET API)
14. **Proxy routes all tool calls** through `KontinueApiClient` → REST endpoints → WebSocket events → dashboard

### Search
15. **Hybrid search:** Qdrant vector similarity + PostgreSQL `tsvector` keyword matching
16. **Reciprocal Rank Fusion (k=60)** for merging vector and keyword results

### Observability
17. **`System.Diagnostics` Activities** and custom Meters (not third-party APM)
18. **`LoggerMessage` source-generated** extension methods on `ILogger`

### Dashboard
19. **Dashboard connects via WebSocket** to `.NET API`, builds `DashboardData` from `StateFullEvent` client-side
20. **camelCase JSON** + string enum serialization throughout
21. **`VITE_API_URL`** env var set by Aspire for dashboard, `--api-url` CLI arg for MCP proxy

---

## Current State (Steps 1–11 of 15 Complete)

### Completed Steps
1. ✅ **Scaffold Aspire solution** — AppHost, Api, Worker, Shared, ServiceDefaults, MigrationService
2. ✅ **Domain model + EF Core** — All entities ported: Workspace, Project, Session, AgentTask, TaskItem, TaskDependency, ExternalLink, Decision, Observation, Signal, Plan, PlanStep, Question, Checkpoint, Handoff, MemoryChunk, TaskTemplate, User, WorkspaceMember
3. ✅ **Core REST API** — 12 endpoint files: Task, Decision, Observation, Signal, Plan, Question, Session, Checkpoint, Handoff, Memory, Workspace, Project
4. ✅ **Worker embedding pipeline** — Background service for Qdrant upserts + decay
5. ✅ **WebSocket infrastructure** — ConnectionManager, ClientConnection with ArrayPool + Channels
6. ✅ **Wire protocol** — All event types defined with JsonPolymorphism
7. ✅ **WebSocket + API integration** — Endpoints publish events, state.full on connect
8. ✅ **MCP HTTP proxy** — `proxy-server.ts` + `api-client.ts`
9. ✅ **Hybrid search** — Qdrant + tsvector with RRF merging
10. ✅ **Data sync** — `kontinue sync` command (SQLite → API)
11. ✅ **Dashboard workspace routing** — ProjectSelector, workspace/project selection, Switch Project

### Remaining Steps (12–15)
12. ⬜ **Replace SSE with WebSocket client** — `useKontinueSocket` hook with granular event patching (currently dashboard re-subscribes for full state on any event)
13. ⬜ **Multi-project overview** — Cross-project activity feed + aggregate metrics
14. ⬜ **Auth layer** — API key for MCP proxy + session-based auth for dashboard
15. ⬜ **Deprecate embedded web server** — `kontinue web` redirects to dashboard URL

---

## Recent Fixes Applied This Session

1. **JSON serialization cycle** — `Task.Items → TaskItem.Task → ...` infinite loop. Fixed with `[JsonIgnore]` on all back-reference nav props + `ReferenceHandler.IgnoreCycles`
2. **WebSocket disconnect crash** — `WebSocketException` when client closes without handshake. Added catch in `ReadLoopAsync` and `RunAsync`
3. **Double-slash URL bug** — `http://localhost:5152//api/workspaces`. Fixed with `stripTrailingSlash()` in `api.ts`
4. **CORS policy** — Changed from `AllowAnyOrigin()` to `SetIsOriginAllowed(_ => true).AllowCredentials()` for WebSocket credential support
5. **Empty workspace handling** — Dashboard showed blank "Select Workspace" when no workspaces exist. Added error message + auto-connect when `VITE_API_URL` is set
6. **CLI rebuild needed** — `kontinue sync` command existed in source but wasn't compiled to `dist/`

---

## Event Publishing Coverage

21 of 36 mutation endpoints publish WebSocket events. Missing publishers (secondary operations):
- Task items: add, toggle, delete
- Task dependencies: add, delete
- Task links: add
- Plan steps: add, delete
- Decision: archive
- Observation: delete
- Memory: decay-exempt toggle, delete
- Session: context-read, tool-call
- Signal: deliver

---

## Feature Backlog (Brainstormed Ideas)

### Session Intelligence
- Session diff summary in `read_context`
- Idle detection — auto-nudge to checkpoint after inactivity
- Session health score in `statusLine`
- ✅ Auto-flag stale in-progress tasks

### Memory & Search
- Semantic/vector search for `search_memory`
- Context compression — auto-summarize old chunks into session digest
- ✅ Cross-project memory for shared patterns
- Memory confidence decay — flag chunks older than N days as stale

### Tasks & Plans
- ✅ Task dependencies (blocks/blocked_by)
- ✅ Task templates — reusable skeletons
- Recurring tasks that auto-reset
- Time tracking — `started_at`/`ended_at` per task

### Signals & Collaboration
- ✅ Two-way signal replies in dashboard
- ✅ Full signal history log
- ✅ GitHub/Linear integration (link-only first)
- Mention detection — auto-link filenames to `read_entity`

### Observability
- ✅ Session timeline
- ✅ Decision graph — supersession lineage
- ✅ Velocity dashboard — tasks/session metrics
- ✅ Replay mode — step through past checkpoints

### Safety & Guardrails
- Confirmation gates — human approval before task done
- Scope lock — off-limits files per session
- Decision audit log export (ADR format)
- Drift detection — warn when work diverges from plan

### Developer Ergonomics
- `kontinue explain <decision-id>` CLI command
- VS Code extension — sidebar with live board
- Git commit hook — auto-checkpoint on commit
- `kontinue diff` — board changes between commits

---

## Files to Know

| File | Purpose |
|------|---------|
| `server/src/Kontinue.AppHost/AppHost.cs` | Aspire orchestration — all services |
| `server/src/Kontinue.Api/Program.cs` | API startup — CORS, JSON options, middleware |
| `server/src/Kontinue.Shared/Protocol/JsonConfig.cs` | Shared JSON serialization options |
| `server/src/Kontinue.Api/WebSockets/EventPublisher.cs` | WebSocket event broadcasting |
| `server/src/Kontinue.Api/WebSockets/ClientConnection.cs` | Per-client WebSocket handler |
| `server/src/Kontinue.Api/WebSockets/ConnectionManager.cs` | Client registry + broadcast |
| `cli/src/mcp/proxy-server.ts` | MCP proxy → HTTP API bridge |
| `cli/src/mcp/api-client.ts` | HTTP client for .NET API |
| `cli/src/commands/mcp.ts` | MCP command — local/remote mode selection |
| `dashboard/src/lib/api.ts` | WebSocket client + state builder |
| `dashboard/src/App.tsx` | ProjectSelector + routing |
| `.vscode/mcp.json` | MCP server config for VS Code |
