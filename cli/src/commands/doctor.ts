import { Command } from '@oclif/core'
import { resolve } from 'node:path'
import { requireProject } from '../utils/project.js'
import {
  getActiveSession,
  getDecisionsWithoutRationale,
  getTasksWithoutDescription,
  getSessionsWithoutHandoff,
} from '../store/queries.js'
import chalk from 'chalk'

export default class Doctor extends Command {
  static description = 'Audit memory quality — missing rationale, descriptions, handoffs'

  async run(): Promise<void> {
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)

    console.log(chalk.bold(`\n  Kontinue Doctor — ${project.name}\n`))

    const issues: string[] = []

    // ── Active session health ─────────────────────────────────────────────────
    const active = getActiveSession(project.id)
    if (active) {
      const ageMs = Date.now() - new Date(active.started_at).getTime()
      const ageH = ageMs / 3_600_000
      if (!active.context_read_at) {
        issues.push('Active session: `read_context` not called yet — agent may be working blind')
      }
      if (ageH > 2) {
        issues.push(`Active session: running for ${ageH.toFixed(1)}h — may be a zombie (no handoff written)`)
      }
    }

    // ── Decisions without rationale ───────────────────────────────────────────
    const bareDecisions = getDecisionsWithoutRationale(project.id)
    if (bareDecisions.length > 0) {
      for (const d of bareDecisions) {
        issues.push(`Decision missing rationale: "${d.summary}"`)
      }
    }

    // ── Tasks without description ─────────────────────────────────────────────
    const bareTasks = getTasksWithoutDescription(project.id)
    if (bareTasks.length > 0) {
      for (const t of bareTasks) {
        issues.push(`Task missing description: "${t.title}" (${t.status})`)
      }
    }

    // ── Sessions without handoff ──────────────────────────────────────────────
    const ghostSessions = getSessionsWithoutHandoff(project.id)
    if (ghostSessions.length > 0) {
      issues.push(`${ghostSessions.length} past session${ghostSessions.length > 1 ? 's' : ''} ended without a handoff note`)
    }

    // ── Print report ──────────────────────────────────────────────────────────
    if (issues.length === 0) {
      console.log(chalk.green('  ✓ Memory looks healthy — no issues found\n'))
      return
    }

    console.log(chalk.yellow(`  ${issues.length} issue${issues.length > 1 ? 's' : ''} found:\n`))
    for (const issue of issues) {
      console.log(chalk.dim('  · ') + issue)
    }

    const score = Math.max(0, 100 - issues.length * 15)
    const scoreColor = score >= 80 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red
    console.log('\n  Memory quality: ' + scoreColor(`${score}/100`) + '\n')
  }
}
