import { Command, Args, Flags } from '@oclif/core'
import { resolve } from 'node:path'
import { requireProject } from '../utils/project.js'
import { getActiveSession, addSignal, answerQuestion, findOpenQuestion } from '../store/queries.js'
import { ok, warn } from '../utils/display.js'
import chalk from 'chalk'

export default class Signal extends Command {
  static description = 'Send a signal to the active AI agent'

  static examples = [
    '<%= config.bin %> signal "please prioritize the auth bug"',
    '<%= config.bin %> signal --type priority "focus on security audit"',
    '<%= config.bin %> signal --type abort "stop and check CI"',
    '<%= config.bin %> signal --type answer --question "rate limit" "Use per-IP"',
  ]

  static args = {
    content: Args.string({ description: 'Signal content / message to the agent', required: true }),
  }

  static flags = {
    type: Flags.string({
      char: 't',
      description: 'Signal type',
      options: ['message', 'priority', 'abort', 'answer'],
      default: 'message',
    }),
    question: Flags.string({
      char: 'q',
      description: 'For --type answer: partial match of the question to answer',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Signal)
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)
    const session = getActiveSession(project.id)

    let metadata: string | null = null

    // If answering a question, also resolve it in the questions table
    if (flags.type === 'answer') {
      if (!flags.question) {
        this.error('--question is required when using --type answer')
      }
      const q = findOpenQuestion(project.id, flags.question)
      if (q) {
        answerQuestion(q.id, args.content)
        metadata = JSON.stringify({ question_id: q.id, question: q.question })
        ok(`Question resolved: "${q.question}"`)
      } else {
        warn(`No open question matching "${flags.question}" — signal will still be sent`)
      }
    }

    const signal = addSignal(
      project.id,
      args.content,
      flags.type as string,
      'cli',
      metadata
    )

    const typeLabel = flags.type === 'abort' ? chalk.red.bold('ABORT')
      : flags.type === 'priority' ? chalk.yellow.bold('PRIORITY')
      : flags.type === 'answer' ? chalk.cyan.bold('ANSWER')
      : chalk.blue.bold('MESSAGE')

    ok(`Signal sent ${typeLabel} → "${args.content}"`)

    if (!session) {
      warn('No active session — signal will be delivered when the agent starts a new session')
    } else {
      console.log(chalk.dim(`  The agent will see this on its next tool call (signal #${signal.id})`))
    }
  }
}
