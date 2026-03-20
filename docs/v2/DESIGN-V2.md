# Kontinue v2 — Detailed Design

> This document specifies the detailed design for every subsystem of Kontinue v2. It complements [ARCHITECTURE.md](ARCHITECTURE.md) (system overview) and [BRAINSTORM.md](BRAINSTORM.md) (rationale and open questions).

---

## Table of Contents

1. [Agent Loop](#1-agent-loop)
2. [Tool Specifications](#2-tool-specifications)
3. [Subagent Protocol](#3-subagent-protocol)
4. [Session Lifecycle](#4-session-lifecycle)
5. [Context Window Management](#5-context-window-management)
6. [Memory Schema](#6-memory-schema)
7. [Signal System](#7-signal-system)
8. [Chat Protocol](#8-chat-protocol)
9. [Configuration System](#9-configuration-system)
10. [Error Handling](#10-error-handling)
11. [Security Model](#11-security-model)
12. [Extension Points](#12-extension-points)
13. [Collaboration Design](#13-collaboration-design)

---

## 1. Agent Loop

### Core Execution Model

The agent uses a **ReAct loop** (Reason → Act → Observe → Repeat):

```
┌──────────────────────────────────────────────────────────────┐
│                        Agent Loop                             │
│                                                               │
│  ┌──────────┐     ┌─────────┐     ┌──────────┐               │
│  │  Think   │────→│   Act   │────→│ Observe  │──┐            │
│  │ (reason) │     │ (tools) │     │ (result) │  │            │
│  └────▲─────┘     └─────────┘     └──────────┘  │            │
│       │                                          │            │
│       └──────────────────────────────────────────┘            │
│                         │                                     │
│                    [loop until]                                │
│              task complete OR blocked                          │
│              OR budget exhausted                               │
└──────────────────────────────────────────────────────────────┘
```

### Step-by-Step

```typescript
interface AgentStep {
  thought: string;           // LLM reasoning (not shown to user)
  toolCalls: ToolCall[];     // parallel or sequential
  results: ToolResult[];     // from tool executor
  shouldContinue: boolean;   // does the agent need more steps?
  userMessage?: string;      // optional message to show user
}

async function agentLoop(goal: string): Promise<TaskOutcome> {
  const session = await loadOrCreateSession();
  const context = await contextManager.buildContext(session, goal);

  while (true) {
    // 1. Think: send context to LLM, get next action
    const step = await llm.complete(context);

    // 2. Act: execute tool calls
    for (const call of step.toolCalls) {
      const result = await toolExecutor.execute(call);
      contextManager.append(call, result);

      // 3. Budget check after each tool call
      if (contextManager.budgetExceeded()) {
        await compaction.run(session);
      }
    }

    // 4. Workflow rule enforcement
    await workflowEnforcer.check(step, session);

    // 5. Signal check (periodic)
    if (session.stepsSinceSignalCheck > SIGNAL_CHECK_INTERVAL) {
      const signals = await signalManager.check();
      if (signals.length > 0) {
        contextManager.injectSignals(signals);
      }
    }

    // 6. Continue or complete
    if (!step.shouldContinue) {
      return step.outcome;
    }
  }
}
```

### Workflow Enforcer

Automatic enforcement of best practices — not as instructions the LLM might forget, but as runtime rules:

```typescript
interface WorkflowRule {
  name: string;
  condition: (step: AgentStep, session: Session) => boolean;
  action: (step: AgentStep, session: Session) => Promise<void>;
}

const RULES: WorkflowRule[] = [
  {
    name: "checkpoint-interval",
    condition: (_, s) => s.minutesSinceCheckpoint > 15,
    action: async (_, s) => await memory.checkpoint(s),
  },
  {
    name: "plan-before-multistepp",
    condition: (step, s) => step.stepsEstimated >= 3 && !s.activePlan,
    action: async (_, s) => {
      // Inject guidance: "Create a plan before proceeding"
      s.context.inject("SYSTEM: This goal requires 3+ steps. Create a plan.");
    },
  },
  {
    name: "signal-check-between-tasks",
    condition: (step, _) => step.taskJustCompleted,
    action: async (_, s) => await signalManager.check(),
  },
  {
    name: "confirmation-destructive",
    condition: (step, _) => step.toolCalls.some(c => isDestructive(c)),
    action: async (step, s) => {
      const approved = await chat.askUser(
        `Confirm destructive action: ${describeAction(step)}`,
        ["Approve", "Deny"]
      );
      if (!approved) throw new ActionDenied();
    },
  },
  {
    name: "handoff-before-budget-exhaustion",
    condition: (_, s) => s.contextBudgetUsed > 0.85,
    action: async (_, s) => await memory.writeHandoff(s),
  },
];
```

---

## 2. Tool Specifications

### Tool Interface

Every tool implements:

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  category: ToolCategory;
  permissions: ToolPermission[];
  execute(params: unknown, context: ToolContext): Promise<ToolResult>;
}

type ToolCategory =
  | "files"
  | "terminal"
  | "search"
  | "memory"
  | "git"
  | "communication"
  | "signals"
  | "http";

type ToolPermission =
  | "read"      // can read files/data
  | "write"     // can modify files
  | "execute"   // can run processes
  | "network"   // can make HTTP requests
  | "memory"    // can read/write memory
  | "memory_write" // can modify memory state (tasks, plans)
  | "confirm"   // requires user confirmation

interface ToolContext {
  session: Session;
  workspacePath: string;
  contextManager: ContextManager;
  confirmAction: (msg: string) => Promise<boolean>;
}

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  tokensEstimate: number;  // helps context manager
}
```

### File Tools

#### `read_file`

```typescript
{
  name: "read_file",
  parameters: {
    filePath: string,      // absolute or workspace-relative
    startLine?: number,    // 1-based
    endLine?: number,      // 1-based, inclusive
  },
  permissions: ["read"],
}
```

Behavior:
- Returns file contents with line numbers
- Binary files return hex dump or error
- Tracks file in context manager's working set
- Maximum 2000 lines per call (suggest follow-up for large files)

#### `edit_file`

```typescript
{
  name: "edit_file",
  parameters: {
    filePath: string,
    oldString: string,     // exact match, must be unique in file
    newString: string,     // replacement text
  },
  permissions: ["write"],
}
```

Behavior:
- `oldString` must match exactly one location in the file
- Fails if no match or multiple matches (returns error with match count)
- Creates undo record for rollback
- Triggers incremental lint/compile check if LSP available

#### `multi_edit`

```typescript
{
  name: "multi_edit",
  parameters: {
    edits: Array<{
      filePath: string,
      oldString: string,
      newString: string,
    }>,
  },
  permissions: ["write"],
}
```

Behavior:
- Applies edits sequentially
- Fails fast on first error, reports which edits succeeded
- All-or-nothing option for atomic changes

#### `create_file`

```typescript
{
  name: "create_file",
  parameters: {
    filePath: string,
    content: string,
  },
  permissions: ["write"],
}
```

Behavior:
- Fails if file already exists (use `edit_file` instead)
- Creates parent directories as needed
- Adds to git tracking

#### `delete_file`

```typescript
{
  name: "delete_file",
  parameters: {
    filePath: string,
  },
  permissions: ["write", "confirm"],
}
```

Behavior:
- **Always requires user confirmation**
- Creates backup before deletion
- Removes from working file set

### Terminal Tools

#### `run_command`

```typescript
{
  name: "run_command",
  parameters: {
    command: string,
    cwd?: string,          // defaults to workspace root
    timeout?: number,      // ms, default 30000
    env?: Record<string, string>,
  },
  permissions: ["execute"],
}
```

Behavior:
- Runs in persistent shell session (preserves cwd between calls)
- Auto-truncates output > 60KB
- Detects dangerous patterns (rm -rf, git push --force) and requires confirmation
- Captures both stdout and stderr
- Returns exit code

#### `run_background`

```typescript
{
  name: "run_background",
  parameters: {
    command: string,
    cwd?: string,
  },
  permissions: ["execute"],
  returns: { processId: string },
}
```

Behavior:
- Starts process in background, returns immediately
- Useful for dev servers, watchers, builds
- Process tracked by agent, can be queried or killed

#### `get_process_output`

```typescript
{
  name: "get_process_output",
  parameters: {
    processId: string,
  },
  permissions: ["read"],
}
```

#### `kill_process`

```typescript
{
  name: "kill_process",
  parameters: {
    processId: string,
  },
  permissions: ["execute"],
}
```

### Search Tools

#### `grep`

```typescript
{
  name: "grep",
  parameters: {
    query: string,
    isRegexp?: boolean,     // default false
    includePattern?: string, // glob filter
    maxResults?: number,
  },
  permissions: ["read"],
}
```

#### `semantic_search`

```typescript
{
  name: "semantic_search",
  parameters: {
    query: string,
  },
  permissions: ["read"],
}
```

Behavior:
- Converts query to embedding vector
- Searches Qdrant for similar code chunks
- Returns ranked snippets with file paths and line numbers
- Indexes workspace on first run, incrementally updates on file changes

#### `get_errors`

```typescript
{
  name: "get_errors",
  parameters: {
    filePaths?: string[],  // omit for all files
  },
  permissions: ["read"],
}
```

Behavior:
- If connected to LSP: returns real diagnostics
- Fallback: runs language-specific linter (eslint, dotnet build, etc.)

#### `symbol_references`

```typescript
{
  name: "symbol_references",
  parameters: {
    symbol: string,
    filePath?: string,   // scope to file
  },
  permissions: ["read"],
}
```

#### `rename_symbol`

```typescript
{
  name: "rename_symbol",
  parameters: {
    filePath: string,
    position: { line: number, character: number },
    newName: string,
  },
  permissions: ["write"],
}
```

### Memory Tools

All memory tools operate on the local persistence layer (PostgreSQL). No HTTP overhead.

#### `checkpoint`

```typescript
{
  name: "checkpoint",
  parameters: {
    progress: string,        // what was accomplished
    nextStep: string,        // what to do next
    filesActive?: string[],  // files currently being worked on
  },
  permissions: ["memory_write"],
}
```

Behavior:
- Saves a snapshot of session state
- Readable by future sessions and subagents
- Auto-invoked by workflow enforcer at intervals

#### `log_decision`

```typescript
{
  name: "log_decision",
  parameters: {
    summary: string,
    rationale: string,
    alternatives: string[],
    context?: string,       // what triggered this decision
    files?: string[],
    tags?: string[],
  },
  permissions: ["memory_write"],
}
```

#### `supersede_decision`

```typescript
{
  name: "supersede_decision",
  parameters: {
    oldSummary: string,      // exact match to find the old one
    newSummary: string,
    newRationale: string,
    newAlternatives: string[],
  },
  permissions: ["memory_write"],
}
```

#### `add_observation`

```typescript
{
  name: "add_observation",
  parameters: {
    content: string,
    taskTitle?: string,
    files?: string[],
    severity?: "info" | "warning" | "critical",
  },
  permissions: ["memory"],  // note: "memory" not "memory_write" — subagents can use
}
```

#### `resolve_observation`

```typescript
{
  name: "resolve_observation",
  parameters: {
    content: string,  // partial match to find the observation
  },
  permissions: ["memory_write"],
}
```

#### `update_task`

```typescript
{
  name: "update_task",
  parameters: {
    action: "add" | "start" | "done" | "abandon",
    title: string,
    description?: string,  // required on "add"
    outcome?: string,      // required on "done"
    items?: string[],      // sub-items for decomposition
  },
  permissions: ["memory_write"],
}
```

#### `update_plan`

```typescript
{
  name: "update_plan",
  parameters: {
    action: "add" | "status" | "step_done" | "step_skip" | "step_add",
    title: string,
    goal?: string,          // required on "add"
    steps?: string[],       // required on "add"
    status?: "active" | "paused" | "complete",
    stepIndex?: number,     // for step_done/skip
    newStep?: string,       // for step_add
  },
  permissions: ["memory_write"],
}
```

#### `write_handoff`

```typescript
{
  name: "write_handoff",
  parameters: {
    summary: string,  // must answer: what done? what not? what next?
  },
  permissions: ["memory_write"],
}
```

#### `search_memory`

```typescript
{
  name: "search_memory",
  parameters: {
    query: string,
    scope?: "all" | "decisions" | "observations" | "tasks" | "checkpoints",
  },
  permissions: ["memory"],
}
```

#### `read_entity`

```typescript
{
  name: "read_entity",
  parameters: {
    name: string,  // module, file, concept name
  },
  permissions: ["memory"],
}
```

### Git Tools

#### `git_status`

```typescript
{
  name: "git_status",
  parameters: {},
  permissions: ["read"],
}
```

#### `git_diff`

```typescript
{
  name: "git_diff",
  parameters: {
    ref?: string,     // compare against (default: HEAD)
    filePath?: string, // scope to file
  },
  permissions: ["read"],
}
```

#### `git_commit`

```typescript
{
  name: "git_commit",
  parameters: {
    message: string,
    files?: string[],  // stage specific files (default: all changes)
  },
  permissions: ["write"],
}
```

#### `git_push`

```typescript
{
  name: "git_push",
  parameters: {
    remote?: string,
    branch?: string,
    force?: boolean,
  },
  permissions: ["write", "network", "confirm"],
}
```

### Communication Tools

#### `ask_user`

```typescript
{
  name: "ask_user",
  parameters: {
    question: string,
    options?: string[],   // structured choices
    blocking?: boolean,   // default true — wait for response
  },
  permissions: [],
}
```

#### `report_progress`

```typescript
{
  name: "report_progress",
  parameters: {
    message: string,
    taskTitle?: string,
  },
  permissions: [],
}
```

### Signal Tools

#### `check_signals`

```typescript
{
  name: "check_signals",
  parameters: {},
  permissions: ["memory"],
}
```

#### `acknowledge_signal`

```typescript
{
  name: "acknowledge_signal",
  parameters: {
    signalId: string,
  },
  permissions: ["memory_write"],
}
```

### HTTP Tools

#### `fetch_url`

```typescript
{
  name: "fetch_url",
  parameters: {
    url: string,
    method?: "GET" | "POST",
    headers?: Record<string, string>,
    body?: string,
  },
  permissions: ["network"],
}
```

Behavior:
- Only allows URLs referenced in workspace files or explicitly approved by user
- Blocks internal/private IPs (SSRF protection)
- Content-type-aware: returns rendered text for HTML, parsed JSON for API responses

### Multi-File Batch Editing Tools

Cursor-style staging + preview + atomic apply for large refactors:

#### `begin_edit_batch`

```typescript
{
  name: "begin_edit_batch",
  parameters: {
    description: string,       // what this batch accomplishes
    taskId?: string,           // link to current task
  },
  permissions: ["write"],
  returns: { batchId: string },
}
```

Behavior:
- Creates an in-memory edit batch
- Must be called before `stage_edit`
- Only one active batch per session

#### `stage_edit`

```typescript
{
  name: "stage_edit",
  parameters: {
    batchId: string,
    filePath: string,
    oldString: string,
    newString: string,
    description?: string,    // why this file changed
  },
  permissions: ["write"],
}
```

Behavior:
- Adds edit to batch (NOT written to disk yet)
- Stores old content for rollback
- Multiple edits per file supported
- The edit buffer summary is maintained in session context so the LLM
  remembers what it changed by file #20:
  ```
  Batch "Refactor auth" — 12 files staged:
  - src/auth/token.ts: Added IToken interface (+15 lines)
  - src/middleware/auth.ts: Updated signature to use IToken
  ...
  ```

#### `preview_batch`

```typescript
{
  name: "preview_batch",
  parameters: {
    batchId: string,
  },
  permissions: ["read"],
  returns: {
    totalFiles: number,
    totalEdits: number,
    summary: string,           // markdown diff summary
    files: Array<{
      path: string,
      additions: number,
      deletions: number,
      preview: string,         // first N lines of diff
    }>,
  },
}
```

Behavior:
- Generates diff summary for user review
- Shown via `ask_user` or dashboard
- User can approve all, reject all, or per-file

#### `apply_batch`

```typescript
{
  name: "apply_batch",
  parameters: {
    batchId: string,
    autoCommit?: boolean,     // git commit after apply (uses config default)
    commitMessage?: string,
  },
  permissions: ["write"],
}
```

Behavior:
- Writes all staged edits to disk atomically
- `git add` all changed files
- Optional `git commit` with descriptive message
- Stores rollback info (all old file contents)

#### `abort_batch`

```typescript
{
  name: "abort_batch",
  parameters: {
    batchId: string,
    reason?: string,
  },
  permissions: ["write"],
}
```

Behavior:
- Discards all pending edits (nothing was written to disk)
- Logs observation with reason

### Rollback Tools

#### `undo_edit`

```typescript
{
  name: "undo_edit",
  parameters: {
    editId: string,
  },
  permissions: ["write"],
}
```

Behavior:
- Restores a single file edit to its previous state
- Works mid-task

#### `rollback_task`

```typescript
{
  name: "rollback_task",
  parameters: {
    taskTitle: string,
  },
  permissions: ["write", "confirm"],
}
```

Behavior:
- Reverts all git commits associated with a task
- Uses `git revert` (creates new commit, doesn't rewrite history)
- Marks task as "rolled back" in memory
- Preserves all decisions/observations with a "rolled back" flag
- **Requires user confirmation**

#### `rollback_session`

```typescript
{
  name: "rollback_session",
  parameters: {
    sessionId: string,
  },
  permissions: ["write", "confirm"],
}
```

Behavior:
- Reverts all commits from an entire session
- `git revert --no-commit` all session commits, then one revert commit
- **Requires user confirmation** (nuclear option)

### Observability Tools

#### `get_audit_log`

```typescript
{
  name: "get_audit_log",
  parameters: {
    taskTitle?: string,
    filePath?: string,
    since?: string,            // relative time: "2h ago", "yesterday"
    limit?: number,            // default 20
  },
  permissions: ["read"],
}
```

Behavior:
- Returns structured audit entries
- Filterable by task, file, time
- Secrets auto-redacted

#### `get_cost_report`

```typescript
{
  name: "get_cost_report",
  parameters: {
    scope?: "session" | "task" | "all",
    breakdown?: boolean,       // per-model, per-subagent
  },
  permissions: ["read"],
  returns: {
    totalTokens: number,
    inputTokens: number,
    outputTokens: number,
    estimatedCost: number,
    byModel: Record<string, { tokens: number, cost: number }>,
    bySubagent?: Record<string, { tokens: number, cost: number }>,
  },
}
```

---

## 3. Subagent Protocol

### Subagent Types and Permissions

```typescript
interface SubagentConfig {
  type: "explore" | "planner" | "worker" | "reviewer";
  goal: string;
  context: SubagentContext;   // injected from orchestrator
  tools: string[];            // allowed tool names
  model?: string;             // override default model
  maxSteps?: number;          // budget limit
}

const SUBAGENT_PERMISSIONS: Record<string, string[]> = {
  explore: [
    "read_file", "grep", "semantic_search", "get_errors",
    "symbol_references", "list_dir", "search_files",
    "search_memory", "read_entity", "add_observation",
  ],
  planner: [
    // everything explore can do, plus plan creation
    ...SUBAGENT_PERMISSIONS.explore,
    "update_plan",  // add only
  ],
  worker: [
    // full tool access except destructive ops
    "read_file", "edit_file", "create_file", "multi_edit",
    "run_command", "run_background", "get_process_output",
    "grep", "semantic_search", "get_errors",
    "symbol_references", "rename_symbol",
    "search_memory", "read_entity", "add_observation",
    "checkpoint", "git_status", "git_diff",
  ],
  reviewer: [
    // read-only + observations
    "read_file", "grep", "semantic_search", "get_errors",
    "git_diff", "symbol_references",
    "search_memory", "read_entity", "add_observation",
  ],
};
```

### Subagent Lifecycle

```
Orchestrator                     Subagent
    │                                │
    │── prepare_delegation(goal) ──→ │  (gather context for subagent)
    │                                │
    │── spawn(config) ─────────────→ │  (new LLM conversation)
    │                                │
    │                                │── [tool calls] ──→ Tool Executor
    │                                │←─ [results] ──────
    │                                │
    │                                │── add_observation ──→ Memory
    │                                │
    │←─ return(result) ────────────  │  (subagent done)
    │                                │
    │── process_result(result) ────→ Memory (persist findings)
    │
```

### Context Injection

When spawning a subagent, the orchestrator injects:

```typescript
interface SubagentContext {
  goal: string;                    // what the subagent should accomplish
  priorFindings: Observation[];    // relevant observations from this session
  relatedDecisions: Decision[];    // decisions that constrain the work
  activePlan?: Plan;               // current plan for context
  activeTask?: Task;               // current task for context
  fileHints: string[];             // files likely relevant
  instructions: string;            // behavioral guidance for the subagent
}
```

### Result Processing

When a subagent returns, the orchestrator:

1. Extracts structured findings (observations the subagent logged directly are already in memory)
2. Extracts recommendations and proposed actions
3. Evaluates whether to accept recommendations automatically or surface to user
4. Integrates into current plan/task

```typescript
interface SubagentResult {
  outcome: string;              // summary of what was accomplished
  observations: string[];       // findings logged (already in DB)
  recommendations: string[];    // suggested next steps
  filesModified?: string[];     // for worker subagents
  errors?: string[];            // issues encountered
}
```

---

## 4. Session Lifecycle

### State Machine

```
                              ┌──────────┐
                   ┌─────────→│  IDLE    │←────────────┐
                   │          └────┬─────┘             │
                   │               │ user_message      │
                   │               ↓                   │
                   │          ┌──────────┐             │
                   │     ┌───→│ THINKING │←──┐         │
                   │     │    └────┬─────┘   │         │
                   │     │         │         │         │
                   │     │    tool_call  observe       │
                   │     │         ↓         │         │
                   │     │    ┌──────────┐   │         │
                   │     │    │  ACTING  │───┘         │
                   │     │    └────┬─────┘             │
                   │     │         │                   │
                   │     │    task_done                │
                   │     │         ↓                   │
                   │     │    ┌──────────┐             │
                   │     └────│REPORTING │─────────────┘
                   │          └──────────┘
                   │
              budget_exceeded
                   │          ┌──────────┐
                   └──────────│COMPACTING│
                              └────┬─────┘
                                   │ new_session
                                   ↓
                              ┌──────────┐
                              │ RESUMING │──→ THINKING
                              └──────────┘
```

### Session Object

```typescript
interface Session {
  id: string;
  workspaceId: string;
  projectId: string;
  userId: string;

  // State
  status: "idle" | "thinking" | "acting" | "reporting" | "compacting" | "resuming";
  startedAt: Date;
  lastActivity: Date;

  // Context tracking
  totalTokensUsed: number;
  stepCount: number;
  stepsSinceCheckpoint: number;
  stepsSinceSignalCheck: number;
  minutesSinceCheckpoint: number;

  // Active work
  activeTask: Task | null;
  activePlan: Plan | null;

  // History (managed by context manager)
  messages: ChatMessage[];
  toolResults: ToolResult[];
  workingFiles: Map<string, FileInfo>;
}
```

### Session Continuation

When a session hits context limits:

1. `write_handoff` summarizes everything
2. The Orchestrator starts a **new LLM conversation**
3. The new conversation loads:
   - System prompt (from config)
   - Last handoff (from memory)
   - Active task and plan (from memory)
   - Recent decisions and observations (from memory)
4. Work continues seamlessly — the user sees no interruption

This replaces the "compaction" approach (which loses information) with a **session relay** (which preserves everything via memory).

---

## 5. Context Window Management

### Token Budget Allocation

```typescript
interface ContextBudget {
  total: number;                    // model's context window
  systemPrompt: number;            // fixed ~4K
  sessionContext: number;          // loaded from memory ~8K
  activePlanAndTask: number;       // ~2K
  workingFiles: number;            // dynamic, up to ~40K
  recentToolResults: number;       // rolling window ~30K
  chatHistory: number;             // ~10K
  reserve: number;                 // for LLM response + tool calls ~34K
}

class ContextManager {
  private budget: ContextBudget;
  private entries: ContextEntry[];  // ordered by recency

  // Called before each LLM call
  buildContext(session: Session): LLMContext {
    const context = new LLMContext();

    // Priority 1: Always included
    context.add(this.systemPrompt);
    context.add(this.activeTaskAndPlan(session));

    // Priority 2: Recent and relevant
    context.add(this.recentChatMessages(session, this.budget.chatHistory));
    context.add(this.recentToolResults(session, this.budget.recentToolResults));

    // Priority 3: Working context (evict oldest first)
    context.add(this.workingFiles(session, this.budget.workingFiles));

    // Priority 4: Session context from memory (handoff, decisions, observations)
    context.add(this.sessionMemoryContext(session, this.budget.sessionContext));

    return context;
  }

  // Called after each tool result
  append(call: ToolCall, result: ToolResult): void {
    this.entries.push({ call, result, timestamp: Date.now() });
    this.totalTokens += result.tokensEstimate;

    if (this.totalTokens > this.budget.total * 0.7) {
      this.evictOldest();
    }
  }

  budgetExceeded(): boolean {
    return this.totalTokens > this.budget.total * 0.85;
  }
}
```

### Working File Set

The agent doesn't blindly dump entire files into context. Instead:

```typescript
class WorkingFileSet {
  private files: Map<string, WorkingFile>;

  // When a file is read
  addFile(path: string, content: string, linesRead: [number, number]): void {
    this.files.set(path, {
      path,
      content,
      linesRead,
      lastAccessed: Date.now(),
      relevanceScore: 1.0,
    });
    this.evictIfOverBudget();
  }

  // Eviction: LRU with relevance weighting
  private evictIfOverBudget(): void {
    while (this.totalTokens() > this.budget) {
      const leastRelevant = this.findLeastRelevant();
      // Don't evict files being actively edited
      if (leastRelevant.isBeingEdited) continue;
      // Summarize before evicting (keep a 1-line note)
      this.summarize(leastRelevant);
      this.files.delete(leastRelevant.path);
    }
  }
}
```

### Compaction Algorithm

When the context budget threshold is exceeded:

```
Phase 1 (70%): Soft compaction
  - Summarize tool results older than 10 turns
  - Keep: last tool call/result text, first 2 lines of each older result
  - Keep: all file edit operations (important for undo context)

Phase 2 (80%): Medium compaction
  - Write checkpoint to memory
  - Compress chat history: keep user messages verbatim, summarize agent messages
  - Evict non-active working files (keep path + 1-line summary)

Phase 3 (90%): Hard compaction — Session Relay
  - Write handoff to memory
  - Start new LLM conversation
  - Load from memory: handoff + active task + active plan + recent decisions
  - Continue working without user noticing

Phase 4 (95%): Emergency
  - Truncate everything except system prompt + active task
  - Write emergency checkpoint
  - Ask user if they want to continue or start fresh
```

---

## 6. Memory Schema

### Database Tables

```sql
-- Core entities (same as v1, extended)
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  name TEXT NOT NULL,
  path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  user_id UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  total_steps INTEGER DEFAULT 0,
  total_tokens_used BIGINT DEFAULT 0
);

-- Tasks
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  session_id UUID REFERENCES sessions(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',  -- todo, in_progress, done, abandoned
  outcome TEXT,
  items JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Plans
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  session_id UUID REFERENCES sessions(id),
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- active, paused, complete
  steps JSONB NOT NULL DEFAULT '[]',
  -- steps: [{ text: string, status: "pending"|"done"|"skipped" }]
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Decisions
CREATE TABLE decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  session_id UUID REFERENCES sessions(id),
  summary TEXT NOT NULL,
  rationale TEXT NOT NULL,
  alternatives JSONB NOT NULL DEFAULT '[]',
  context TEXT,
  files JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  superseded_by UUID REFERENCES decisions(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Observations
CREATE TABLE observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  session_id UUID REFERENCES sessions(id),
  content TEXT NOT NULL,
  task_title TEXT,
  files JSONB DEFAULT '[]',
  severity TEXT DEFAULT 'info',  -- info, warning, critical
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Checkpoints
CREATE TABLE checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  progress TEXT NOT NULL,
  next_step TEXT NOT NULL,
  files_active JSONB DEFAULT '[]',
  context_tokens_used BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Handoffs
CREATE TABLE handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  project_id UUID REFERENCES projects(id),
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Signals
CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  type TEXT NOT NULL,  -- message, priority, abort, answer
  content TEXT NOT NULL,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Vector embeddings (stored in Qdrant, metadata here)
CREATE TABLE embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  source_type TEXT NOT NULL,  -- file, decision, observation, task
  source_id UUID,
  file_path TEXT,
  chunk_start INTEGER,
  chunk_end INTEGER,
  qdrant_point_id UUID,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Memory Queries

Key queries the agent runtime executes:

```typescript
// Load session context (called at session start)
async function loadSessionContext(projectId: string): Promise<SessionContext> {
  const [handoff, tasks, plans, decisions, observations] = await Promise.all([
    db.query("SELECT * FROM handoffs WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1", [projectId]),
    db.query("SELECT * FROM tasks WHERE project_id = $1 AND status IN ('todo', 'in_progress') ORDER BY updated_at DESC", [projectId]),
    db.query("SELECT * FROM plans WHERE project_id = $1 AND status = 'active'", [projectId]),
    db.query("SELECT * FROM decisions WHERE project_id = $1 AND superseded_by IS NULL ORDER BY created_at DESC LIMIT 20", [projectId]),
    db.query("SELECT * FROM observations WHERE project_id = $1 AND resolved = false ORDER BY created_at DESC LIMIT 20", [projectId]),
  ]);

  return { handoff, tasks, plans, decisions, observations };
}

// Search memory (semantic + keyword)
async function searchMemory(query: string, scope?: string): Promise<MemoryResult[]> {
  // 1. Vector search in Qdrant
  const vectorResults = await qdrant.search(embed(query), { limit: 10 });

  // 2. Keyword search in PostgreSQL
  const keywordResults = await db.query(
    "SELECT * FROM decisions WHERE summary ILIKE $1 OR rationale ILIKE $1 " +
    "UNION SELECT * FROM observations WHERE content ILIKE $1",
    [`%${query}%`]
  );

  // 3. Merge and rank
  return mergeResults(vectorResults, keywordResults);
}
```

---

## 7. Signal System

### Signal Types

```typescript
type SignalType = "message" | "priority" | "abort" | "answer";

interface Signal {
  id: string;
  type: SignalType;
  content: string;
  urgency: "normal" | "urgent";
  metadata?: {
    taskTitle?: string;     // for priority signals
    questionId?: string;    // for answer signals
  };
  acknowledged: boolean;
  createdAt: Date;
}
```

### Signal Flow

```
Developer                    Signal System                   Agent
   │                              │                            │
   │── kontinue signal send ────→ │                            │
   │   "prioritize auth task"     │                            │
   │                              │── inject into next ──────→ │
   │                              │   tool response            │
   │                              │                            │
   │                              │←── acknowledge_signal ──── │
   │                              │                            │
   │←── notification ───────────  │                            │
   │   "Agent acknowledged"       │                            │
```

### Signal Injection

Signals are injected into the agent's context at checkpoints:

```typescript
class SignalManager {
  async check(): Promise<Signal[]> {
    const pending = await db.query(
      "SELECT * FROM signals WHERE project_id = $1 AND acknowledged = false ORDER BY created_at",
      [this.projectId]
    );
    return pending;
  }

  async inject(signals: Signal[], context: ContextManager): void {
    for (const signal of signals) {
      const formatted = this.formatSignal(signal);
      context.injectPriority(formatted); // goes to top of context

      if (signal.type === "abort") {
        // Abort is handled immediately
        throw new AbortSignal(signal);
      }
    }
  }

  private formatSignal(signal: Signal): string {
    return `⚡ SIGNAL FROM DEVELOPER (${signal.type.toUpperCase()}):\n${signal.content}\n\nCall acknowledge_signal("${signal.id}") after processing.`;
  }
}
```

---

## 8. Chat Protocol

### Message Types

```typescript
// User → Agent
interface UserMessage {
  type: "user_message";
  content: string;
  attachments?: Attachment[];  // files, images, URLs
}

// Agent → User
interface AgentMessage {
  type: "agent_message";
  content: string;              // markdown-formatted
  messageType: "response" | "question" | "outcome" | "error";
}

// Agent → User (real-time activity feed)
interface AgentActivity {
  type: "agent_activity";
  activity: "tool_call" | "tool_result" | "thinking" | "checkpoint" | "decision" | "observation";
  summary: string;              // one-line description
  details?: unknown;            // structured data
}

// Developer → Agent (real-time signal)
interface SignalMessage {
  type: "signal";
  signal: Signal;
}

// System → User
interface SystemMessage {
  type: "system";
  content: string;
  level: "info" | "warning" | "error";
}
```

### Transport

```typescript
// WebSocket for interactive use (dashboard, VS Code)
interface WebSocketTransport {
  // Bidirectional
  send(message: UserMessage | SignalMessage): void;
  onMessage(handler: (msg: AgentMessage | AgentActivity | SystemMessage) => void): void;
}

// stdio for CLI / headless use
interface StdioTransport {
  // JSON-RPC over stdin/stdout
  // Same message types, serialized as JSON lines
}
```

### Activity Streaming

The agent streams its activity in real-time so users see what's happening:

```
User: "Fix the login bug"
───────────────────────────
  🔍 Searching for login-related code...
  📄 Reading src/auth/login.ts (L45-L120)
  🧠 Found issue: token expiry not checked before refresh
  📝 Logged observation: "Token expiry check missing in login flow"
  ✏️  Editing src/auth/login.ts
  🧪 Running tests: npm test -- --grep "login"
  ✅ Tests pass (12/12)
  💾 Checkpoint saved
───────────────────────────
Agent: Fixed the login bug. The token expiry wasn't being checked
before attempting a refresh, causing silent auth failures. Added
an expiry check at line 67 of src/auth/login.ts. All 12 login
tests pass.
```

---

## 9. Configuration System

### Configuration Hierarchy

```
1. Defaults (built-in)
2. Global config (~/.config/kontinue/config.json)
3. Workspace config (.kontinue/config.json)
4. Project config (.kontinue/projects/{name}/config.json)
5. Environment variables (KONTINUE_*)
6. CLI flags (highest priority)
```

### Configuration Schema

```typescript
interface KontinueConfig {
  // LLM
  llm: {
    provider: "anthropic" | "openai" | "azure" | "local";
    model: string;                    // e.g., "claude-sonnet-4-20250514"
    apiKey?: string;                  // or use env var
    maxTokens?: number;               // per response
    temperature?: number;             // 0-1
    fallbackModel?: string;           // if primary fails
  };

  // Subagent models (optional overrides)
  subagents?: {
    explore?: { model: string };
    planner?: { model: string };
    worker?: { model: string };
    reviewer?: { model: string };
  };

  // Behavior
  behavior: {
    autoCheckpointMinutes: number;    // default: 15
    autoCheckpointSteps: number;      // default: 20
    signalCheckInterval: number;      // steps between checks, default: 10
    confirmDestructive: boolean;      // default: true
    confirmGitPush: boolean;          // default: true
    maxConcurrentSubagents: number;   // default: 2
    planThreshold: number;            // steps before plan required, default: 3
    autoTest: "always" | "on-change" | "never";  // default: "on-change"
    autoCommit: "per-task" | "per-session" | "manual";  // default: "per-task"
  };

  // Persistence
  storage: {
    type: "postgres" | "sqlite";
    connectionString?: string;
    vectorStore?: {
      type: "qdrant" | "none";
      url?: string;
    };
  };

  // Interface
  ui: {
    activityStream: boolean;          // show real-time tool calls
    verbosity: "quiet" | "normal" | "verbose";
  };

  // Security
  security: {
    allowedDomains: string[];         // for HTTP fetch
    blockedPatterns: string[];        // terminal command patterns to block
    sandboxPath: string;              // restrict file access to this path
  };

  // Project-specific
  project: {
    name: string;
    language?: string;                // hint for tool selection
    buildCommand?: string;            // how to build
    testCommand?: string;             // how to test
    lintCommand?: string;             // how to lint
  };
}
```

### System Prompt Construction

The system prompt is built from config + project context:

```typescript
function buildSystemPrompt(config: KontinueConfig, project: ProjectContext): string {
  return [
    CORE_IDENTITY,                    // "You are Kontinue, an autonomous coding agent..."
    WORKFLOW_RULES,                   // Plan-before-multistep, checkpoint, etc.
    TOOL_DESCRIPTIONS,                // Generated from registered tools
    PROJECT_CONTEXT(project),         // Language, framework, build commands
    SECURITY_RULES(config.security),  // Allowed domains, blocked patterns
    BEHAVIORAL_CONFIG(config.behavior), // Checkpoint interval, confirmation rules
  ].join("\n\n");
}
```

---

## 10. Error Handling

### Error Categories

```typescript
type ErrorCategory =
  | "tool_error"        // tool execution failed
  | "llm_error"         // LLM API failure
  | "budget_error"      // context budget exceeded
  | "permission_error"  // action not allowed
  | "user_abort"        // user cancelled action
  | "signal_abort"      // developer sent abort signal
  | "internal_error";   // runtime bug

interface AgentError {
  category: ErrorCategory;
  message: string;
  retryable: boolean;
  context?: unknown;
}
```

### Error Recovery Strategies

```typescript
const ERROR_STRATEGIES: Record<ErrorCategory, ErrorStrategy> = {
  tool_error: {
    // Tool failed — analyze error, try different approach
    action: "retry_with_different_approach",
    maxRetries: 3,
    handler: async (error, step) => {
      // Don't retry the same thing — let LLM reason about the error
      return { injectError: true, continueLoop: true };
    },
  },

  llm_error: {
    // LLM API failed — retry with backoff, fall back to alt model
    action: "retry_with_fallback",
    maxRetries: 3,
    handler: async (error, step) => {
      if (error.status === 429) {
        await delay(exponentialBackoff(error.retryCount));
        return { retry: true };
      }
      if (error.retryCount >= 2 && config.llm.fallbackModel) {
        return { switchModel: config.llm.fallbackModel };
      }
      return { halt: true, reportToUser: "LLM unavailable" };
    },
  },

  budget_error: {
    // Context too large — trigger compaction
    action: "compact_and_continue",
    handler: async (error, session) => {
      await contextManager.compact(session);
      return { continueLoop: true };
    },
  },

  permission_error: {
    // Action not allowed — report to user
    action: "report",
    handler: async (error, step) => {
      await chat.reportProgress(`Permission denied: ${error.message}`);
      return { continueLoop: true }; // let LLM choose different action
    },
  },

  user_abort: {
    action: "checkpoint_and_halt",
    handler: async (error, session) => {
      await memory.checkpoint(session);
      return { halt: true };
    },
  },

  signal_abort: {
    action: "checkpoint_and_read_signals",
    handler: async (error, session) => {
      await memory.checkpoint(session);
      const signals = await signalManager.check();
      return { continueLoop: true, injectSignals: signals };
    },
  },

  internal_error: {
    action: "log_and_report",
    handler: async (error, session) => {
      console.error("Internal error:", error);
      await memory.addObservation({
        content: `Internal error: ${error.message}`,
        severity: "critical",
      });
      return { halt: true, reportToUser: "Internal error occurred" };
    },
  },
};
```

---

## 11. Security Model

### Workspace Sandboxing

```typescript
class SecurityManager {
  private workspacePath: string;
  private config: SecurityConfig;

  // Validate file path is within workspace
  validateFilePath(path: string): boolean {
    const resolved = resolve(path);
    return resolved.startsWith(this.workspacePath);
  }

  // Check if terminal command is safe
  validateCommand(command: string): CommandValidation {
    // Pattern-based blocking
    for (const pattern of this.config.blockedPatterns) {
      if (new RegExp(pattern, "i").test(command)) {
        return { allowed: false, reason: `Matches blocked pattern: ${pattern}` };
      }
    }

    // Destructive command detection
    const destructivePatterns = [
      /rm\s+-rf/i,
      /git\s+push\s+.*--force/i,
      /git\s+reset\s+--hard/i,
      /drop\s+table/i,
      /truncate\s+table/i,
    ];

    for (const pattern of destructivePatterns) {
      if (pattern.test(command)) {
        return { allowed: true, requiresConfirmation: true, reason: "Destructive command" };
      }
    }

    return { allowed: true, requiresConfirmation: false };
  }

  // Validate URL for SSRF protection
  validateUrl(url: string): boolean {
    const parsed = new URL(url);

    // Block internal IPs
    const ip = parsed.hostname;
    if (isPrivateIP(ip) || ip === "localhost" || ip === "127.0.0.1") {
      return false;
    }

    // Check allowed domains
    if (this.config.allowedDomains.length > 0) {
      return this.config.allowedDomains.some(d => parsed.hostname.endsWith(d));
    }

    return true;
  }
}
```

### API Key Management

```typescript
class KeyManager {
  // AES-256-GCM encrypted file store (proven in v1)
  private store: EncryptedStore;

  async storeLLMKey(provider: string, key: string): Promise<void> {
    await this.store.set(`llm:${provider}`, key);
  }

  async getLLMKey(provider: string): Promise<string | null> {
    return this.store.get(`llm:${provider}`);
  }

  // Keys never appear in:
  // - Chat messages
  // - Memory (observations, decisions, checkpoints)
  // - Tool results
  // - Logs (below ERROR level)
}
```

### Audit Trail

Every tool call is logged for security audit:

```typescript
interface AuditEntry {
  sessionId: string;
  timestamp: Date;
  tool: string;
  parameters: unknown;      // with secrets redacted
  result: "success" | "error" | "denied";
  confirmedBy?: string;     // if user confirmation was needed
}
```

---

## 12. Extension Points

### Custom Tool Registration

Third-party tools can be registered:

```typescript
// In .kontinue/tools/my-tool.ts
export default {
  name: "my_custom_tool",
  description: "Does something project-specific",
  parameters: { /* JSON Schema */ },
  permissions: ["read"],
  execute: async (params, context) => {
    // Custom implementation
    return { success: true, data: "result" };
  },
} satisfies Tool;
```

### MCP Backward Compatibility

v2 can expose its tools as an MCP server for external agents:

```typescript
// Allows other AI agents to use Kontinue's memory tools via MCP
class MCPCompatLayer {
  // Maps MCP tool calls to native tool executor
  // Useful for: VS Code Copilot, Cursor, other agents
  // The agent instructions (.github/copilot-instructions.md) still work
}
```

### Plugin Hooks

```typescript
interface PluginHooks {
  beforeToolCall?(call: ToolCall): ToolCall | null;     // modify or cancel
  afterToolCall?(call: ToolCall, result: ToolResult): void;
  onSessionStart?(session: Session): void;
  onSessionEnd?(session: Session): void;
  onTaskComplete?(task: Task): void;
  onDecisionLogged?(decision: Decision): void;
}
```

---

## 13. Collaboration Design

### Git Worktree-Based Isolation

Multiple developers work on the same project without conflicts:

```typescript
interface WorktreeConfig {
  repoPath: string;           // shared repo
  worktreePath: string;       // developer's isolated worktree
  branch: string;             // developer's working branch
  developer: string;          // developer identifier
}

// Agent initializes a worktree for each developer
async function setupDevWorktree(config: WorktreeConfig): Promise<void> {
  await run(`git worktree add ${config.worktreePath} -b ${config.branch}`);
}
```

### Shared vs. Private Memory

```typescript
interface MemoryVisibility {
  // Project-wide (all developers see these)
  decisions: "shared";       // architectural choices constrain everyone
  observations: "shared";    // discoveries benefit everyone
  plans: "shared";           // coordination requires visibility

  // Per-developer (private to session)
  checkpoints: "private";    // session-specific state
  handoffs: "private";       // developer's personal context
  tasks: "visible";          // others can see (read-only) but not modify
}
```

### Cross-Developer Signals

```typescript
// Alice's agent signals Bob's agent
await signalManager.send({
  type: "message",
  targetDeveloper: "bob",     // or "*" for broadcast
  content: "I refactored the auth module — update your imports",
});

// Bob's agent receives at next signal check
// and acts accordingly (updates imports in his worktree)
```

### Merge Coordination

When a developer's branch needs to merge:
1. Agent runs `git merge main` in the worktree
2. If conflicts exist, agent resolves trivial conflicts automatically
3. Non-trivial conflicts flagged as blockers with context from shared decisions
4. Post-merge: agent runs tests to verify

---

## Implementation Priority

### Phase 1: Core Agent (MVP) — Local, BYOK, Terminal + Dashboard

1. Agent loop (orchestrator + multi-model LLM gateway)
2. File tools (read, edit, create, search)
3. Terminal tools (run, background)
4. Memory tools (checkpoint, task, decision, observation, handoff)
5. Context manager (basic budget tracking)
6. CLI chat interface (stdio)
7. Multi-file batch editing (stage → preview → apply)
8. Rollback tools (edit-level, batch-level, task-level)
9. Web dashboard (real-time activity stream, timeline, diff view)
10. Configurable testing and git integration (autoTest, autoCommit)

### Phase 2: Intelligence

1. Subagent spawner (explore + worker)
2. Semantic search (Qdrant integration)
3. Context compaction (session relay)
4. Workflow enforcer (rules engine)
5. Signal system
6. Observability tools (audit log, cost tracking, session replay)

### Phase 3: Collaboration

1. Git worktree-based multi-developer support
2. Shared memory scoping (project-wide decisions, private checkpoints)
3. Cross-developer signals
4. Merge coordination
5. Plan management tools
6. Reviewer subagent

### Phase 4: Scale & Product

1. Cloud deployment mode (managed service, Kontinue-provided keys)
2. Kontinue IDE (Cursor-like full coding environment)
3. MCP compatibility layer
4. Custom tool registration + plugin system
5. Audit and compliance features
6. Usage-based billing
