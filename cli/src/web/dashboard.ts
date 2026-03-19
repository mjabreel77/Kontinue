export function getDashboardHtml(projectName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kontinue</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #fafafa;
    --bg2: #ffffff;
    --bg3: #f4f4f5;
    --border: #e4e4e7;
    --text: #09090b;
    --muted: #71717a;
    --green: #16a34a;
    --yellow: #ca8a04;
    --red: #dc2626;
    --blue: #2563eb;
    --purple: #7c3aed;
    --cyan: #0891b2;
    --orange: #ea580c;
    --signal-bg: #fefce8;
    --signal-border: #eab308;
    --ring: #a1a1aa;
    --radius: 0.5rem;
  }

  [data-theme="dark"] {
    --bg: #09090b;
    --bg2: #0c0c0d;
    --bg3: #18181b;
    --border: #27272a;
    --text: #fafafa;
    --muted: #a1a1aa;
    --green: #22c55e;
    --yellow: #eab308;
    --red: #ef4444;
    --blue: #3b82f6;
    --purple: #a78bfa;
    --cyan: #06b6d4;
    --orange: #f97316;
    --signal-bg: #1c1917;
    --signal-border: #854d0e;
    --ring: #52525b;
    --radius: 0.5rem;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    min-height: 100vh;
    padding-bottom: 40px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* Thin modern scrollbar */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--muted) 30%, transparent); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--muted) 50%, transparent); }
  * { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--muted) 30%, transparent) transparent; }

  /* Custom select styling */
  select {
    appearance: none; -webkit-appearance: none; -moz-appearance: none;
    background: var(--bg2) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 8px center;
    padding-right: 28px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-family: inherit;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    outline: none;
  }
  select:hover { border-color: var(--ring); }
  select:focus { border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 15%, transparent); }
  [data-theme="dark"] select {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  }

  header {
    background: color-mix(in srgb, var(--bg2) 85%, transparent);
    border-bottom: 1px solid var(--border);
    padding: 12px 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    position: sticky;
    top: 0;
    z-index: 10;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  header .brand { display: flex; flex-direction: column; gap: 0; }
  header h1 { font-size: 15px; font-weight: 600; color: var(--text); letter-spacing: -0.025em; }
  header .proj-sub { font-size: 11px; color: var(--muted); font-weight: 400; }
  header .meta { color: var(--muted); font-size: 12px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  header .badge {
    display: inline-flex; align-items: center; gap: 4px;
    background: var(--bg3); border: 1px solid var(--border);
    border-radius: 9999px; padding: 2px 10px; font-size: 11px; white-space: nowrap;
    font-weight: 500; transition: all 0.15s ease;
  }
  header .badge.green { background: color-mix(in srgb, var(--green) 10%, var(--bg2)); border-color: color-mix(in srgb, var(--green) 25%, var(--border)); color: var(--green); }
  header .badge.yellow { background: color-mix(in srgb, var(--yellow) 10%, var(--bg2)); border-color: color-mix(in srgb, var(--yellow) 25%, var(--border)); color: var(--yellow); }
  header .badge.red { background: color-mix(in srgb, var(--red) 10%, var(--bg2)); border-color: color-mix(in srgb, var(--red) 25%, var(--border)); color: var(--red); }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

  .pulse { animation: pulse 2s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

  .theme-toggle {
    margin-left: auto;
    background: transparent; border: 1px solid var(--border);
    border-radius: var(--radius); padding: 6px 10px; font-size: 13px;
    cursor: pointer; color: var(--muted); transition: all 0.15s ease;
  }
  .theme-toggle:hover { background: var(--bg3); color: var(--text); }

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
    flex: 1; padding: 8px 12px; border: 1px solid var(--border);
    border-radius: var(--radius); font-size: 13px; background: transparent;
    color: var(--text); outline: none; min-width: 0;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .signal-bar input[type="text"]:focus { border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 15%, transparent); }
  .signal-bar select {
    padding: 8px 10px; font-size: 12px;
  }
  .signal-bar button, .btn {
    padding: 8px 16px; border: 1px solid transparent;
    border-radius: var(--radius); font-size: 13px; cursor: pointer;
    background: var(--text); color: var(--bg2); font-weight: 500; white-space: nowrap;
    transition: opacity 0.15s ease;
  }
  .signal-bar button:hover, .btn:hover { opacity: 0.85; }
  .btn-sm { padding: 5px 12px; font-size: 12px; border-radius: calc(var(--radius) - 2px); }
  .btn-outline { background: transparent; color: var(--text); border: 1px solid var(--border); }
  .btn-outline:hover { background: var(--bg3); opacity: 1; }
  .signal-bar .label { font-size: 11px; color: var(--muted); white-space: nowrap; font-weight: 500; letter-spacing: 0.01em; }

  main { padding: 24px; max-width: 1440px; margin: 0 auto; }

  .layout { display: grid; grid-template-columns: 1fr 340px; gap: 20px; }
  @media (max-width: 1000px) { .layout { grid-template-columns: 1fr; } }

  .grid { display: grid; gap: 16px; }
  .grid-3 { grid-template-columns: repeat(3, 1fr); }
  .grid-2 { grid-template-columns: repeat(2, 1fr); }
  @media (max-width: 900px) { .grid-3 { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 600px) { .grid-3, .grid-2 { grid-template-columns: 1fr; } }

  .card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) + 4px);
    overflow: hidden;
  }

  .card-header {
    padding: 12px 16px;
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

  .card-body { padding: 14px 16px; }

  /* Kanban board columns */
  .board-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  @media (max-width: 900px) { .board-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 600px) { .board-grid { grid-template-columns: 1fr; } }

  .board-col {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) + 4px);
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .board-col-header {
    padding: 10px 16px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    min-height: 42px; box-sizing: border-box;
  }
  .board-col-header .col-label {
    font-size: 12px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.04em; display: flex; align-items: center; gap: 8px;
    color: var(--muted);
  }
  .board-col-header .col-label .col-count {
    font-size: 10px; font-weight: 600; min-width: 20px; height: 20px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 9999px; background: var(--bg3); color: var(--muted);
    border: 1px solid var(--border);
  }
  .board-col-body { padding: 10px 12px; flex: 1; background: var(--bg); }

  .task-card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 14px;
    margin-bottom: 8px;
    transition: all 0.15s ease;
    position: relative;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .task-card:hover { border-color: var(--ring); box-shadow: 0 2px 8px rgba(0,0,0,0.06); transform: translateY(-1px); }
  [data-theme="dark"] .task-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.25); }
  .task-card:last-child { margin-bottom: 0; }
  .task-card.stale {
    border-color: color-mix(in srgb, var(--red) 40%, var(--border));
    border-left: 3px solid var(--red);
    background: color-mix(in srgb, var(--red) 3%, var(--bg2));
  }

  .task-title { font-weight: 500; font-size: 13px; margin-bottom: 4px; line-height: 1.4; }
  .task-title .task-id { color: var(--muted); font-weight: 400; font-size: 12px; margin-right: 4px; }
  .task-desc  { font-size: 12px; color: var(--muted); margin-bottom: 6px; line-height: 1.5; }
  .task-meta  { font-size: 11px; color: var(--muted); display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

  .tag {
    display: inline-block; background: var(--bg3);
    border: 1px solid var(--border); border-radius: 9999px;
    padding: 1px 8px; font-size: 11px; font-weight: 500;
  }
  .tag.green  { background: color-mix(in srgb, var(--green) 10%, var(--bg2)); border-color: color-mix(in srgb, var(--green) 25%, var(--border)); color: var(--green); }
  .tag.blue   { background: color-mix(in srgb, var(--blue) 10%, var(--bg2)); border-color: color-mix(in srgb, var(--blue) 25%, var(--border)); color: var(--blue); }
  .tag.yellow { background: color-mix(in srgb, var(--yellow) 10%, var(--bg2)); border-color: color-mix(in srgb, var(--yellow) 25%, var(--border)); color: var(--yellow); }
  .tag.red    { background: color-mix(in srgb, var(--red) 10%, var(--bg2)); border-color: color-mix(in srgb, var(--red) 25%, var(--border)); color: var(--red); }
  .tag.purple { background: color-mix(in srgb, var(--purple) 10%, var(--bg2)); border-color: color-mix(in srgb, var(--purple) 25%, var(--border)); color: var(--purple); }

  .decision-row {
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .decision-row:last-child { border-bottom: none; }
  .decision-date { color: var(--muted); font-size: 11px; white-space: nowrap; min-width: 70px; }
  .decision-status { font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 9999px; margin-left: 4px; }
  .decision-status.active     { color: var(--green); border: 1px solid color-mix(in srgb, var(--green) 25%, var(--border)); background: color-mix(in srgb, var(--green) 8%, var(--bg2)); }
  .decision-status.superseded { color: var(--yellow); border: 1px solid color-mix(in srgb, var(--yellow) 25%, var(--border)); text-decoration: line-through; background: color-mix(in srgb, var(--yellow) 8%, var(--bg2)); }
  .decision-status.archived   { color: var(--muted); border: 1px solid var(--border); background: var(--bg3); }

  /* Decision graph */
  .decision-chain { margin-bottom: 12px; padding: 10px 12px; background: var(--bg3); border-radius: var(--radius); border: 1px solid var(--border); }
  .chain-node { display: flex; align-items: center; gap: 6px; font-size: 12px; padding: 3px 0; }
  .chain-node.superseded .chain-summary { text-decoration: line-through; color: var(--muted); }
  .chain-node.active .chain-summary { color: var(--green); font-weight: 600; }
  .chain-arrow { color: var(--muted); font-size: 14px; padding-left: 12px; }
  .decision-summary { font-size: 13px; flex: 1; }
  .decision-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 3px; }

  .replay-controls { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .replay-controls button { background: var(--bg3); border: 1px solid var(--border); border-radius: var(--radius); padding: 6px 12px; cursor: pointer; color: var(--text); font-size: 13px; transition: all 0.15s ease; }
  .replay-controls button:hover { background: var(--border); }
  .replay-controls button:disabled { opacity: 0.4; cursor: default; }
  .replay-counter { font-size: 12px; color: var(--muted); min-width: 60px; text-align: center; }
  .replay-session-picker { padding: 6px 8px; font-size: 12px; }
  .replay-event { padding: 8px 10px; border-radius: var(--radius); margin-bottom: 4px; font-size: 12px; background: var(--bg3); border-left: 3px solid var(--border); transition: all 0.15s ease; }
  .replay-event.active { border-left-color: var(--blue); background: color-mix(in srgb, var(--blue) 8%, var(--bg)); }
  .replay-event .replay-type { font-weight: 600; text-transform: uppercase; font-size: 10px; margin-right: 6px; }
  .replay-event .replay-type.checkpoint { color: var(--blue); }
  .replay-event .replay-type.decision { color: #a78bfa; }
  .replay-event .replay-type.observation { color: var(--yellow); }
  .replay-event .replay-detail { color: var(--muted); font-size: 11px; margin-top: 2px; }
  .replay-handoff { font-size: 12px; padding: 8px 10px; background: var(--bg3); border-radius: var(--radius); margin-top: 6px; color: var(--muted); border-left: 3px solid var(--green); }

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
    flex: 1; padding: 6px 10px; border: 1px solid var(--border);
    border-radius: var(--radius); font-size: 12px; background: transparent;
    color: var(--text); outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .checkpoint-box {
    background: var(--bg3);
    border-radius: var(--radius);
    padding: 12px 14px;
    font-size: 13px;
    border: 1px solid var(--border);
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
    display: none; padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg3);
  }
  .add-task-form.open { display: block; }
  .add-task-form input, .add-task-form textarea {
    width: 100%; padding: 8px 10px; border: 1px solid var(--border);
    border-radius: var(--radius); font-size: 12px; background: transparent;
    color: var(--text); outline: none; margin-bottom: 8px;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .add-task-form input:focus, .add-task-form textarea:focus { border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 15%, transparent); }
  .add-task-form textarea { resize: vertical; min-height: 48px; font-family: inherit; }
  .add-task-form .actions { display: flex; gap: 6px; justify-content: flex-end; }

  .empty { color: var(--muted); font-size: 13px; padding: 8px 0; font-style: italic; }

  #status-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: color-mix(in srgb, var(--bg2) 90%, transparent); border-top: 1px solid var(--border);
    padding: 5px 24px; font-size: 11px; color: var(--muted);
    display: flex; justify-content: space-between;
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  }

  .section-gap { margin-bottom: 20px; }
  .toast {
    position: fixed; bottom: 48px; right: 24px;
    background: var(--text); color: var(--bg2); padding: 10px 18px;
    border-radius: var(--radius); font-size: 13px; font-weight: 500;
    opacity: 0; transition: opacity 0.2s ease, transform 0.2s ease;
    transform: translateY(4px);
    z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
  .toast.show { opacity: 1; transform: translateY(0); }

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
    display: inline-block; background: var(--bg3);
    border: 1px solid var(--border); border-radius: 9999px;
    padding: 1px 6px; font-size: 10px; color: var(--muted); margin-top: 3px;
  }

  /* Decisions */
  .decision-row:hover { background: var(--bg3); border-radius: var(--radius); }
  .view-btn {
    font-size: 11px; color: var(--muted); cursor: pointer; background: none;
    border: none; padding: 0; text-decoration: none; display: inline-flex; align-items: center; gap: 2px; margin-top: 4px;
    transition: color 0.15s ease;
  }
  .view-btn:hover { color: var(--text); }

  /* Modal */
  .modal-overlay {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    animation: fadeIn 0.15s ease;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  .modal-overlay.hidden { display: none; }
  .modal {
    background: var(--bg2); border: 1px solid var(--border);
    border-radius: calc(var(--radius) + 6px); max-width: 720px; width: 100%;
    max-height: 82vh; overflow: hidden;
    display: flex; flex-direction: column;
    box-shadow: 0 16px 70px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05);
    animation: slideUp 0.2s ease;
  }
  @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .modal-header {
    padding: 16px 20px; border-bottom: 1px solid var(--border);
    display: flex; align-items: flex-start; gap: 10px;
  }
  .modal-title { font-weight: 600; font-size: 15px; flex: 1; line-height: 1.5; word-break: break-word; letter-spacing: -0.01em; }
  .modal-close {
    background: none; border: none; cursor: pointer;
    color: var(--muted); font-size: 20px; line-height: 1;
    padding: 2px 6px; border-radius: var(--radius); flex-shrink: 0;
    transition: all 0.15s ease;
  }
  .modal-close:hover { background: var(--bg3); color: var(--text); }
  .modal-body { padding: 20px; overflow-y: auto; flex: 1; font-size: 13px; line-height: 1.75; }
  .modal-section { margin-bottom: 16px; }
  .modal-section:last-child { margin-bottom: 0; }
  .modal-label {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--muted); margin-bottom: 6px;
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
    font-size: 10px; font-weight: 600; padding: 2px 6px;
    border-radius: 9999px; white-space: nowrap; flex-shrink: 0; margin-top: 2px;
  }
  .signal-type-badge.message  { background: var(--bg3); color: var(--muted); border: 1px solid var(--border); }
  .signal-type-badge.priority { background: color-mix(in srgb, var(--yellow) 12%, var(--bg2)); color: var(--yellow); border: 1px solid color-mix(in srgb, var(--yellow) 25%, var(--border)); }
  .signal-type-badge.abort    { background: color-mix(in srgb, var(--red) 12%, var(--bg2)); color: var(--red); border: 1px solid color-mix(in srgb, var(--red) 25%, var(--border)); }
  .signal-type-badge.answer   { background: color-mix(in srgb, var(--green) 12%, var(--bg2)); color: var(--green); border: 1px solid color-mix(in srgb, var(--green) 25%, var(--border)); }
  .signal-content { flex: 1; word-break: break-word; color: var(--text); }
  .signal-meta { color: var(--muted); font-size: 10px; }

  /* Signal history */
  .signal-history-filters { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
  .signal-history-filters select { font-size: 11px; padding: 4px 8px; }
  .signal-history-row {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 6px 0; border-bottom: 1px solid var(--border);
    font-size: 12px;
  }
  .signal-history-row:last-child { border-bottom: none; }
  .signal-status-badge {
    font-size: 9px; font-weight: 500; padding: 2px 6px;
    border-radius: 9999px; white-space: nowrap;
  }
  .signal-status-badge.pending      { background: color-mix(in srgb, var(--yellow) 10%, var(--bg2)); color: var(--yellow); border: 1px solid color-mix(in srgb, var(--yellow) 25%, var(--border)); }
  .signal-status-badge.delivered    { background: color-mix(in srgb, var(--cyan) 10%, var(--bg2)); color: var(--cyan); border: 1px solid color-mix(in srgb, var(--cyan) 25%, var(--border)); }
  .signal-status-badge.acknowledged { background: color-mix(in srgb, var(--green) 10%, var(--bg2)); color: var(--green); border: 1px solid color-mix(in srgb, var(--green) 25%, var(--border)); }
  .signal-timing { color: var(--muted); font-size: 10px; font-family: monospace; }
  .signal-agent-reply { font-size: 11px; color: var(--cyan); margin-top: 3px; padding: 4px 8px; background: var(--bg3); border-left: 2px solid var(--cyan); border-radius: calc(var(--radius) - 2px); }
  .signal-history-pager { display: flex; justify-content: center; gap: 8px; margin-top: 8px; }

  /* Velocity metrics */
  .velocity-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
  .velocity-stat { text-align: center; padding: 12px 8px; background: var(--bg3); border-radius: var(--radius); border: 1px solid var(--border); }
  .velocity-stat .stat-value { font-size: 28px; font-weight: 700; color: var(--text); line-height: 1.2; letter-spacing: -0.025em; }
  .velocity-stat .stat-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; margin-top: 2px; }
  .velocity-sub { font-size: 11px; color: var(--muted); text-align: center; margin-top: 10px; }

  /* Session timeline */
  .timeline { position: relative; padding-left: 20px; }
  .timeline::before { content: ''; position: absolute; left: 6px; top: 0; bottom: 0; width: 2px; background: var(--border); }
  .timeline-event { position: relative; padding: 4px 0 10px 0; font-size: 12px; }
  .timeline-event::before {
    content: ''; position: absolute; left: -18px; top: 8px;
    width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--bg2);
    box-shadow: 0 0 0 1px var(--border);
  }
  .timeline-event.checkpoint::before { background: var(--blue); }
  .timeline-event.task::before       { background: var(--green); }
  .timeline-event.decision::before   { background: var(--purple); }
  .timeline-event.signal::before     { background: var(--orange); }
  .timeline-event.observation::before { background: var(--yellow); }
  .timeline-time { font-size: 10px; color: var(--muted); font-family: monospace; }
  .timeline-summary { color: var(--text); word-break: break-word; }
  .timeline-detail { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .timeline-type { font-size: 9px; font-weight: 600; text-transform: uppercase; margin-right: 4px; }
  .timeline-type.checkpoint  { color: var(--blue); }
  .timeline-type.task        { color: var(--green); }
  .timeline-type.decision    { color: var(--purple); }
  .timeline-type.signal      { color: var(--orange); }
  .timeline-type.observation { color: var(--yellow); }

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
    flex: 1; height: 6px; background: var(--bg3);
    border-radius: 9999px; overflow: hidden; border: 1px solid var(--border);
  }
  .progress-bar-fill { height: 100%; background: var(--green); border-radius: 9999px; transition: width 0.3s ease; }
  .progress-label { font-size: 10px; color: var(--muted); white-space: nowrap; }

  /* Fullscreen board */
  .board-fullscreen {
    position: fixed; inset: 0; z-index: 50;
    background: var(--bg); padding: 24px;
    overflow-y: auto;
    animation: fadeIn 0.15s ease;
  }
  .board-fullscreen .board-grid { min-height: calc(100vh - 80px); align-items: stretch; }
  .board-fullscreen .board-col-body { max-height: calc(100vh - 160px); overflow-y: auto; }
  .fullscreen-bar {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 16px;
  }
  .fullscreen-bar h2 { font-size: 16px; font-weight: 600; letter-spacing: -0.02em; }

  /* Show more toggle */
  .show-more-btn {
    display: block; width: 100%; padding: 6px 0; margin-top: 4px;
    background: none; border: 1px dashed var(--border); border-radius: var(--radius);
    color: var(--muted); font-size: 11px; cursor: pointer; text-align: center;
    transition: all 0.15s ease; font-weight: 500;
  }
  .show-more-btn:hover { border-color: var(--ring); color: var(--text); background: var(--bg3); }

  /* Clickable task card */
  .task-card { cursor: pointer; }
  .task-card:active { transform: scale(0.995); }
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
      <div class="section-gap" id="board-wrapper">
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:8px">
          <button class="btn btn-sm btn-outline" onclick="toggleAddTask()">+ Add Task</button>
          <button class="btn btn-sm btn-outline" onclick="toggleFullscreen()" id="fullscreen-btn" title="Fullscreen board">&#x26F6; Fullscreen</button>
        </div>
        <div class="board-grid" id="board">
          <div class="board-col">
            <div class="board-col-header">
              <span class="col-label">Todo <span class="col-count" id="count-todo">0</span></span>
            </div>
            <div class="add-task-form" id="add-task-form">
              <input type="text" id="new-task-title" placeholder="Task title...">
              <textarea id="new-task-desc" placeholder="Description (what does done look like?)"></textarea>
              <div class="actions">
                <button class="btn btn-sm btn-outline" onclick="toggleAddTask()">Cancel</button>
                <button class="btn btn-sm" onclick="submitTask()">Add Task</button>
              </div>
            </div>
            <div class="board-col-body" id="col-todo"><div class="empty">No tasks</div></div>
          </div>
          <div class="board-col">
            <div class="board-col-header">
              <span class="col-label">In Progress <span class="col-count" id="count-ip">0</span></span>
            </div>
            <div class="board-col-body" id="col-inprogress"><div class="empty">No tasks</div></div>
          </div>
          <div class="board-col">
            <div class="board-col-header">
              <span class="col-label">Done <span class="col-count" id="count-done">0</span></span>
            </div>
            <div class="board-col-body" id="col-done"><div class="empty">No tasks</div></div>
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

      <!-- Row 3b: Decision Lineage Graph -->
      <div class="section-gap" id="decision-graph-card" style="display:none">
        <div class="card">
          <div class="card-header">Decision Lineage <span id="count-chains" style="color:var(--muted);font-weight:400"></span></div>
          <div class="card-body" id="decision-graph-content"></div>
        </div>
      </div>

      <!-- Row 4: Velocity Metrics -->
      <div class="section-gap">
        <div class="grid grid-2">
          <div class="card">
            <div class="card-header">Velocity</div>
            <div class="card-body" id="velocity-content"><div class="empty">loading...</div></div>
          </div>
          <div class="card">
            <div class="card-header">Session Timeline</div>
            <div class="card-body" id="timeline-content" style="max-height:300px;overflow-y:auto"><div class="empty">loading...</div></div>
          </div>
        </div>
      </div>

      <!-- Row 5: Replay Mode -->
      <div class="section-gap" id="replay-card" style="display:none">
        <div class="card">
          <div class="card-header">Session Replay</div>
          <div class="card-body">
            <div class="replay-controls">
              <select class="replay-session-picker" id="replay-session-select" onchange="selectReplaySession()"></select>
              <button id="replay-prev" onclick="replayStep(-1)" disabled>&larr; Prev</button>
              <span class="replay-counter" id="replay-counter">0 / 0</span>
              <button id="replay-next" onclick="replayStep(1)" disabled>Next &rarr;</button>
            </div>
            <div id="replay-events"></div>
            <div id="replay-handoff"></div>
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
      <div class="card section-gap">
        <div class="card-header">Signal History</div>
        <div class="card-body">
          <div class="signal-history-filters">
            <select id="sig-filter-type" onchange="loadSignalHistory()">
              <option value="">All types</option>
              <option value="message">Message</option>
              <option value="priority">Priority</option>
              <option value="abort">Abort</option>
              <option value="answer">Answer</option>
            </select>
            <select id="sig-filter-status" onchange="loadSignalHistory()">
              <option value="">All status</option>
              <option value="pending">Pending</option>
              <option value="delivered">Delivered</option>
              <option value="acknowledged">Acknowledged</option>
            </select>
            <select id="sig-filter-source" onchange="loadSignalHistory()">
              <option value="">All sources</option>
              <option value="cli">CLI</option>
              <option value="web">Web</option>
            </select>
          </div>
          <div id="signal-history-content"><div class="empty">loading...</div></div>
          <div class="signal-history-pager" id="signal-history-pager" style="display:none">
            <button class="btn btn-sm btn-outline" id="sig-prev" onclick="sigHistoryPage(-1)">&laquo; Prev</button>
            <span id="sig-page-info" style="font-size:11px;color:var(--muted);align-self:center"></span>
            <button class="btn btn-sm btn-outline" id="sig-next" onclick="sigHistoryPage(1)">Next &raquo;</button>
          </div>
        </div>
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

