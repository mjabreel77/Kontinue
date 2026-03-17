# Kontinue Agent Instructions

You have access to a persistent memory system via the **Kontinue MCP tools**. These tools maintain context across sessions, track decisions, and keep work organized. Follow the rules below strictly and proactively — do not wait to be asked.

---

## Session Start (REQUIRED)

**Always call `kontinue_read_context` as the very first action** when a new conversation begins or when you are asked to work on code. Do this before reading any files, before asking clarifying questions, and before writing any code.

The output tells you:
- What branch you are on and recent commits
- What was accomplished in the last session and what was left unfinished
- Tasks currently in-progress and todo
- Recent architectural decisions that constrain the current work

Do not start work without reading this first.

---

## Tracking Tasks

Use `kontinue_update_task` to keep the task list accurate throughout the session.

| Situation | Action |
|---|---|
| User asks you to implement something new | `add` a task before starting |
| You begin actively working on a task | `start` it |
| A task is fully complete and verified | `done` |
| A task is being dropped or deferred | `abandon` + log a decision explaining why |

- Add tasks with short imperative titles: `"Add rate limiting to /api/auth"`, `"Fix null ref in session middleware"`
- Do not add tasks for trivial one-liner changes
- Mark tasks `done` immediately when finished — do not batch completions

---

## Recording Decisions

Call `kontinue_log_decision` whenever you:
- Choose one library, approach, or architecture over another
- Decide **not** to do something and why (dropped a pattern, avoided a dependency)
- Establish a convention that future work should follow
- Resolve a non-trivial trade-off that took reasoning

**Do not log** implementation details, file edits, or routine choices. Only log decisions a future session would need context for.

Always fill in `rationale` and `alternatives` — these are what make memory useful across sessions.

---

## Before Touching Unfamiliar Code

Call `kontinue_search_memory` or `kontinue_read_entity` before modifying a component, module, or API you haven't worked with in this session. This surfaces prior decisions and notes that may constrain your approach.

Examples:
- Before changing auth middleware → search "auth"
- Before touching the database layer → search "sqlite" or "schema"
- Before adding a new dependency → search for prior decisions about that area

---

## Flagging Blockers

Call `kontinue_flag_blocker` immediately when you are stuck and cannot proceed without external input:
- Waiting for credentials, API keys, or environment access
- Ambiguous requirements that need user clarification
- A dependency or system outside your control is broken

This does **not** close the session — it just records the blocker so the next session knows about it immediately.

---

## Session End

Call `kontinue_write_handoff` when:
- The user ends the conversation
- The context window is nearing its limit
- A natural stopping point is reached

Write the handoff so a future agent can read it cold and immediately continue:
- **Summary**: specific files changed, features completed, what state things are in
- **Blockers**: unresolved issues, outstanding questions, next steps

---

## What NOT to do

- Do not skip `kontinue_read_context` at session start — ever
- Do not ask the user "should I log this decision?" — just log it if it qualifies
- Do not use these tools for every small action — only meaningful state changes
- Do not call `kontinue_write_handoff` mid-session unless context is full
