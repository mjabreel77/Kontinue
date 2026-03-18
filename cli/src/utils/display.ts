import chalk, { type ChalkInstance } from 'chalk'
import type { Decision, Session, Task } from '../types.js'

const W = 54 // layout width

// -- Banner -------------------------------------------------------------------

export function printBanner(
  projectName: string,
  branch?: string | null,
  commit?: string | null,
): void {
  const left = chalk.bold.cyan('kontinue') + chalk.dim('  /  ') + chalk.bold.white(projectName)
  const meta = [branch && branch !== 'HEAD' ? branch : null, commit ?? null].filter(Boolean).join('@')
  console.log()
  if (meta) {
    console.log('  ' + left + '  ' + chalk.dim(meta))
  } else {
    console.log('  ' + left)
  }
  console.log()
}

export function printHeader(projectName: string, _subtitle?: string): void {
  printBanner(projectName)
}

// -- Section label ------------------------------------------------------------

export function section(label: string, color: ChalkInstance = chalk.bold): void {
  const fill = chalk.dim('-'.repeat(Math.max(2, W - label.length - 3)))
  console.log('  ' + color(label) + '  ' + fill)
}

export function printDivider(): void {
  console.log(chalk.dim('  ' + '-'.repeat(W)))
}

// -- Session ------------------------------------------------------------------

export function printSessionBadge(sess: Session): void {
  const mins = Math.round((Date.now() - new Date(sess.started_at).getTime()) / 60_000)
  const duration = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
  const branch = sess.branch && sess.branch !== 'HEAD' ? chalk.dim(`  ${sess.branch}`) : ''
  console.log('  ' + chalk.green('* Session active') + chalk.dim('  .  ' + duration) + branch)
  console.log()
}

export function printHandoff(session: Session): void {
  if (!session.handoff_note) return
  section('Last Handoff  ' + fmtDate(session.ended_at!), chalk.bold.yellow)
  const lines = session.handoff_note
    .split('\n')
    .filter(l => !l.startsWith('###') && !l.match(/^- \[(todo|in-progress|done)\]/))
    .slice(0, 6)
  for (const line of lines) {
    if (line.trim()) console.log('     ' + chalk.dim(line.trim()))
  }
  if (session.blockers) {
    console.log()
    console.log('  ' + chalk.red('! Blocker:') + '  ' + session.blockers)
  }
  console.log()
}

// -- Tasks --------------------------------------------------------------------

export function printTasks(label: string, tasks: Task[], bullet: string, color: ChalkInstance): void {
  if (tasks.length === 0) return
  section(label, color)
  for (const t of tasks) {
    console.log('  ' + color(bullet) + '  ' + chalk.white(t.title))
    if (t.description) {
      console.log('       ' + chalk.dim(truncate(t.description, 62)))
    }
  }
  console.log()
}

export function printTaskSection(label: string, _icon: string, tasks: Task[], color: ChalkInstance): void {
  const bullet = label.includes('PROGRESS') ? '>' : '-'
  printTasks(label, tasks, bullet, color)
}

// -- Decisions ----------------------------------------------------------------

export function printDecisions(decisions: Decision[]): void {
  if (decisions.length === 0) return
  section('Decisions', chalk.bold.blue)
  for (const d of decisions) {
    const date = chalk.dim(fmtDateShort(d.created_at))
    const tags = d.tags
      ? '  ' + d.tags.split(',').map(t => chalk.dim.cyan(`[${t.trim()}]`)).join(' ')
      : ''
    console.log(`  .  ${date}  ${d.summary}${tags}`)
  }
  console.log()
}

// -- Search results -----------------------------------------------------------

export function printSearchResults(
  results: Array<{ content: string; source_type: string; created_at?: string }>,
  query: string,
  total: number
): void {
  console.log()
  console.log('  ' + chalk.bold(`"${query}"`) + chalk.dim(`  .  ${results.length} of ${total} chunks`))
  console.log()
  for (const r of results) {
    const typeColor = sourceColor(r.source_type)
    const date = r.created_at ? '  ' + fmtDateShort(r.created_at) : ''
    section(r.source_type.toUpperCase() + date, typeColor)
    for (const line of r.content.split('\n').slice(0, 4)) {
      if (line.trim()) console.log('     ' + chalk.dim(line))
    }
    console.log()
  }
}

// -- Memory stats -------------------------------------------------------------

export function printMemoryStats(chunks: number, sessions: number, decisions: number): void {
  printDivider()
  console.log(chalk.dim(`  ${chunks} chunks  .  ${sessions} sessions  .  ${decisions} decisions`))
}

// -- Inline status ------------------------------------------------------------

export function ok(msg: string): void {
  console.log('  ' + chalk.green('v') + '  ' + msg)
}

export function warn(msg: string): void {
  console.log('  ' + chalk.yellow('!') + '  ' + chalk.yellow(msg))
}

export function err(msg: string): void {
  console.log('  ' + chalk.red('x') + '  ' + chalk.red(msg))
}

// -- Helpers ------------------------------------------------------------------

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtDateShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '...' : str
}

export function sourceColor(type: string): ChalkInstance {
  const map: Record<string, ChalkInstance> = {
    decision: chalk.blue,
    session:  chalk.yellow,
    task:     chalk.green,
    note:     chalk.cyan,
    identity: chalk.magenta,
  }
  return map[type] ?? chalk.white
}