function showTaskModal(id) {
  const allTasks = [...(_lastData?.tasks?.inProgress || []), ...(_lastData?.tasks?.todo || []), ...(_lastData?.tasks?.done || [])]
  const t = allTasks.find(t => t.id === id)
  if (!t) return
  const parts = []
  parts.push('<div class="modal-section"><div class="modal-label">Status</div><span class="tag ' + (t.status === 'done' ? 'green' : t.status === 'in-progress' ? 'blue' : '') + '">' + esc(t.status) + '</span></div>')
  if (t.description) parts.push('<div class="modal-section"><div class="modal-label">Description</div><pre>' + esc(t.description) + '</pre></div>')
  if (t.branch) parts.push('<div class="modal-section"><div class="modal-label">Branch</div><span style="color:var(--green)">&#x1f33f; ' + esc(t.branch) + '</span></div>')
  const items = t.items || []
  if (items.length > 0) {
    const doneCnt = items.filter(i => i.done).length
    const itemsHtml = items.map(i => '<div class="task-item' + (i.done ? ' done' : '') + '">' +
      '<span class="task-item-icon">' + (i.done ? '&#10003;' : '&#9675;') + '</span>' +
      '<span style="color:var(--muted);font-size:10px">#' + i.id + '</span> ' +
      esc(i.content) + '</div>').join('')
    parts.push('<div class="modal-section"><div class="modal-label">Items (' + doneCnt + '/' + items.length + ')</div>' + itemsHtml + '</div>')
  }
  const blockers = t.blockers || []
  if (blockers.length > 0) {
    parts.push('<div class="modal-section"><div class="modal-label">Blocked By</div>' + blockers.map(b => '<div style="font-size:12px">⛔ #' + b.id + ' ' + esc(b.title) + ' <span class="tag">' + b.status + '</span></div>').join('') + '</div>')
  }
  const blocking = t.blocking || []
  if (blocking.length > 0) {
    parts.push('<div class="modal-section"><div class="modal-label">Blocks</div>' + blocking.map(b => '<div style="font-size:12px">#' + b.id + ' ' + esc(b.title) + '</div>').join('') + '</div>')
  }
  const extLink = window._externalLinks && window._externalLinks[t.id]
  if (extLink) {
    parts.push('<div class="modal-section"><div class="modal-label">External Link</div><a href="' + esc(extLink.external_url || '#') + '" target="_blank" rel="noopener" style="font-size:12px">' + esc(extLink.provider) + ': ' + esc(extLink.external_id) + '</a></div>')
  }
  if (t.updated_at) parts.push('<div style="font-size:11px;color:var(--muted);margin-top:12px">Updated ' + fmtAge(t.updated_at) + '</div>')
  showModal('#' + t.id + ' ' + t.title, parts.join(''))
}

