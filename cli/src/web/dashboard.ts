export function getDashboardHtml(projectName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kontinue</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #f6f8fa;
    --bg2: #ffffff;
    --bg3: #f0f2f5;
    --border: #d0d7de;
    --text: #1f2328;
    --muted: #656d76;
    --green: #1a7f37;
    --yellow: #9a6700;
    --red: #cf222e;
    --blue: #0969da;
    --purple: #8250df;
    --cyan: #0c7c8a;
    --orange: #bc4c00;
    --signal-bg: #fff8c5;
    --signal-border: #e3b341;
  }

  [data-theme="dark"] {
    --bg: #0d1117;
    --bg2: #161b22;
    --bg3: #21262d;
    --border: #30363d;
    --text: #e6edf3;
    --muted: #8b949e;
    --green: #3fb950;
    --yellow: #d29922;
    --red: #f85149;
    --blue: #58a6ff;
    --purple: #bc8cff;
    --cyan: #39d2c0;
    --orange: #db6d28;
    --signal-bg: #2d2200;
    --signal-border: #9a6700;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    min-height: 100vh;
    padding-bottom: 32px;
  }

  header {
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    padding: 10px 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  header .brand { display: flex; flex-direction: column; gap: 0; }
  header h1 { font-size: 15px; font-weight: 700; color: var(--text); letter-spacing: -0.01em; }
  header .proj-sub { font-size: 11px; color: var(--muted); }
  header .meta { color: var(--muted); font-size: 12px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  header .badge {
    display: inline-flex; align-items: center; gap: 4px;
    background: var(--bg3); border: 1px solid var(--border);
    border-radius: 12px; padding: 2px 8px; font-size: 11px; white-space: nowrap;
  }
  header .badge.green { border-color: #82cfb0; color: var(--green); }
  [data-theme="dark"] header .badge.green { background: #0f2d1e; border-color: #238636; }
  header .badge.yellow { border-color: #e3b341; color: var(--yellow); }
  [data-theme="dark"] header .badge.yellow { background: #2d2200; border-color: #9a6700; }
  header .badge.red { border-color: #ffaba8; color: var(--red); }
  [data-theme="dark"] header .badge.red { background: #3d1117; border-color: #da3633; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

  .pulse { animation: pulse 2s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

  .theme-toggle {
    margin-left: auto;
    background: var(--bg3); border: 1px solid var(--border);
    border-radius: 6px; padding: 4px 8px; font-size: 13px;
    cursor: pointer; color: var(--text);
  }
  .theme-toggle:hover { background: var(--border); }

  /* Signal bar */
  .signal-bar {
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    padding: 8px 24px;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .signal-bar input[type="text"] {
    flex: 1; padding: 6px 10px; border: 1px solid var(--border);
    border-radius: 6px; font-size: 13px; background: var(--bg3);
    color: var(--text); outline: none; min-width: 0;
  }
  .signal-bar input[type="text"]:focus { border-color: var(--blue); }
  .signal-bar select {
    padding: 6px 8px; border: 1px solid var(--border);
    border-radius: 6px; font-size: 12px; background: var(--bg3);
    color: var(--text);
  }
  .signal-bar button, .btn {
    padding: 6px 14px; border: 1px solid var(--border);
    border-radius: 6px; font-size: 12px; cursor: pointer;
    background: var(--blue); color: #fff; font-weight: 500; white-space: nowrap;
  }
  .signal-bar button:hover, .btn:hover { opacity: 0.9; }
  .btn-sm { padding: 3px 8px; font-size: 11px; }
  .btn-outline { background: transparent; color: var(--blue); }
  .signal-bar .label { font-size: 11px; color: var(--muted); white-space: nowrap; }

  main { padding: 20px 24px; max-width: 1440px; margin: 0 auto; }

  .layout { display: grid; grid-template-columns: 1fr 320px; gap: 16px; }
  @media (max-width: 1000px) { .layout { grid-template-columns: 1fr; } }

  .grid { display: grid; gap: 16px; }
  .grid-3 { grid-template-columns: repeat(3, 1fr); }
  .grid-2 { grid-template-columns: repeat(2, 1fr); }
  @media (max-width: 900px) { .grid-3 { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 600px) { .grid-3, .grid-2 { grid-template-columns: 1fr; } }

  .card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }

  .card-header {
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .card-body { padding: 12px 16px; }

  .column-header-todo    { color: var(--muted); }
  .column-header-active  { color: var(--green); }
  .column-header-done    { color: var(--blue); }

  .task-card {
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 8px;
  }
  .task-card:last-child { margin-bottom: 0; }
  .task-card.stale { border-color: var(--red); border-left: 3px solid var(--red); }

  .task-title { font-weight: 500; font-size: 13px; margin-bottom: 4px; }
  .task-desc  { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  .task-meta  { font-size: 11px; color: var(--muted); display: flex; gap: 8px; flex-wrap: wrap; }

  .tag {
    display: inline-block; background: var(--bg);
    border: 1px solid var(--border); border-radius: 4px;
    padding: 1px 6px; font-size: 11px;
  }
  .tag.green  { border-color: var(--green);  color: var(--green); }
  .tag.blue   { border-color: var(--blue);   color: var(--blue); }
  .tag.yellow { border-color: var(--yellow); color: var(--yellow); }
  .tag.red    { border-color: var(--red);    color: var(--red); }
  .tag.purple { border-color: var(--purple); color: var(--purple); }

  .decision-row {
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .decision-row:last-child { border-bottom: none; }
  .decision-date { color: var(--muted); font-size: 11px; white-space: nowrap; min-width: 70px; }
  .decision-summary { font-size: 13px; flex: 1; }
  .decision-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 3px; }

  .plan-title { font-weight: 500; margin-bottom: 6px; }
  .plan-step {
    display: flex; align-items: center; gap: 8px;
    font-size: 12px; padding: 2px 0; color: var(--muted);
  }
  .plan-step.done   { color: var(--green); }
  .plan-step.active { color: var(--text); }
  .step-icon { font-size: 10px; }

  .question-row {
    padding: 7px 0;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .question-row:last-child { border-bottom: none; }
  .question-age { color: var(--muted); font-size: 11px; }
  .question-answer-form {
    display: flex; gap: 6px; margin-top: 6px;
  }
  .question-answer-form input {
    flex: 1; padding: 4px 8px; border: 1px solid var(--border);
    border-radius: 4px; font-size: 12px; background: var(--bg3);
    color: var(--text); outline: none;
  }

  .checkpoint-box {
    background: var(--bg3);
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 13px;
  }
  .checkpoint-progress { margin-bottom: 6px; }
  .checkpoint-next { color: var(--blue); font-size: 12px; }
  .checkpoint-meta { color: var(--muted); font-size: 11px; margin-top: 6px; }

  .handoff-summary {
    font-size: 13px;
    color: var(--muted);
    white-space: pre-wrap;
    max-height: 200px;
    overflow-y: auto;
    line-height: 1.6;
  }

  /* Activity feed */
  .activity-feed { max-height: 600px; overflow-y: auto; }
  .activity-item {
    display: flex; gap: 10px; padding: 6px 0;
    border-bottom: 1px solid var(--border);
    font-size: 12px; align-items: flex-start;
  }
  .activity-item:last-child { border-bottom: none; }
  .activity-dot {
    width: 8px; height: 8px; border-radius: 50%;
    flex-shrink: 0; margin-top: 5px;
  }
  .activity-dot.checkpoint { background: var(--green); }
  .activity-dot.task       { background: var(--blue); }
  .activity-dot.decision   { background: var(--purple); }
  .activity-dot.signal     { background: var(--orange); }
  .activity-dot.note       { background: var(--cyan); }
  .activity-text { flex: 1; color: var(--text); word-break: break-word; }
  .activity-time { color: var(--muted); font-size: 10px; white-space: nowrap; flex-shrink: 0; }

  /* Inline add-task form */
  .add-task-form {
    display: none; padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg3);
  }
  .add-task-form.open { display: block; }
  .add-task-form input, .add-task-form textarea {
    width: 100%; padding: 6px 8px; border: 1px solid var(--border);
    border-radius: 4px; font-size: 12px; background: var(--bg);
    color: var(--text); outline: none; margin-bottom: 6px;
  }
  .add-task-form textarea { resize: vertical; min-height: 48px; font-family: inherit; }
  .add-task-form .actions { display: flex; gap: 6px; justify-content: flex-end; }

  .empty { color: var(--muted); font-size: 13px; padding: 8px 0; }

  #status-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: var(--bg2); border-top: 1px solid var(--border);
    padding: 4px 24px; font-size: 11px; color: var(--muted);
    display: flex; justify-content: space-between;
  }

  .section-gap { margin-bottom: 16px; }
  .toast {
    position: fixed; bottom: 40px; right: 24px;
    background: var(--green); color: #fff; padding: 8px 16px;
    border-radius: 6px; font-size: 12px; font-weight: 500;
    opacity: 0; transition: opacity 0.3s;
    z-index: 100;
  }
  .toast.show { opacity: 1; }

  /* Observations */
  .obs-row {
    padding: 7px 0;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
    color: var(--text);
  }
  .obs-row:last-child { border-bottom: none; }
  .obs-age { color: var(--muted); font-size: 11px; }
  .obs-task-tag {
    display: inline-block; background: var(--bg);
    border: 1px solid var(--border); border-radius: 4px;
    padding: 1px 5px; font-size: 10px; color: var(--muted); margin-top: 3px;
  }

  /* Decisions */
  .decision-row:hover { background: var(--bg3); border-radius: 4px; }
  .view-btn {
    font-size: 11px; color: var(--blue); cursor: pointer; background: none;
    border: none; padding: 0; text-decoration: underline; display: block; margin-top: 4px;
  }
  .view-btn:hover { opacity: 0.75; }

  /* Modal */
  .modal-overlay {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(0,0,0,0.55);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  }
  .modal-overlay.hidden { display: none; }
  .modal {
    background: var(--bg2); border: 1px solid var(--border);
    border-radius: 10px; max-width: 720px; width: 100%;
    max-height: 82vh; overflow: hidden;
    display: flex; flex-direction: column;
    box-shadow: 0 24px 64px rgba(0,0,0,0.4);
  }
  .modal-header {
    padding: 14px 18px; border-bottom: 1px solid var(--border);
    display: flex; align-items: flex-start; gap: 10px;
  }
  .modal-title { font-weight: 600; font-size: 14px; flex: 1; line-height: 1.5; word-break: break-word; }
  .modal-close {
    background: none; border: none; cursor: pointer;
    color: var(--muted); font-size: 22px; line-height: 1;
    padding: 0 4px; border-radius: 4px; flex-shrink: 0;
  }
  .modal-close:hover { background: var(--bg3); color: var(--text); }
  .modal-body { padding: 16px 18px; overflow-y: auto; flex: 1; font-size: 13px; line-height: 1.75; }
  .modal-section { margin-bottom: 14px; }
  .modal-section:last-child { margin-bottom: 0; }
  .modal-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--muted); margin-bottom: 5px;
  }
  .modal-body pre { white-space: pre-wrap; font-family: inherit; color: var(--text); margin: 0; }
  .modal-files { font-family: monospace; font-size: 12px; color: var(--cyan); white-space: pre-wrap; }

  /* Pending signals */
  .signal-pending-row {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 6px 0; border-bottom: 1px solid var(--border);
    font-size: 12px;
  }
  .signal-pending-row:last-child { border-bottom: none; }
  .signal-type-badge {
    font-size: 10px; font-weight: 600; padding: 1px 5px;
    border-radius: 3px; white-space: nowrap; flex-shrink: 0; margin-top: 2px;
  }
  .signal-type-badge.message  { background: var(--bg3); color: var(--muted); border: 1px solid var(--border); }
  .signal-type-badge.priority { background: #2d2200; color: var(--yellow); border: 1px solid var(--yellow); }
  .signal-type-badge.abort    { background: #3d1117; color: var(--red); border: 1px solid var(--red); }
  .signal-type-badge.answer   { background: #0f2d1e; color: var(--green); border: 1px solid var(--green); }
  [data-theme="light"] .signal-type-badge.priority { background: #fff8c5; }
  [data-theme="light"] .signal-type-badge.abort    { background: #ffebe9; }
  [data-theme="light"] .signal-type-badge.answer   { background: #dafbe1; }
  .signal-content { flex: 1; word-break: break-word; color: var(--text); }
  .signal-meta { color: var(--muted); font-size: 10px; }

  /* Task items checklist */
  .task-items { margin-top: 6px; }
  .task-item {
    display: flex; align-items: center; gap: 5px;
    font-size: 11px; color: var(--muted); padding: 1px 0;
  }
  .task-item.done { text-decoration: line-through; color: var(--green); }
  .task-item-icon { font-size: 10px; flex-shrink: 0; }
  .task-items-progress {
    display: flex; align-items: center; gap: 6px;
    margin-top: 4px;
  }
  .progress-bar-wrap {
    flex: 1; height: 4px; background: var(--bg3);
    border-radius: 2px; overflow: hidden; border: 1px solid var(--border);
  }
  .progress-bar-fill { height: 100%; background: var(--green); border-radius: 2px; }
  .progress-label { font-size: 10px; color: var(--muted); white-space: nowrap; }
</style>
</head>
<body>

<header>
  <div class="brand">
    <h1>Kontinue</h1>
    <span class="proj-sub" id="proj-name"></span>
  </div>
  <div class="meta">
    <span id="git-info" class="badge">-</span>
    <span id="session-badge" class="badge">-</span>
    <span id="cp-badge" class="badge">-</span>
    <span id="health-badge" class="badge">-</span>
    <span id="signal-badge" class="badge" style="display:none">-</span>
  </div>
  <button class="theme-toggle" onclick="toggleTheme()" title="Toggle dark mode">
    <span id="theme-icon">&#9790;</span>
  </button>
</header>

<div class="signal-bar">
  <span class="label">Signal agent</span>
  <input type="text" id="signal-input" placeholder="Message the active agent... (Press / to focus)" onkeydown="if(event.key==='Enter')sendSignal()">
  <select id="signal-type">
    <option value="message">Message</option>
    <option value="priority">Priority</option>
    <option value="abort">Abort</option>
  </select>
  <button onclick="sendSignal()">Send</button>
</div>

<main>
  <div class="layout">
    <div class="left-col">
      <!-- Row 1: Task board -->
      <div class="section-gap">
        <div class="grid grid-3" id="board">
          <div class="card">
            <div class="card-header column-header-todo">
              <span>Todo <span id="count-todo"></span></span>
              <button class="btn btn-sm btn-outline" onclick="toggleAddTask()">+ Add</button>
            </div>
            <div class="add-task-form" id="add-task-form">
              <input type="text" id="new-task-title" placeholder="Task title...">
              <textarea id="new-task-desc" placeholder="Description (what does done look like?)"></textarea>
              <div class="actions">
                <button class="btn btn-sm btn-outline" onclick="toggleAddTask()">Cancel</button>
                <button class="btn btn-sm" onclick="submitTask()">Add Task</button>
              </div>
            </div>
            <div class="card-body" id="col-todo"><div class="empty">none</div></div>
          </div>
          <div class="card">
            <div class="card-header column-header-active"><span>In Progress <span id="count-ip"></span></span></div>
            <div class="card-body" id="col-inprogress"><div class="empty">none</div></div>
          </div>
          <div class="card">
            <div class="card-header column-header-done">Done <span id="count-done"></span></div>
            <div class="card-body" id="col-done"><div class="empty">none</div></div>
          </div>
        </div>
      </div>

      <!-- Row 2: Checkpoint + Questions + Plans -->
      <div class="section-gap">
        <div class="grid grid-3">
          <div class="card">
            <div class="card-header">Last Checkpoint</div>
            <div class="card-body" id="checkpoint-content"><div class="empty">no checkpoint yet</div></div>
          </div>
          <div class="card">
            <div class="card-header">Open Questions <span id="count-q"></span></div>
            <div class="card-body" id="questions-content"><div class="empty">none</div></div>
          </div>
          <div class="card">
            <div class="card-header">Active Plans <span id="count-plans"></span></div>
            <div class="card-body" id="plans-content"><div class="empty">none</div></div>
          </div>
        </div>
      </div>

      <!-- Row 3: Decisions + Observations + Last Handoff -->
      <div class="section-gap">
        <div class="grid grid-3">
          <div class="card">
            <div class="card-header">Decisions <span id="count-dec" style="color:var(--muted);font-weight:400"></span></div>
            <div class="card-body" id="decisions-content"><div class="empty">none</div></div>
          </div>
          <div class="card">
            <div class="card-header">Observations <span id="count-obs" style="color:var(--muted);font-weight:400"></span></div>
            <div class="card-body" id="observations-content"><div class="empty">none</div></div>
          </div>
          <div class="card">
            <div class="card-header">Last Handoff</div>
            <div class="card-body" id="handoff-content"><div class="empty">no previous session</div></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Right sidebar: Pending Signals + Activity Feed -->
    <div class="right-col">
      <div class="card section-gap" id="pending-signals-card" style="display:none">
        <div class="card-header" style="color:var(--yellow)">&#9888; Pending Signals <span id="count-pending-sigs"></span></div>
        <div class="card-body" id="pending-signals-content"></div>
      </div>
      <div class="card" style="position:sticky;top:60px">
        <div class="card-header">Activity Feed</div>
        <div class="card-body activity-feed" id="activity-content">
          <div class="empty">loading...</div>
        </div>
      </div>
    </div>
  </div>
</main>

<div class="modal-overlay hidden" id="modal-overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal" role="dialog" aria-modal="true">
    <div class="modal-header">
      <span class="modal-title" id="modal-title"></span>
      <button class="modal-close" onclick="closeModal()" title="Close (Esc)">&#215;</button>
    </div>
    <div class="modal-body" id="modal-body"></div>
  </div>
</div>

<div id="status-bar">
  <span id="status-left">connecting...</span>
  <span id="status-right"></span>
</div>

<div class="toast" id="toast"></div>

<script>
// ── Utilities ────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function fmtAge(isoDate) {
  if (!isoDate) return ''
  // SQLite datetime('now') stores UTC without Z suffix — append it so JS parses as UTC
  const dateStr = isoDate.endsWith('Z') ? isoDate : isoDate + 'Z'
  const mins = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return mins + 'm ago'
  const h = Math.floor(mins / 60), m = mins % 60
  return h + 'h' + (m > 0 ? ' ' + m + 'm' : '') + ' ago'
}

function showToast(msg) {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), 2500)
}

function confidenceBadge(c) {
  if (c === 'provisional') return '<span class="tag yellow">provisional</span>'
  if (c === 'revisit')     return '<span class="tag red">revisit</span>'
  return ''
}

// ── Theme ────────────────────────────────────────────────────────────────────

function toggleTheme() {
  const html = document.documentElement
  const isDark = html.getAttribute('data-theme') === 'dark'
  html.setAttribute('data-theme', isDark ? 'light' : 'dark')
  localStorage.setItem('kontinue-theme', isDark ? 'light' : 'dark')
  document.getElementById('theme-icon').innerHTML = isDark ? '&#9790;' : '&#9788;'
}

(function initTheme() {
  const saved = localStorage.getItem('kontinue-theme')
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const theme = saved || (prefersDark ? 'dark' : 'light')
  document.documentElement.setAttribute('data-theme', theme)
  document.getElementById('theme-icon').innerHTML = theme === 'dark' ? '&#9788;' : '&#9790;'
})()

// ── Signal dispatch ──────────────────────────────────────────────────────────

async function sendSignal() {
  const input = document.getElementById('signal-input')
  const type  = document.getElementById('signal-type').value
  const content = input.value.trim()
  if (!content) return
  try {
    const res = await fetch('/api/signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, type })
    })
    if (res.ok) {
      input.value = ''
      showToast('Signal sent')
    } else {
      const data = await res.json()
      showToast('Error: ' + (data.error || res.status))
    }
  } catch(e) { showToast('Error: ' + e.message) }
}

// ── Add task ─────────────────────────────────────────────────────────────────

function toggleAddTask() {
  document.getElementById('add-task-form').classList.toggle('open')
}

async function submitTask() {
  const title = document.getElementById('new-task-title').value.trim()
  const desc  = document.getElementById('new-task-desc').value.trim()
  if (!title) return
  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description: desc || null })
    })
    if (res.ok) {
      document.getElementById('new-task-title').value = ''
      document.getElementById('new-task-desc').value = ''
      toggleAddTask()
      showToast('Task added')
    }
  } catch(e) { showToast('Error: ' + e.message) }
}

// ── Modal ────────────────────────────────────────────────────────────────────

function showModal(title, contentHtml) {
  document.getElementById('modal-title').textContent = title
  document.getElementById('modal-body').innerHTML = contentHtml
  document.getElementById('modal-overlay').classList.remove('hidden')
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden')
  document.getElementById('modal-body').innerHTML = ''
}

function showDecisionModal(id) {
  const d = (_lastData?.decisions || []).find(d => d.id === id)
  if (!d) return
  const parts = []
  if (d.rationale)    parts.push(\`<div class="modal-section"><div class="modal-label">Rationale</div><pre>\${esc(d.rationale)}</pre></div>\`)
  if (d.alternatives) parts.push(\`<div class="modal-section"><div class="modal-label">Alternatives Considered</div><pre>\${esc(d.alternatives)}</pre></div>\`)
  if (d.context)      parts.push(\`<div class="modal-section"><div class="modal-label">Context</div><pre>\${esc(d.context)}</pre></div>\`)
  if (d.files)        parts.push(\`<div class="modal-section"><div class="modal-label">Files</div><p class="modal-files">\${esc(d.files)}</p></div>\`)
  const tags = (d.tags || '').split(',').filter(Boolean).map(t => \`<span class="tag">\${esc(t.trim())}</span>\`).join(' ')
  if (tags)           parts.push(\`<div class="modal-section"><div class="modal-label">Tags</div>\${tags}</div>\`)
  const conf = confidenceBadge(d.confidence)
  if (conf)           parts.push(\`<div class="modal-section"><div class="modal-label">Confidence</div>\${conf}</div>\`)
  if (d.created_at)   parts.push(\`<div style="font-size:11px;color:var(--muted);margin-top:12px">\${d.created_at.slice(0,10)}</div>\`)
  showModal(d.summary, parts.join('') || '<div class="empty">No additional details</div>')
}

function showObservationModal(id) {
  const o = (_lastData?.observations || []).find(o => o.id === id)
  if (!o) return
  showModal('Observation', \`<div class="modal-section"><pre>\${esc(o.content)}</pre></div><div style="font-size:11px;color:var(--muted);margin-top:8px">\${fmtAge(o.created_at)}</div>\`)
}

function showHandoffModal() {
  const h = _lastData?.lastHandoff
  if (!h?.handoff_note) return
  const files = h.files_touched
    ? \`<div class="modal-section"><div class="modal-label">Files Touched</div><p class="modal-files">\${esc(h.files_touched)}</p></div>\`
    : ''
  const ended = h.ended_at ? \`<div style="font-size:11px;color:var(--muted);margin-top:12px">\${fmtAge(h.ended_at)}</div>\` : ''
  showModal('Last Handoff', \`<div class="modal-section"><pre>\${esc(h.handoff_note)}</pre></div>\${files}\${ended}\`)
}

function showPlanModal(id) {
  const p = (_lastData?.plans || []).find(p => p.id === id)
  if (!p) return
  const steps = p.steps || []
  const doneCnt = steps.filter(s => s.status === 'done').length
  const goal = p.goal ? \`<div class="modal-section"><div class="modal-label">Goal</div><pre>\${esc(p.goal)}</pre></div>\` : ''
  const prog  = \`<div class="modal-section"><div class="modal-label">Progress</div><span style="color:var(--muted)">\${doneCnt}/\${steps.length} steps done</span></div>\`
  const stepsHtml = steps.map(s => {
    const cls  = s.status === 'done' ? 'done' : s.status === 'in-progress' ? 'active' : ''
    const icon = s.status === 'done' ? '&#10003;' : s.status === 'in-progress' ? '&#9673;' : '&#9675;'
    return \`<div class="plan-step \${cls}" style="font-size:13px;padding:3px 0"><span class="step-icon">\${icon}</span>\${esc(s.content)}</div>\`
  }).join('')
  showModal(p.title, \`\${goal}\${prog}<div class="modal-section"><div class="modal-label">Steps</div>\${stepsHtml}</div>\`)
}

// ── Observations ─────────────────────────────────────────────────────────────

function renderObservations(obs) {
  const el = document.getElementById('observations-content')
  const cnt = document.getElementById('count-obs')
  if (!el) return
  cnt.textContent = obs.length ? '(' + obs.length + ')' : ''
  if (!obs.length) { el.innerHTML = '<div class="empty">none</div>'; return }
  el.innerHTML = obs.map(o => {
    const snippet = o.content.length > 100 ? esc(o.content.slice(0,100)) + '\u2026' : esc(o.content)
    const age = \`<span class="obs-age">\${fmtAge(o.created_at)}</span>\`
    const viewBtn = o.content.length > 100
      ? \`<button class="view-btn" onclick="showObservationModal(\${o.id})">View full &#8599;</button>\`
      : ''
    return \`<div class="obs-row">\${snippet} \${age}\${viewBtn}</div>\`
  }).join('')
}

// ── Pending signals ───────────────────────────────────────────────────────────

function renderPendingSignals(pending) {
  const card = document.getElementById('pending-signals-card')
  const el = document.getElementById('pending-signals-content')
  const cnt = document.getElementById('count-pending-sigs')
  if (!el || !card) return
  if (!pending || !pending.length) {
    card.style.display = 'none'
    return
  }
  card.style.display = 'block'
  cnt.textContent = '(' + pending.length + ')'
  el.innerHTML = pending.map(s => {
    const typeClass = s.type || 'message'
    return \`<div class="signal-pending-row">
      <span class="signal-type-badge \${typeClass}">\${(s.type || 'msg').toUpperCase()}</span>
      <div style="flex:1">
        <div class="signal-content">\${esc(s.content)}</div>
        <div class="signal-meta">\${fmtAge(s.created_at)} · \${esc(s.source || 'cli')}</div>
      </div>
      <button class="btn btn-sm btn-outline" onclick="ackSignal(\${s.id})" title="Acknowledge">&#10003;</button>
    </div>\`
  }).join('')
}

async function ackSignal(id) {
  try {
    await fetch('/api/signals/' + id + '/acknowledge', { method: 'POST' })
    showToast('Signal acknowledged')
  } catch(e) { showToast('Error: ' + e.message) }
}

// ── Answer question ──────────────────────────────────────────────────────────

function toggleAnswer(id) {
  const el = document.getElementById('answer-' + id)
  if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none'
}

async function submitAnswer(id) {
  const input = document.querySelector('#answer-' + id + ' input')
  const answer = input ? input.value.trim() : ''
  if (!answer) return
  try {
    const res = await fetch('/api/questions/' + id + '/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer })
    })
    if (res.ok) { showToast('Answer sent to agent') }
  } catch(e) { showToast('Error: ' + e.message) }
}

// ── Render functions ─────────────────────────────────────────────────────────

function renderTask(t, staleIds) {
  const desc = t.description ? \`<div class="task-desc">\${esc(t.description.slice(0,100))}\${t.description.length > 100 ? '...' : ''}</div>\` : ''
  const branch = t.branch && t.branch !== 'HEAD' ? \`<span style="color:var(--green)">&#x1f33f; \${esc(t.branch)}</span>\` : ''
  const age = \`<span>\${fmtAge(t.updated_at)}</span>\`
  const isStale = staleIds && staleIds.has(t.id)
  const staleTag = isStale ? \` <span class="tag red">stale</span>\` : ''

  let itemsHtml = ''
  const items = t.items || []
  if (items.length > 0) {
    const doneCnt = items.filter(i => i.done).length
    const pct = Math.round((doneCnt / items.length) * 100)
    const visibleItems = items.slice(0, 4).map(i =>
      \`<div class="task-item\${i.done ? ' done' : ''}">
        <span class="task-item-icon">\${i.done ? '&#10003;' : '&#9675;'}</span>
        <span style="color:var(--muted);font-size:10px">#\${i.id}</span>
        \${esc(i.content.length > 50 ? i.content.slice(0, 50) + '…' : i.content)}
      </div>\`
    ).join('')
    const more = items.length > 4 ? \`<div style="font-size:10px;color:var(--muted);margin-top:2px">+\${items.length - 4} more</div>\` : ''
    itemsHtml = \`<div class="task-items">
      \${visibleItems}\${more}
      <div class="task-items-progress">
        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:\${pct}%"></div></div>
        <span class="progress-label">\${doneCnt}/\${items.length}</span>
      </div>
    </div>\`
  }

  let depsHtml = ''
  const blockers = t.blockers || []
  const blocking = t.blocking || []
  if (blockers.length > 0) {
    const unresolvedBlockers = blockers.filter(b => b.status !== 'done' && b.status !== 'abandoned')
    if (unresolvedBlockers.length > 0) {
      depsHtml += \`<div style="font-size:11px;color:var(--red);margin-top:4px">⛔ Blocked by: \${unresolvedBlockers.map(b => '#' + b.id).join(', ')}</div>\`
    }
  }
  if (blocking.length > 0) {
    depsHtml += \`<div style="font-size:11px;color:var(--yellow);margin-top:2px">🔒 Blocks: \${blocking.map(b => '#' + b.id).join(', ')}</div>\`
  }

  return \`<div class="task-card\${isStale ? ' stale' : ''}">
    <div class="task-title"><span style="color:var(--muted);font-weight:400">#\${t.id}</span> \${esc(t.title)}\${staleTag}</div>
    \${desc}
    <div class="task-meta">\${age}\${branch}</div>
    \${depsHtml}
    \${itemsHtml}
  </div>\`
}

function renderTasks(tasks, containerId, countId, staleIds) {
  const el = document.getElementById(containerId)
  const cnt = document.getElementById(countId)
  if (cnt) cnt.textContent = tasks.length ? '(' + tasks.length + ')' : ''
  el.innerHTML = tasks.length ? tasks.map(t => renderTask(t, staleIds)).join('') : '<div class="empty">none</div>'
}

function renderCheckpoint(cp) {
  const el = document.getElementById('checkpoint-content')
  if (!cp) { el.innerHTML = '<div class="empty">no checkpoint yet</div>'; return }
  const statusClass = cp.ageMin > 30 ? 'red' : cp.ageMin > 15 ? 'yellow' : 'green'
  const warn = \`<div class="tag \${statusClass}" style="margin-bottom:6px">\${cp.ageMin}m ago\${cp.ageMin > 30 ? ' (stale)' : ''}</div>\`
  const next = cp.next_step ? \`<div class="checkpoint-next">Next: \${esc(cp.next_step)}</div>\` : ''
  const files = cp.files_active ? \`<div class="checkpoint-meta">Files: \${esc(cp.files_active)}</div>\` : ''
  el.innerHTML = \`<div class="checkpoint-box">
    \${warn}
    <div class="checkpoint-progress">\${esc(cp.progress)}</div>
    \${next}\${files}
  </div>\`
}

function renderQuestions(qs) {
  const el = document.getElementById('questions-content')
  const cnt = document.getElementById('count-q')
  cnt.textContent = qs.length ? '(' + qs.length + ')' : ''
  if (!qs.length) { el.innerHTML = '<div class="empty">none</div>'; return }
  el.innerHTML = qs.map(q => {
    return \`<div class="question-row">
      <div>\${esc(q.question)} <span class="question-age">\${fmtAge(q.created_at)}</span></div>
      <button class="btn btn-sm btn-outline" onclick="toggleAnswer(\${q.id})" style="margin-top:4px">Answer</button>
      <div class="question-answer-form" id="answer-\${q.id}" style="display:none">
        <input type="text" placeholder="Your answer..." onkeydown="if(event.key==='Enter')submitAnswer(\${q.id})">
        <button class="btn btn-sm" onclick="submitAnswer(\${q.id})">Send</button>
      </div>
    </div>\`
  }).join('')
}

function renderPlans(plans) {
  const el = document.getElementById('plans-content')
  const cnt = document.getElementById('count-plans')
  cnt.textContent = plans.length ? '(' + plans.length + ')' : ''
  if (!plans.length) { el.innerHTML = '<div class="empty">none</div>'; return }
  el.innerHTML = plans.map(p => {
    const steps = (p.steps || [])
    const done = steps.filter(s => s.status === 'done').length
    const goalSnippet = p.goal ? \`<div style="font-size:12px;color:var(--muted);margin-bottom:4px;">\${esc(p.goal.length > 80 ? p.goal.slice(0,80) + '\u2026' : p.goal)}</div>\` : ''
    return \`<div style="margin-bottom:12px">
      <div class="plan-title">\${esc(p.title)} <span class="tag \${p.status === 'active' ? 'green' : ''}">\${p.status}</span></div>
      \${goalSnippet}
      <div style="font-size:11px;color:var(--muted)">\${done}/\${steps.length} steps done</div>
      <button class="view-btn" onclick="showPlanModal(\${p.id})">View all steps &#8599;</button>
    </div>\`
  }).join('')
}

function renderDecisions(decisions) {
  const el = document.getElementById('decisions-content')
  const cnt = document.getElementById('count-dec')
  cnt.textContent = '(' + decisions.length + ')'
  if (!decisions.length) { el.innerHTML = '<div class="empty">none</div>'; return }
  el.innerHTML = decisions.slice(0, 20).map(d => {
    const tags = (d.tags || '').split(',').filter(Boolean).map(t =>
      \`<span class="tag">\${esc(t.trim())}</span>\`
    ).join('')
    const hasDetail = d.rationale || d.alternatives || d.context || d.files
    const summary = d.summary.length > 90 ? d.summary.slice(0,90) + '\u2026' : d.summary
    const viewBtn = hasDetail
      ? \`<button class="view-btn" onclick="showDecisionModal(\${d.id})">View details &#8599;</button>\`
      : ''
    return \`<div class="decision-row">
      <div class="decision-date">\${d.created_at.slice(0,10)}</div>
      <div class="decision-summary" style="flex:1">
        \${esc(summary)} \${confidenceBadge(d.confidence)}
        \${tags ? \`<div class="decision-tags">\${tags}</div>\` : ''}
        \${viewBtn}
      </div>
    </div>\`
  }).join('')
}

function renderHandoff(handoff) {
  const el = document.getElementById('handoff-content')
  if (!handoff?.handoff_note) { el.innerHTML = '<div class="empty">no previous session</div>'; return }
  const preview = handoff.handoff_note.length > 160
    ? esc(handoff.handoff_note.slice(0,160)) + '\u2026'
    : esc(handoff.handoff_note)
  const ended = handoff.ended_at ? \`<div style="font-size:11px;color:var(--muted);margin-bottom:4px">\${fmtAge(handoff.ended_at)}</div>\` : ''
  el.innerHTML = \`\${ended}<div class="handoff-summary" style="max-height:none">\${preview}</div><button class="view-btn" onclick="showHandoffModal()">View full handoff &#8599;</button>\`
}

function renderActivity(activity) {
  const el = document.getElementById('activity-content')
  if (!activity || !activity.length) { el.innerHTML = '<div class="empty">no activity yet</div>'; return }
  el.innerHTML = activity.map(a => {
    const text = esc(a.summary).slice(0, 120) + (a.summary.length > 120 ? '...' : '')
    return \`<div class="activity-item">
      <div class="activity-dot \${a.type}"></div>
      <div class="activity-text">\${text}</div>
      <div class="activity-time">\${fmtAge(a.created_at)}</div>
    </div>\`
  }).join('')
}

function renderHeader(data) {
  const sub = document.getElementById('proj-name')
  if (sub) sub.textContent = data.project.name

  const git = document.getElementById('git-info')
  git.textContent = data.git.branch ? '\\u{1F33F} ' + data.git.branch : '-'

  const sb = document.getElementById('session-badge')
  if (data.session) {
    const cpAge = data.checkpoint ? data.checkpoint.ageMin : 999
    const tc = data.session.toolCalls || 0
    const suffix = tc > 0 ? ' · ' + tc + ' calls' : ''
    if (tc >= 60 || data.session.ageMin >= 90) {
      sb.className = 'badge red'
      sb.innerHTML = '<span class="dot"></span> LONG ' + data.session.ageMin + 'm' + suffix
    } else if (tc >= 30 || data.session.ageMin >= 45) {
      sb.className = 'badge yellow'
      sb.innerHTML = '<span class="dot"></span> Aging ' + data.session.ageMin + 'm' + suffix
    } else if (cpAge <= 5) {
      sb.className = 'badge green'
      sb.innerHTML = '<span class="dot pulse"></span> Active ' + data.session.ageMin + 'm' + suffix
    } else if (cpAge <= 30) {
      sb.className = 'badge yellow'
      sb.innerHTML = '<span class="dot"></span> Idle ' + data.session.ageMin + 'm' + suffix
    } else {
      sb.className = 'badge red'
      sb.innerHTML = '<span class="dot"></span> Stale ' + data.session.ageMin + 'm' + suffix
    }
  } else {
    sb.className = 'badge'
    sb.textContent = 'Offline'
  }

  const cpb = document.getElementById('cp-badge')
  if (data.checkpoint) {
    const stale = data.checkpoint.ageMin > 30
    cpb.className = 'badge ' + (stale ? 'red' : data.checkpoint.ageMin > 15 ? 'yellow' : 'green')
    cpb.textContent = 'Checkpoint ' + data.checkpoint.ageMin + 'm'
  } else {
    cpb.className = 'badge'
    cpb.textContent = 'No checkpoint'
  }

  // Signal badge
  const sigBadge = document.getElementById('signal-badge')
  const pending = data.signals?.pending || []
  if (pending.length > 0) {
    sigBadge.style.display = 'inline-flex'
    sigBadge.className = 'badge yellow'
    sigBadge.textContent = pending.length + ' signal' + (pending.length > 1 ? 's' : '') + ' pending'
  } else {
    sigBadge.style.display = 'none'
  }

  // Health badge
  const hb = document.getElementById('health-badge')
  const health = data.health
  if (health) {
    const hClass = health.level === 'good' ? 'green' : health.level === 'fair' ? 'yellow' : 'red'
    hb.className = 'badge ' + hClass
    hb.textContent = health.level.toUpperCase()
    hb.title = health.reasons.length ? health.reasons.join(', ') : 'All clear'
  } else {
    hb.className = 'badge'
    hb.textContent = '-'
    hb.title = ''
  }
}

// ── Data store (for modal lookups) ───────────────────────────────────────────
let _lastData = null

// ── Main render ──────────────────────────────────────────────────────────────

function render(data) {
  _lastData = data
  renderHeader(data)
  const staleIds = new Set((data.staleTasks || []).map(t => t.id))
  renderTasks(data.tasks.inProgress, 'col-inprogress', 'count-ip', staleIds)
  renderTasks(data.tasks.todo,       'col-todo',       'count-todo', null)
  renderTasks(data.tasks.done,       'col-done',       'count-done', null)
  renderCheckpoint(data.checkpoint)
  renderQuestions(data.questions)
  renderPlans(data.plans)
  renderDecisions(data.decisions)
  renderObservations(data.observations || [])
  renderHandoff(data.lastHandoff)
  renderActivity(data.activity)
  renderPendingSignals(data.signals?.pending || [])

  document.getElementById('status-left').textContent =
    'Updated ' + new Date(data.generatedAt).toLocaleTimeString()
  document.getElementById('status-right').textContent =
    data.stats.chunks + ' chunks' +
    (data.health ? ' · health: ' + data.health.level : '') +
    (data.session?.toolCalls ? ' · ' + data.session.toolCalls + ' tool calls' : '')
}

// ── SSE connection ───────────────────────────────────────────────────────────

let es = null

function connectSSE() {
  es = new EventSource('/api/events')

  es.addEventListener('full', (e) => {
    try { render(JSON.parse(e.data)) } catch(err) { console.error('SSE full parse error', err) }
  })

  es.addEventListener('update', (e) => {
    try { render(JSON.parse(e.data)) } catch(err) { console.error('SSE update parse error', err) }
  })

  es.onerror = () => {
    document.getElementById('status-left').textContent = 'Reconnecting...'
  }

  es.onopen = () => {
    document.getElementById('status-left').textContent = 'Connected'
  }
}

connectSSE()
// ── Keyboard shortcuts ───────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  // '/' focuses signal input (unless already in an input)
  if (e.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName || '')) {
    e.preventDefault()
    const inp = document.getElementById('signal-input')
    if (inp) inp.focus()
  }
  // Escape: close modal first, then clear focus
  if (e.key === 'Escape') {
    const overlay = document.getElementById('modal-overlay')
    if (overlay && !overlay.classList.contains('hidden')) { closeModal(); return }
    document.activeElement?.blur()
    document.getElementById('add-task-form')?.classList.remove('open')
  }
})</script>
</body>
</html>`
}
