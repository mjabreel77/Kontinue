import { Command } from '@oclif/core'
import { resolve } from 'node:path'
import { requireProject } from '../utils/project.js'
import {
  startSession,
  getActiveSession,
  getLastSession,
  getAllOpenTasks,
  getRecentDecisions,
  getChunkCount,
} from '../store/queries.js'
import {
  printHeader,
  printHandoff,
  printTaskSection,
  printDecisions,
  printMemoryStats,
  warn,
  ok,
} from '../utils/display.js'
import { getBranch, getCommit } from '../utils/git.js'
import chalk from 'chalk'

export default class Start extends Command {
  static description = 'Start a Kontinue session — loads context and activates MCP server'

  async run(): Promise<void> {
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)

    const active = getActiveSession(project.id)
    if (active) {
      warn(`Session already active (started ${active.started_at}). Run: kontinue end`)
      return
    }

    const session = startSession(project.id, getBranch(cwd), getCommit(cwd))
    const now = new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })

    const branch = session.branch
    const branchLabel = branch && branch !== 'HEAD' ? ` · ${chalk.cyan(branch)}` : ''
    printHeader(project.name, `Session started · ${now}${branchLabel}`)

    // Show last handoff if any
    const last = getLastSession(project.id)
    if (last) {
      printHandoff(last)
    }

    // Show open tasks
    const inProgress = getAllOpenTasks(project.id).filter(t => t.status === 'in-progress')
    const todo = getAllOpenTasks(project.id).filter(t => t.status === 'todo')

    printTaskSection('IN PROGRESS', '✅', inProgress, chalk.bold.green)
    printTaskSection('UP NEXT', '📌', todo, chalk.bold.cyan)

    // Recent decisions
    const decisions = getRecentDecisions(project.id, 3)
    printDecisions(decisions)

    // Stats
    const chunks = getChunkCount(project.id)
    printMemoryStats(chunks, 0, decisions.length)

    console.log(chalk.dim('\n  MCP server: run "kontinue mcp" to start\n'))

    ok(`Session #${session.id} active`)
  }
}