// ── Board fullscreen ─────────────────────────────────────────────────────────

let _boardFullscreen = false

function toggleFullscreen() {
  _boardFullscreen = !_boardFullscreen
  const wrapper = document.getElementById('board-wrapper')
  const btn = document.getElementById('fullscreen-btn')
  if (_boardFullscreen) {
    wrapper.classList.add('board-fullscreen')
    btn.innerHTML = '&#215; Exit'
    // Add close bar at top when fullscreen
    const bar = document.createElement('div')
    bar.className = 'fullscreen-bar'
    bar.id = 'fullscreen-bar'
    bar.innerHTML = '<h2>Task Board</h2><button class="btn btn-sm btn-outline" onclick="toggleFullscreen()">&#215; Exit Fullscreen</button>'
    wrapper.insertBefore(bar, wrapper.firstChild)
  } else {
    wrapper.classList.remove('board-fullscreen')
    btn.innerHTML = '&#x26F6; Fullscreen'
    const bar = document.getElementById('fullscreen-bar')
    if (bar) bar.remove()
  }
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
    loadSignalHistory()
  } catch(e) { showToast('Error: ' + e.message) }
}

// ── Signal history ───────────────────────────────────────────────────────────

let sigHistoryOffset = 0
const SIG_PAGE_SIZE = 15

