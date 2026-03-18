import { Command, Flags } from '@oclif/core'
import { resolve, isAbsolute } from 'node:path'
import { writeFileSync } from 'node:fs'
import { requireProject } from '../utils/project.js'
import {
  getAllOpenTasks,
  getDecisionsSince,
  getSessionsSince,
  getTasksDoneSince,
  getObservationsSince,
  getQuestionsSince,
  getActivePlans,
  getPlanSteps,
} from '../store/queries.js'
import { ok, warn } from '../utils/display.js'
import type { Decision, Note, Plan, PlanStep, Question, Session, Task } from '../types.js'

const ALL_SECTIONS = ['summary', 'tasks', 'decisions', 'handoffs', 'observations', 'plans', 'questions'] as const
type SectionKey = typeof ALL_SECTIONS[number]

export default class Export extends Command {
  static description = 'Export a Markdown report of decisions, open tasks, and recent session handoffs'

  static flags = {
    days: Flags.integer({
      char: 'd',
      description: 'Number of days to look back for decisions, handoffs, observations, and questions',
      default: 30,
    }),
    format: Flags.string({
      char: 'f',
      description: 'Output format: md, json, html',
      options: ['md', 'json', 'html'],
      default: 'md',
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output file path (ignored when --stdout is set); defaults to kontinue-export.{format}',
    }),
    sections: Flags.string({
      char: 's',
      description: `Comma-separated list of sections to include. Valid: ${ALL_SECTIONS.join(', ')}`,
      default: ALL_SECTIONS.join(','),
    }),
    'include-superseded': Flags.boolean({
      description: 'Include superseded and archived decisions (omitted by default)',
      default: false,
    }),
    tags: Flags.string({
      char: 't',
      description: 'Comma-separated tag filter — only decisions/observations matching at least one tag are included',
    }),
    stdout: Flags.boolean({
      description: 'Write report to stdout instead of a file',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Export)
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)

    const since = new Date(Date.now() - flags.days * 24 * 60 * 60 * 1000).toISOString()

    // Parse section whitelist
    const sections = new Set<SectionKey>(
      flags.sections
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter((s): s is SectionKey => (ALL_SECTIONS as readonly string[]).includes(s))
    )
    if (sections.size === 0) {
      warn(`No valid sections specified. Valid values: ${ALL_SECTIONS.join(', ')}`)
      return
    }

    // Parse tag filter
    const tagFilter = flags.tags
      ? flags.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
      : null

    // Fetch data
    let decisions    = getDecisionsSince(project.id, since)
    const openTasks  = getAllOpenTasks(project.id)
    const doneTasks  = getTasksDoneSince(project.id, since)
    const sessions   = getSessionsSince(project.id, since)
    let observations = getObservationsSince(project.id, since)
    const questions  = getQuestionsSince(project.id, since)
    const plans      = getActivePlans(project.id)
    const planSteps  = new Map<number, PlanStep[]>(
      plans.map(p => [p.id, getPlanSteps(p.id)])
    )

    // Apply --include-superseded filter
    if (!flags['include-superseded']) {
      decisions = decisions.filter(d => d.status === 'active')
    }

    // Apply --tags filter
    if (tagFilter) {
      decisions = decisions.filter(d =>
        d.tags && tagFilter.some(tag => d.tags!.toLowerCase().split(',').map(t => t.trim()).includes(tag))
      )
      observations = observations.filter(n =>
        tagFilter.some(tag => n.content.toLowerCase().includes(tag))
      )
    }

    const format = (flags.format ?? 'md') as 'md' | 'json' | 'html'
    const defaultOutput = format === 'json' ? 'kontinue-export.json'
      : format === 'html' ? 'kontinue-export.html'
      : 'kontinue-export.md'
    const outFile = flags.output ?? defaultOutput

    const reportData: ReportData = {
      projectName: project.name,
      days: flags.days,
      since,
      sections,
      decisions,
      openTasks,
      doneTasks,
      sessions,
      observations,
      questions,
      plans,
      planSteps,
    }

    const output =
      format === 'json' ? buildJsonReport(reportData)
      : format === 'html' ? buildHtmlReport(reportData)
      : buildReport(reportData)

    if (flags.stdout) {
      process.stdout.write(output)
    } else {
      const outPath = isAbsolute(outFile) ? outFile : resolve(cwd, outFile)
      writeFileSync(outPath, output, 'utf8')
      ok(`Report written to ${outPath}`)
    }

    const total = decisions.length + openTasks.length + doneTasks.length + sessions.length + observations.length + questions.length
    if (total === 0 && !flags.stdout) {
      warn('Nothing recorded yet — report is empty.')
    }
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReportData {
  projectName: string
  days: number
  since: string
  sections: Set<SectionKey>
  decisions: Decision[]
  openTasks: Task[]
  doneTasks: Task[]
  sessions: Session[]
  observations: Note[]
  questions: Question[]
  plans: Plan[]
  planSteps: Map<number, PlanStep[]>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Report builder ────────────────────────────────────────────────────────────

export function buildReport(data: ReportData): string {
  const { projectName, days, since, sections, decisions, openTasks, doneTasks, sessions, observations, questions, plans, planSteps } = data
  const generated = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
  const lines: string[] = []

  lines.push(`# Kontinue Report — ${projectName}`)
  lines.push('')
  lines.push(`> Generated: ${generated}  `)
  lines.push(`> Period: last ${days} days (since ${fmtDate(since)})`)
  lines.push('')
  lines.push('---')
  lines.push('')

  // ── Summary ─────────────────────────────────────────────────────────────────
  if (sections.has('summary')) {
    lines.push('## Summary')
    lines.push('')
    lines.push('| | Count |')
    lines.push('|---|---|')
    lines.push(`| Open tasks | ${openTasks.length} |`)
    lines.push(`| Completed tasks (period) | ${doneTasks.length} |`)
    lines.push(`| Decisions (period) | ${decisions.length} |`)
    lines.push(`| Session handoffs (period) | ${sessions.filter(s => s.handoff_note).length} |`)
    lines.push(`| Observations (period) | ${observations.length} |`)
    lines.push(`| Questions (period) | ${questions.length} |`)
    lines.push(`| Active plans | ${plans.length} |`)
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  // ── Tasks ────────────────────────────────────────────────────────────────────
  if (sections.has('tasks')) {
    lines.push('## Tasks')
    lines.push('')
    const inProgress = openTasks.filter(t => t.status === 'in-progress')
    const todo = openTasks.filter(t => t.status === 'todo')
    if (inProgress.length === 0 && todo.length === 0 && doneTasks.length === 0) {
      lines.push('_No tasks recorded._')
    } else {
      if (inProgress.length > 0) {
        lines.push('### In Progress')
        lines.push('')
        for (const t of inProgress) {
          lines.push(`- **${t.title}**`)
          if (t.description) lines.push(`  > ${t.description}`)
        }
        lines.push('')
      }
      if (todo.length > 0) {
        lines.push('### Up Next')
        lines.push('')
        for (const t of todo) {
          lines.push(`- ${t.title}`)
          if (t.description) lines.push(`  > ${t.description}`)
        }
        lines.push('')
      }
      if (doneTasks.length > 0) {
        lines.push(`### Completed (last ${days} days)`)
        lines.push('')
        for (const t of doneTasks) {
          lines.push(`- ~~${t.title}~~  _${fmtDate(t.updated_at)}_`)
          if (t.outcome) lines.push(`  > ${t.outcome}`)
        }
        lines.push('')
      }
    }
    lines.push('---')
    lines.push('')
  }

  // ── Decisions ────────────────────────────────────────────────────────────────
  if (sections.has('decisions')) {
    lines.push(`## Decisions (last ${days} days)`)
    lines.push('')
    if (decisions.length === 0) {
      lines.push('_No decisions recorded in this period._')
    } else {
      for (const d of decisions) {
        const statusBadge = d.status !== 'active' ? ` _(${d.status})_` : ''
        const tagStr = d.tags ? `  \`${d.tags.split(',').map((t: string) => t.trim()).join('` `')}\`` : ''
        lines.push(`### ${d.summary}${statusBadge}`)
        lines.push('')
        lines.push(`_${fmtDate(d.created_at)}${d.branch ? ` · ${d.branch}` : ''}${tagStr}_`)
        lines.push('')
        if (d.context)      lines.push(`**Context:** ${d.context}`)
        if (d.rationale)    lines.push(`**Rationale:** ${d.rationale}`)
        if (d.alternatives) lines.push(`**Alternatives considered:** ${d.alternatives}`)
        if (d.files)        lines.push(`**Files:** \`${d.files}\``)
        lines.push('')
      }
    }
    lines.push('---')
    lines.push('')
  }

  // ── Session Handoffs ─────────────────────────────────────────────────────────
  if (sections.has('handoffs')) {
    lines.push(`## Session Handoffs (last ${days} days)`)
    lines.push('')
    const sessionsWithHandoff = sessions.filter(s => s.handoff_note)
    if (sessionsWithHandoff.length === 0) {
      lines.push('_No session handoffs recorded in this period._')
    } else {
      for (const s of sessionsWithHandoff) {
        const endDate = fmtDate(s.ended_at!)
        const branchStr = s.branch && s.branch !== 'HEAD' ? ` · ${s.branch}` : ''
        lines.push(`### ${endDate}${branchStr}`)
        lines.push('')
        lines.push(s.handoff_note!.trim())
        if (s.blockers) {
          lines.push('')
          lines.push(`> **Blockers:** ${s.blockers}`)
        }
        lines.push('')
      }
    }
    lines.push('---')
    lines.push('')
  }

  // ── Observations ─────────────────────────────────────────────────────────────
  if (sections.has('observations')) {
    lines.push(`## Observations (last ${days} days)`)
    lines.push('')
    if (observations.length === 0) {
      lines.push('_No open observations in this period._')
    } else {
      for (const n of observations) {
        lines.push(`- _${fmtDate(n.created_at)}_ — ${n.content.trim()}`)
      }
    }
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  // ── Active Plans ─────────────────────────────────────────────────────────────
  if (sections.has('plans')) {
    lines.push('## Active Plans')
    lines.push('')
    if (plans.length === 0) {
      lines.push('_No active plans._')
    } else {
      for (const p of plans) {
        lines.push(`### ${p.title}`)
        if (p.goal) lines.push(`_${p.goal}_`)
        lines.push('')
        const steps = planSteps.get(p.id) ?? []
        if (steps.length > 0) {
          for (const s of steps) {
            const check = s.status === 'done' ? '[x]' : s.status === 'skipped' ? '[~]' : '[ ]'
            const label = s.status === 'in-progress' ? `**${s.content}** _(in progress)_` : s.content
            lines.push(`- ${check} ${label}`)
          }
        } else {
          lines.push('_No steps defined._')
        }
        lines.push('')
      }
    }
    lines.push('---')
    lines.push('')
  }

  // ── Questions ────────────────────────────────────────────────────────────────
  if (sections.has('questions')) {
    lines.push(`## Questions (last ${days} days)`)
    lines.push('')
    if (questions.length === 0) {
      lines.push('_No questions recorded in this period._')
    } else {
      for (const q of questions) {
        const resolved = q.resolved_at ? ` _(answered ${fmtDate(q.resolved_at)})_` : ' _(open)_'
        lines.push(`- **${q.question}**${resolved}`)
        if (q.answer) lines.push(`  > ${q.answer}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

// ── JSON report builder ───────────────────────────────────────────────────────

export function buildJsonReport(data: ReportData): string {
  const { projectName, days, since, decisions, openTasks, doneTasks, sessions, observations, questions, plans, planSteps } = data
  const generated = new Date().toISOString()
  const handoffs = sessions.filter(s => s.handoff_note)

  const payload = {
    meta: {
      project: projectName,
      generated,
      period_days: days,
      since,
    },
    summary: {
      decisions: decisions.length,
      open_tasks: openTasks.length,
      completed_tasks: doneTasks.length,
      sessions: handoffs.length,
      observations: observations.length,
      questions: questions.length,
      active_plans: plans.length,
    },
    tasks: {
      open: openTasks,
      completed: doneTasks,
    },
    decisions,
    handoffs,
    observations,
    plans: plans.map(p => ({ ...p, steps: planSteps.get(p.id) ?? [] })),
    questions,
  }

  return JSON.stringify(payload, null, 2)
}

// ── HTML report builder ───────────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildHtmlReport(data: ReportData): string {
  const { projectName, days, since, sections, decisions, openTasks, doneTasks, sessions, observations, questions, plans, planSteps } = data
  const generated = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'

  const navLinks: string[] = []
  const sectionHtml: string[] = []

  // ── Summary ─────────────────────────────────────────────────────────────────
  if (sections.has('summary')) {
    navLinks.push('<a href="#summary">Summary</a>')
    const rows = [
      ['Open tasks', openTasks.length],
      [`Completed tasks (last ${days}d)`, doneTasks.length],
      [`Decisions (last ${days}d)`, decisions.length],
      [`Session handoffs (last ${days}d)`, sessions.filter(s => s.handoff_note).length],
      [`Observations (last ${days}d)`, observations.length],
      [`Questions (last ${days}d)`, questions.length],
      ['Active plans', plans.length],
    ] as const
    sectionHtml.push(`<section id="summary"><h2>Summary</h2><table><thead><tr><th></th><th>Count</th></tr></thead><tbody>${rows.map(([label, count]) => `<tr><td>${esc(String(label))}</td><td class="num">${count}</td></tr>`).join('')}</tbody></table></section>`)
  }

  // ── Tasks ────────────────────────────────────────────────────────────────────
  if (sections.has('tasks')) {
    navLinks.push('<a href="#tasks">Tasks</a>')
    const inProgress = openTasks.filter(t => t.status === 'in-progress')
    const todo = openTasks.filter(t => t.status === 'todo')
    let inner = ''
    if (inProgress.length === 0 && todo.length === 0 && doneTasks.length === 0) {
      inner = '<p class="empty">No tasks recorded.</p>'
    } else {
      if (inProgress.length > 0) {
        inner += `<h3>In Progress</h3><ul>${inProgress.map(t => `<li><span class="badge badge-progress">in-progress</span> <strong>${esc(t.title)}</strong>${t.description ? `<blockquote>${esc(t.description)}</blockquote>` : ''}</li>`).join('')}</ul>`
      }
      if (todo.length > 0) {
        inner += `<h3>Up Next</h3><ul>${todo.map(t => `<li><span class="badge badge-todo">todo</span> ${esc(t.title)}${t.description ? `<blockquote>${esc(t.description)}</blockquote>` : ''}</li>`).join('')}</ul>`
      }
      if (doneTasks.length > 0) {
        inner += `<h3>Completed (last ${days} days)</h3><ul>${doneTasks.map(t => `<li><span class="badge badge-done">done</span> <s>${esc(t.title)}</s> <span class="dim">${fmtDate(t.updated_at)}</span>${t.outcome ? `<blockquote>${esc(t.outcome)}</blockquote>` : ''}</li>`).join('')}</ul>`
      }
    }
    sectionHtml.push(`<section id="tasks"><h2>Tasks</h2>${inner}</section>`)
  }

  // ── Decisions ────────────────────────────────────────────────────────────────
  if (sections.has('decisions')) {
    navLinks.push('<a href="#decisions">Decisions</a>')
    let inner = ''
    if (decisions.length === 0) {
      inner = '<p class="empty">No decisions recorded in this period.</p>'
    } else {
      inner = decisions.map(d => {
        const badge = d.status === 'active'
          ? '<span class="badge badge-active">active</span>'
          : `<span class="badge badge-muted">${esc(d.status)}</span>`
        const tags = d.tags ? d.tags.split(',').map((t: string) => `<code>${esc(t.trim())}</code>`).join(' ') : ''
        const meta = `<span class="dim">${fmtDate(d.created_at)}${d.branch ? ` · ${esc(d.branch)}` : ''}</span>${tags ? ` ${tags}` : ''}`
        const fields = [
          d.context ? `<p><strong>Context:</strong> ${esc(d.context)}</p>` : '',
          d.rationale ? `<p><strong>Rationale:</strong> ${esc(d.rationale)}</p>` : '',
          d.alternatives ? `<p><strong>Alternatives considered:</strong> ${esc(d.alternatives)}</p>` : '',
          d.files ? `<p><strong>Files:</strong> <code>${esc(d.files)}</code></p>` : '',
        ].filter(Boolean).join('')
        return `<div class="card">${badge} <strong>${esc(d.summary)}</strong><div class="meta">${meta}</div>${fields}</div>`
      }).join('')
    }
    sectionHtml.push(`<section id="decisions"><h2>Decisions (last ${days} days)</h2>${inner}</section>`)
  }

  // ── Session Handoffs ─────────────────────────────────────────────────────────
  if (sections.has('handoffs')) {
    navLinks.push('<a href="#handoffs">Handoffs</a>')
    const sessionsWithHandoff = sessions.filter(s => s.handoff_note)
    let inner = ''
    if (sessionsWithHandoff.length === 0) {
      inner = '<p class="empty">No session handoffs recorded in this period.</p>'
    } else {
      inner = sessionsWithHandoff.map(s => {
        const endDate = fmtDate(s.ended_at!)
        const branchStr = s.branch && s.branch !== 'HEAD' ? ` · ${esc(s.branch)}` : ''
        const blockers = s.blockers ? `<p class="blockers"><strong>Blockers:</strong> ${esc(s.blockers)}</p>` : ''
        return `<div class="card"><h3>${esc(endDate)}${branchStr}</h3><pre>${esc(s.handoff_note!.trim())}</pre>${blockers}</div>`
      }).join('')
    }
    sectionHtml.push(`<section id="handoffs"><h2>Session Handoffs (last ${days} days)</h2>${inner}</section>`)
  }

  // ── Observations ─────────────────────────────────────────────────────────────
  if (sections.has('observations')) {
    navLinks.push('<a href="#observations">Observations</a>')
    let inner = ''
    if (observations.length === 0) {
      inner = '<p class="empty">No open observations in this period.</p>'
    } else {
      inner = `<ul>${observations.map(n => `<li><span class="dim">${fmtDate(n.created_at)}</span> — ${esc(n.content.trim())}</li>`).join('')}</ul>`
    }
    sectionHtml.push(`<section id="observations"><h2>Observations (last ${days} days)</h2>${inner}</section>`)
  }

  // ── Active Plans ─────────────────────────────────────────────────────────────
  if (sections.has('plans')) {
    navLinks.push('<a href="#plans">Plans</a>')
    let inner = ''
    if (plans.length === 0) {
      inner = '<p class="empty">No active plans.</p>'
    } else {
      inner = plans.map(p => {
        const steps = planSteps.get(p.id) ?? []
        const stepHtml = steps.length > 0
          ? `<ul class="steps">${steps.map(s => {
              const cls = s.status === 'done' ? 'step-done' : s.status === 'skipped' ? 'step-skipped' : s.status === 'in-progress' ? 'step-active' : ''
              const check = s.status === 'done' ? '✓' : s.status === 'skipped' ? '~' : s.status === 'in-progress' ? '▶' : '○'
              const label = s.status === 'in-progress' ? `<strong>${esc(s.content)}</strong>` : esc(s.content)
              return `<li class="${cls}"><span class="step-icon">${check}</span> ${label}</li>`
            }).join('')}</ul>`
          : '<p class="empty">No steps defined.</p>'
        return `<div class="card"><h3>${esc(p.title)}</h3>${p.goal ? `<p class="dim">${esc(p.goal)}</p>` : ''}${stepHtml}</div>`
      }).join('')
    }
    sectionHtml.push(`<section id="plans"><h2>Active Plans</h2>${inner}</section>`)
  }

  // ── Questions ────────────────────────────────────────────────────────────────
  if (sections.has('questions')) {
    navLinks.push('<a href="#questions">Questions</a>')
    let inner = ''
    if (questions.length === 0) {
      inner = '<p class="empty">No questions recorded in this period.</p>'
    } else {
      inner = `<ul>${questions.map(q => {
        const badge = q.resolved_at
          ? `<span class="badge badge-done">answered ${fmtDate(q.resolved_at)}</span>`
          : '<span class="badge badge-todo">open</span>'
        return `<li>${badge} <strong>${esc(q.question)}</strong>${q.answer ? `<blockquote>${esc(q.answer)}</blockquote>` : ''}</li>`
      }).join('')}</ul>`
    }
    sectionHtml.push(`<section id="questions"><h2>Questions (last ${days} days)</h2>${inner}</section>`)
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kontinue Report — ${esc(projectName)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#0f1117;color:#d1d5db;line-height:1.65;font-size:15px}
a{color:#60a5fa;text-decoration:none}
a:hover{text-decoration:underline}
nav{background:#1a1d27;border-bottom:1px solid #2d3748;padding:12px 24px;display:flex;gap:20px;flex-wrap:wrap;position:sticky;top:0;z-index:10}
nav a{font-size:13px;color:#9ca3af;font-weight:500}
nav a:hover{color:#d1d5db}
main{max-width:900px;margin:0 auto;padding:32px 24px}
h1{font-size:1.7rem;font-weight:700;color:#f3f4f6;margin-bottom:6px}
.subtitle{color:#6b7280;font-size:13px;margin-bottom:32px}
section{margin-bottom:40px}
h2{font-size:1.1rem;font-weight:600;color:#e5e7eb;border-bottom:1px solid #2d3748;padding-bottom:8px;margin-bottom:16px}
h3{font-size:.95rem;font-weight:600;color:#d1d5db;margin:14px 0 6px}
table{border-collapse:collapse;width:100%;max-width:420px}
th,td{text-align:left;padding:7px 12px;border-bottom:1px solid #1f2937;font-size:14px}
th{color:#6b7280;font-weight:500;font-size:13px}
.num{text-align:right;font-variant-numeric:tabular-nums;color:#e5e7eb}
ul{list-style:none;padding:0}
li{padding:7px 0;border-bottom:1px solid #1a1d27;font-size:14px}
li:last-child{border-bottom:none}
blockquote{margin:6px 0 0 16px;padding-left:10px;border-left:3px solid #374151;color:#9ca3af;font-size:13px;line-height:1.5}
.card{background:#1a1d27;border:1px solid #2d3748;border-radius:8px;padding:16px;margin-bottom:14px}
.card h3{margin-top:0}
.meta{font-size:12px;color:#6b7280;margin:6px 0 10px}
.meta code{background:#111827;padding:1px 5px;border-radius:3px;font-size:11px;color:#818cf8}
pre{font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap;background:#111827;padding:12px;border-radius:6px;color:#d1d5db;overflow-x:auto}
code{font-family:ui-monospace,monospace;background:#111827;padding:1px 5px;border-radius:3px;font-size:12px;color:#818cf8}
.dim{color:#6b7280;font-size:13px}
.empty{color:#4b5563;font-style:italic;font-size:14px}
.blockers{color:#f87171;font-size:13px;margin-top:10px}
.badge{display:inline-block;font-size:11px;font-weight:600;padding:1px 7px;border-radius:12px;vertical-align:middle;margin-right:5px}
.badge-active{background:#065f46;color:#6ee7b7}
.badge-done{background:#1e3a5f;color:#93c5fd}
.badge-todo{background:#1c1917;color:#a8a29e}
.badge-progress{background:#3b1f0a;color:#fb923c}
.badge-muted{background:#1f2937;color:#6b7280}
.steps{padding:4px 0}
.steps li{display:flex;gap:8px;align-items:flex-start;padding:4px 0;border:none;font-size:13px}
.step-icon{min-width:16px;text-align:center;color:#6b7280}
.step-done{color:#6b7280;text-decoration:line-through}
.step-done .step-icon{color:#6ee7b7}
.step-active{color:#e5e7eb}
.step-active .step-icon{color:#fb923c}
.step-skipped{color:#4b5563}
footer{text-align:center;padding:32px 24px;color:#374151;font-size:12px;border-top:1px solid #1a1d27}
s{color:#4b5563}
</style>
</head>
<body>
<nav>
<span style="color:#e5e7eb;font-weight:600;font-size:14px">Kontinue</span>
${navLinks.join('\n')}
</nav>
<main>
<h1>Kontinue Report — ${esc(projectName)}</h1>
<p class="subtitle">Generated: ${esc(generated)} &nbsp;·&nbsp; Period: last ${days} days (since ${esc(fmtDate(since))})</p>
${sectionHtml.join('\n')}
</main>
<footer>Generated ${esc(generated)} · ${esc(projectName)} · Kontinue</footer>
</body>
</html>`
}
