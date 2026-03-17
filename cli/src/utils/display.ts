import chalk, { type ChalkInstance } from 'chalk'
import type { Decision, Session, Task } from '../types.js'

// ── Box / header ──────────────────────────────────────────────────────────────

export function printHeader(projectName: string, subtitle?: string): void {
  const line = '═'.repeat(50)
  console.log(chalk.cyan(`\n  ╔${line}╗`))
  console.log(chalk.cyan('  ║') + chalk.bold.white(`  KONTINUE · ${projectName}`.padEnd(51)) + chalk.cyan('║'))
  if (subtitle) {
    console.log(chalk.cyan('  ║') + chalk.dim(`  ${subtitle}`.padEnd(51)) + chalk.cyan('║'))
  }
  console.log(chalk.cyan(`  ╚${line}╝\n`))
}

export function printDivider(): void {
  console.log(chalk.dim('  ' + '─'.repeat(50)))
}

// ── Session ─────────────────────────────────────────────────────────────────

export function printHandoff(session: Session): void {
  if (!session.handoff_note) return
  console.log(chalk.bold.yellow('  📋 LAST HANDOFF') + chalk.dim(`  (${fmtDate(session.ended_at!)})`))
  printDivider()
  for (const line of session.handoff_note.split('\n')) {
    console.log(`  ${line}`)
  }
  if (session.blockers) {
    console.log()
    console.log(chalk.bold.red('  ⚠  BLOCKER'))
    console.log(`  ${session.blockers}`)
  }
  console.log()
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function printTaskSection(label: string, icon: string, tasks: Task[], color: ChalkInstance): void {
  if (tasks.length === 0) return
  console.log(color(`  ${icon} ${label}`))
  printDivider()
  for (const t of tasks) {
    const bullet = t.status === 'in-progress' ? chalk.green('◉') : chalk.dim('○')
    console.log(`  ${bullet} ${t.title}`)
  }
  console.log()
}

// ── Decisions ─────────────────────────────────────────────────────────────────

export function printDecisions(decisions: Decision[]): void {
  if (decisions.length === 0) return
  console.log(chalk.bold.blue('  🔵 RECENT DECISIONS'))
  printDivider()
  for (const d of decisions) {
    const date = fmtDate(d.created_at)
    console.log(`  ${chalk.dim(date)}  ${d.summary}`)
  }
  console.log()
}

// ── Search results ────────────────────────────────────────────────────────────

export function printSearchResults(
  results: Array<{ content: string; source_type: string; created_at?: string }>,
  query: string,
  total: number
): void {
  console.log()
  console.log(chalk.bold(`  🔍 "${query}"`))
  console.log(chalk.dim(`  ${results.length} results · searched ${total} memory chunks\n`))
  printDivider()
  for (const r of results) {
    const icon = sourceIcon(r.source_type)
    const label = r.source_type.toUpperCase()
    console.log()
    console.log(chalk.bold(`  ${icon} ${label}`) + (r.created_at ? chalk.dim(` · ${fmtDate(r.created_at)}`) : ''))
    for (const line of r.content.split('\n').slice(0, 4)) {
      console.log(`  ${chalk.dim('│')} ${line}`)
    }
  }
  console.log()
}

// ── Memory stats ──────────────────────────────────────────────────────────────

export function printMemoryStats(chunks: number, sessions: number, decisions: number): void {
  printDivider()
  console.log(chalk.dim(`  Memory: ${chunks} chunks · ${sessions} sessions · ${decisions} decisions`))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function sourceIcon(type: string): string {
  const map: Record<string, string> = {
    decision: '🔵',
    session: '📋',
    architecture: '🏗',
    task: '✅',
    note: '🗒',
    identity: '📁',
  }
  return map[type] ?? '📄'
}

export function ok(msg: string): void {
  console.log(chalk.green('  ✔ ') + msg)
}

export function warn(msg: string): void {
  console.log(chalk.yellow('  ⚠ ') + msg)
}

export function err(msg: string): void {
  console.log(chalk.red('  ✖ ') + msg)
}