function fmtDurationMs(ms) {
  if (ms < 1000) return ms + 'ms'
  const s = Math.floor(ms / 1000)
  if (s < 60) return s + 's'
  const m = Math.floor(s / 60)
  if (m < 60) return m + 'm ' + (s % 60) + 's'
  const h = Math.floor(m / 60)
  return h + 'h ' + (m % 60) + 'm'
}

async function loadSignalHistory() {
  sigHistoryOffset = 0
  await fetchSignalHistory()
}

function sigHistoryPage(dir) {
  sigHistoryOffset = Math.max(0, sigHistoryOffset + dir * SIG_PAGE_SIZE)
  fetchSignalHistory()
}

async function fetchSignalHistory() {
  const type = document.getElementById('sig-filter-type').value
  const status = document.getElementById('sig-filter-status').value
  const source = document.getElementById('sig-filter-source').value
  const params = new URLSearchParams()
  if (type) params.set('type', type)
  if (status) params.set('status', status)
  if (source) params.set('source', source)
  params.set('limit', String(SIG_PAGE_SIZE))
  params.set('offset', String(sigHistoryOffset))
  try {
    const res = await fetch('/api/signals/history?' + params.toString())
    const data = await res.json()
    renderSignalHistory(data.signals || [], data.total || 0)
  } catch(e) {
    document.getElementById('signal-history-content').innerHTML = '<div class="empty">error loading</div>'
  }
}

