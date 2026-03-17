import { Command } from '@oclif/core'
import { resolve } from 'node:path'
import { requireProject } from '../utils/project.js'
import {
  getActiveSession,
  getLastSession,
  getAllOpenTasks,
  getRecentDecisions,
  getChunkCount,
  getAllDecisions,
} from '../store/queries.js'
import {
  printHeader,
  printHandoff,
  printTaskSection,
  printDecisions,
  printMemoryStats,
} from '../utils/display.js'
import chalk from 'chalk'

export default class Status extends Command {
  static description = 'Show current project status — session, tasks, decisions'

  async run(): Promise<void> {
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)

    const active = getActiveSession(project.id)
    const last = getLastSession(project.id)

    printHeader(project.name)

    // Session status
    if (active) {
      const started = new Date(active.started_at)
      const mins = Math.round((Date.now() - started.getTime()) / 60_000)
      console.log(chalk.green('  ● Session active') + chalk.dim(` · started ${mins}m ago`))
    } else {
      console.log(chalk.dim('  ○ No active session') + '  ' + chalk.cyan('(run: kontinue start)'))
    }
    console.log()

    // Last handoff
    if (last) printHandoff(last)

    // Open tasks
    const open = getAllOpenTasks(project.id)
    const inProgress = open.filter(t => t.status === 'in-progress')
    const todo = open.filter(t => t.status === 'todo')

    printTaskSection('IN PROGRESS', '✅', inProgress, chalk.bold.green)
    printTaskSection('UP NEXT', '📌', todo, chalk.bold.cyan)

    // Recent decisions
    const decisions = getRecentDecisions(project.id, 3)
    printDecisions(decisions)

    // Stats
    const chunks = getChunkCount(project.id)
    const allDecisions = getAllDecisions(project.id)
    printMemoryStats(chunks, 0, allDecisions.length)
    console.log()
  }
}
