import { Command } from '@oclif/core'
import { input } from '@inquirer/prompts'
import { resolve } from 'node:path'
import { requireProject } from '../utils/project.js'
import {
  getActiveSession,
  endSession,
  getAllOpenTasks,
  getTasksByStatus,
  getRecentDecisions,
  getChunkCount,
  upsertChunk,
} from '../store/queries.js'
import { writeSession } from '../store/markdown.js'
import { printHeader, ok, warn } from '../utils/display.js'
import { getCommit } from '../utils/git.js'
import chalk from 'chalk'

export default class End extends Command {
  static description = 'End the current session and write a handoff note'

  async run(): Promise<void> {
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)

    const session = getActiveSession(project.id)
    if (!session) {
      warn('No active session. Run: kontinue start')
      return
    }

    const startedAt = new Date(session.started_at)
    const now = new Date()
    const mins = Math.round((now.getTime() - startedAt.getTime()) / 60_000)

    console.log(chalk.dim(`\n  Wrapping up session (${mins} min) ...\n`))

    const handoffNote = await input({
      message: 'What was accomplished? (leave blank to skip)',
      default: '',
    })

    const blockers = await input({
      message: 'Blockers for next session? (leave blank for none)',
      default: '',
    })

    endSession(session.id, handoffNote, blockers, getCommit(cwd))

    // Dual-write: persist handoff as .md file
    const updated = { ...session, ended_at: now.toISOString(), handoff_note: handoffNote, blockers, end_commit: getCommit(cwd) }
    writeSession(updated)

    // Index handoff into memory chunks
    if (handoffNote) {
      upsertChunk(project.id, 'session', session.id, handoffNote)
    }

    const decisions = getRecentDecisions(project.id)
    const chunks = getChunkCount(project.id)

    console.log()
    ok('Handoff note saved')
    if (blockers) ok('Blocker flagged')
    ok(`Memory: ${chunks} chunks indexed`)

    printHeader(project.name, 'See you next session. Memory saved.')
  }
}