function renderSignalHistory(signals, total) {
  const el = document.getElementById('signal-history-content')
  const pager = document.getElementById('signal-history-pager')
  if (!el) return
  if (!signals.length) {
    el.innerHTML = '<div class="empty">no signals</div>'
    pager.style.display = 'none'
    return
  }
  el.innerHTML = signals.map(s => {
    const typeClass = s.type || 'message'
    const createdMs = new Date(s.created_at.endsWith('Z') ? s.created_at : s.created_at + 'Z').getTime()
    const deliveredMs = s.delivered_at ? new Date(s.delivered_at.endsWith('Z') ? s.delivered_at : s.delivered_at + 'Z').getTime() : null
    const ackedMs = s.acknowledged_at ? new Date(s.acknowledged_at.endsWith('Z') ? s.acknowledged_at : s.acknowledged_at + 'Z').getTime() : null
    const deliveryTime = deliveredMs ? fmtDurationMs(deliveredMs - createdMs) : null
    const ackTime = (ackedMs && deliveredMs) ? fmtDurationMs(ackedMs - deliveredMs) : null
    const timing = [deliveryTime && ('&#9202; ' + deliveryTime), ackTime && ('&#10003; ' + ackTime)].filter(Boolean).join(' ')
    return \`<div class="signal-history-row">
      <span class="signal-type-badge \${typeClass}">\${(s.type || 'msg').toUpperCase()}</span>
      <div style="flex:1">
        <div class="signal-content">\${esc(s.content)}</div>
        <div class="signal-meta">
          \${fmtAge(s.created_at)} · \${esc(s.source || 'cli')}
          <span class="signal-status-badge \${s.status}">\${s.status}</span>
          \${timing ? '<span class="signal-timing">' + timing + '</span>' : ''}
        </div>
        \${s.agent_response ? '<div class="signal-agent-reply">&#128172; ' + esc(s.agent_response) + '</div>' : ''}
      </div>
    </div>\`
  }).join('')
  // Pager
  if (total > SIG_PAGE_SIZE) {
    pager.style.display = 'flex'
    document.getElementById('sig-prev').disabled = sigHistoryOffset === 0
    document.getElementById('sig-next').disabled = sigHistoryOffset + SIG_PAGE_SIZE >= total
    document.getElementById('sig-page-info').textContent = (sigHistoryOffset + 1) + '\u2013' + Math.min(sigHistoryOffset + SIG_PAGE_SIZE, total) + ' of ' + total
  } else {
    pager.style.display = 'none'
  }
}

// ── Velocity metrics ─────────────────────────────────────────────────────────

async function loadVelocity() {
  try {
    const res = await fetch('/api/velocity')
    const v = await res.json()
    renderVelocity(v)
  } catch(e) {
    document.getElementById('velocity-content').innerHTML = '<div class="empty">error loading</div>'
  }
}

function fmtCycleTime(minutes) {
  if (minutes === null || minutes === undefined) return '\u2014'
  if (minutes < 60) return minutes + 'm'
  const h = Math.floor(minutes / 60)
  return h + 'h ' + (minutes % 60) + 'm'
}

function renderVelocity(v) {
  const el = document.getElementById('velocity-content')
  if (!el) return
  el.innerHTML = \`
    <div class="velocity-grid">
      <div class="velocity-stat">
        <div class="stat-value">\${v.totalTasksDone}</div>
        <div class="stat-label">Tasks Done</div>
      </div>
      <div class="velocity-stat">
        <div class="stat-value">\${v.tasksPerSession}</div>
        <div class="stat-label">Tasks/Session</div>
      </div>
      <div class="velocity-stat">
        <div class="stat-value">\${fmtCycleTime(v.avgCycleTimeMinutes)}</div>
        <div class="stat-label">Avg Cycle Time</div>
      </div>
      <div class="velocity-stat">
        <div class="stat-value">\${v.checkpointsPerSession}</div>
        <div class="stat-label">Checkpoints/Session</div>
      </div>
      <div class="velocity-stat">
        <div class="stat-value">\${v.decisionsPerSession}</div>
        <div class="stat-label">Decisions/Session</div>
      </div>
      <div class="velocity-stat">
        <div class="stat-value">\${v.totalSessions}</div>
        <div class="stat-label">Total Sessions</div>
      </div>
    </div>
    <div class="velocity-sub">Last 7 days: \${v.recentTasksDone} tasks done across \${v.recentSessionCount} sessions</div>
  \`
}

// ── Session timeline ─────────────────────────────────────────────────────────

async function loadTimeline() {
  try {
    const res = await fetch('/api/timeline')
    const events = await res.json()
    renderTimeline(events)
  } catch(e) {
    document.getElementById('timeline-content').innerHTML = '<div class="empty">error loading</div>'
  }
}

function fmtTime(dateStr) {
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function renderTimeline(events) {
  const el = document.getElementById('timeline-content')
  if (!el) return
  if (!events || !events.length) {
    el.innerHTML = '<div class="empty">no events yet</div>'
    return
  }
  const snippet = (text, max) => text && text.length > max ? esc(text.slice(0, max)) + '\u2026' : esc(text || '')
  el.innerHTML = '<div class="timeline">' + events.map(e => {
    const detail = e.detail ? \`<div class="timeline-detail">\${snippet(e.detail, 80)}</div>\` : ''
    return \`<div class="timeline-event \${e.type}">
      <span class="timeline-time">\${fmtTime(e.created_at)}</span>
      <span class="timeline-type \${e.type}">\${e.type}</span>
      <span class="timeline-summary">\${snippet(e.summary, 100)}</span>
      \${detail}
    </div>\`
  }).join('') + '</div>'
}

// ── External links (GitHub/Linear badges) ────────────────────────────────────

async function loadExternalLinks() {
  try {
    const res = await fetch('/api/external-links')
    const links = await res.json()
    window._externalLinks = {}
    for (const link of links) {
      window._externalLinks[link.task_id] = link
    }
  } catch(e) {
    window._externalLinks = {}
  }
}

// ── Replay mode ──────────────────────────────────────────────────────────────

let replaySessions = []
let replayIdx = -1       // index into replaySessions
let replayEventIdx = -1  // current event within the session

async function loadReplay() {
  try {
    const res = await fetch('/api/replay')
    replaySessions = await res.json()
  } catch(e) { replaySessions = [] }
  const card = document.getElementById('replay-card')
  if (!replaySessions.length) { card.style.display = 'none'; return }
  card.style.display = 'block'
  const sel = document.getElementById('replay-session-select')
  sel.innerHTML = replaySessions.map((s, i) =>
    '<option value="' + i + '">Session ' + s.id + ' — ' + s.started_at.slice(0, 16).replace('T', ' ') + '</option>'
  ).join('')
  replayIdx = 0
  replayEventIdx = -1
  renderReplaySession()
}

function selectReplaySession() {
  replayIdx = parseInt(document.getElementById('replay-session-select').value, 10)
  replayEventIdx = -1
  renderReplaySession()
}

function replayStep(dir) {
  const session = replaySessions[replayIdx]
  if (!session) return
  const next = replayEventIdx + dir
  if (next < 0 || next >= session.events.length) return
  replayEventIdx = next
  renderReplaySession()
}

function renderReplaySession() {
  const session = replaySessions[replayIdx]
  if (!session) return
  const eventsEl = document.getElementById('replay-events')
  const handoffEl = document.getElementById('replay-handoff')
  const counter = document.getElementById('replay-counter')
  const prevBtn = document.getElementById('replay-prev')
  const nextBtn = document.getElementById('replay-next')

  const total = session.events.length
  counter.textContent = (replayEventIdx + 1) + ' / ' + total
  prevBtn.disabled = replayEventIdx <= 0
  nextBtn.disabled = replayEventIdx >= total - 1

  eventsEl.innerHTML = session.events.map((ev, i) => {
    const isActive = i === replayEventIdx ? ' active' : ''
    const visible = i <= replayEventIdx ? '' : ' style="opacity:0.3"'
    const snippet = ev.summary.length > 120 ? esc(ev.summary.slice(0, 120)) + '\u2026' : esc(ev.summary)
    const detail = ev.detail ? '<div class="replay-detail">' + (ev.detail.length > 100 ? esc(ev.detail.slice(0, 100)) + '\u2026' : esc(ev.detail)) + '</div>' : ''
    const time = ev.created_at.slice(11, 16)
    return '<div class="replay-event' + isActive + '"' + visible + '>' +
      '<span style="color:var(--muted);margin-right:4px">' + time + '</span>' +
      '<span class="replay-type ' + ev.type + '">' + ev.type + '</span>' +
      snippet + detail + '</div>'
  }).join('')

  handoffEl.innerHTML = session.handoff_note
    ? '<div class="replay-handoff"><strong>Handoff:</strong> ' + esc(session.handoff_note.slice(0, 300)) + '</div>'
    : ''
}

// ── Decision graph ───────────────────────────────────────────────────────────

async function loadDecisionGraph() {
  try {
    const res = await fetch('/api/decisions/graph')
    const chains = await res.json()
    renderDecisionGraph(chains)
  } catch(e) {
    // silently ignore — graph is supplementary
  }
}

function renderDecisionGraph(chains) {
  const card = document.getElementById('decision-graph-card')
  const el = document.getElementById('decision-graph-content')
  const cnt = document.getElementById('count-chains')
  if (!el || !card) return
  if (!chains || !chains.length) {
    card.style.display = 'none'
    return
  }
  card.style.display = 'block'
  cnt.textContent = '(' + chains.length + ' chain' + (chains.length > 1 ? 's' : '') + ')'
  el.innerHTML = chains.map(chain => {
    const nodes = chain.map((node, i) => {
      const arrow = i < chain.length - 1 ? '<div class="chain-arrow">\u2193</div>' : ''
      const snippet = node.summary.length > 80 ? esc(node.summary.slice(0, 80)) + '\u2026' : esc(node.summary)
      const tags = (node.tags || '').split(',').filter(Boolean).slice(0, 3).map(t =>
        '<span class="tag">' + esc(t.trim()) + '</span>'
      ).join('')
      return \`<div class="chain-node \${node.status}">
        <span class="decision-status \${node.status}">\${node.status}</span>
        <span class="chain-summary">\${snippet}</span>
        <span style="font-size:10px;color:var(--muted)">\${node.created_at.slice(0,10)}</span>
        \${tags}
      </div>\${arrow}\`
    }).join('')
    return '<div class="decision-chain">' + nodes + '</div>'
  }).join('')
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

  const extLink = window._externalLinks && window._externalLinks[t.id]
  const extBadge = extLink
    ? \`<a href="\${esc(extLink.external_url || '#')}" target="_blank" rel="noopener" style="font-size:11px;text-decoration:none;margin-left:6px" title="\${esc(extLink.provider)} \${esc(extLink.external_id)}">\${extLink.provider === 'github' ? '&#128025;' : '&#128279;'} \${esc(extLink.external_id)}</a>\`
    : ''

  return \`<div class="task-card\${isStale ? ' stale' : ''}" onclick="showTaskModal(\${t.id})">
    <div class="task-title"><span class="task-id">#\${t.id}</span>\${esc(t.title)}\${staleTag}\${extBadge}</div>
    \${desc}
    <div class="task-meta">\${age}\${branch}</div>
    \${depsHtml}
    \${itemsHtml}
  </div>\`
}

const CARD_LIMIT = 7
const _expandedCols = {}

function renderTasks(tasks, containerId, countId, staleIds) {
  const el = document.getElementById(containerId)
  const cnt = document.getElementById(countId)
  if (cnt) cnt.textContent = String(tasks.length)
  if (!tasks.length) { el.innerHTML = '<div class="empty">No tasks</div>'; return }
  const isExpanded = _expandedCols[containerId]
  const visible = isExpanded ? tasks : tasks.slice(0, CARD_LIMIT)
  const html = visible.map(t => renderTask(t, staleIds)).join('')
  const remaining = tasks.length - CARD_LIMIT
  if (remaining > 0 && !isExpanded) {
    el.innerHTML = html + '<button class="show-more-btn" onclick="expandColumn(\\\'' + containerId + '\\\')">' + remaining + ' more task' + (remaining > 1 ? 's' : '') + '&hellip;</button>'
  } else if (remaining > 0 && isExpanded) {
    el.innerHTML = html + '<button class="show-more-btn" onclick="collapseColumn(\\\'' + containerId + '\\\')">&uarr; Show less</button>'
  } else {
    el.innerHTML = html
  }
}

function expandColumn(containerId) {
  _expandedCols[containerId] = true
  if (_lastData) {
    const staleIds = new Set((_lastData.staleTasks || []).map(t => t.id))
    if (containerId === 'col-inprogress') renderTasks(_lastData.tasks.inProgress, containerId, 'count-ip', staleIds)
    else if (containerId === 'col-todo') renderTasks(_lastData.tasks.todo, containerId, 'count-todo', null)
    else if (containerId === 'col-done') renderTasks(_lastData.tasks.done, containerId, 'count-done', null)
  }
}

function collapseColumn(containerId) {
  _expandedCols[containerId] = false
  if (_lastData) {
    const staleIds = new Set((_lastData.staleTasks || []).map(t => t.id))
    if (containerId === 'col-inprogress') renderTasks(_lastData.tasks.inProgress, containerId, 'count-ip', staleIds)
    else if (containerId === 'col-todo') renderTasks(_lastData.tasks.todo, containerId, 'count-todo', null)
    else if (containerId === 'col-done') renderTasks(_lastData.tasks.done, containerId, 'count-done', null)
  }
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
    const statusBadge = d.status && d.status !== 'active'
      ? \`<span class="decision-status \${d.status}">\${d.status}</span>\`
      : ''
    return \`<div class="decision-row">
      <div class="decision-date">\${d.created_at.slice(0,10)}</div>
      <div class="decision-summary" style="flex:1">
        \${esc(summary)} \${confidenceBadge(d.confidence)}\${statusBadge}
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
  fetchSignalHistory()
  loadVelocity()
  loadTimeline()
  loadDecisionGraph()
  loadReplay()
  loadExternalLinks().then(() => {
    // re-render task cards with external link badges
    renderTasks(data.tasks.inProgress, 'col-inprogress', 'count-ip', staleIds)
    renderTasks(data.tasks.todo,       'col-todo',       'count-todo', null)
    renderTasks(data.tasks.done,       'col-done',       'count-done', null)
  })

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
