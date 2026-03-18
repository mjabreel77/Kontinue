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
  closeStaleSessions,
} from '../store/queries.js'
import {
  printBanner,
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

    // Auto-close any sessions that have been open >2h with no handoff (zombie sessions)
    const closed = closeStaleSessions(project.id, 2)
    if (closed > 0) {
      warn(`${closed} stale session${closed > 1 ? 's' : ''} auto-closed (no handoff written — context likely overflowed)`)
    }

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
    printBanner(project.name, session.branch, session.start_commit)

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
