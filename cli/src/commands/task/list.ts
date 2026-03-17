import { Command, Args, Flags } from '@oclif/core'
import { resolve } from 'node:path'
import { requireProject } from '../../utils/project.js'
import { getAllOpenTasks, getTasksByStatus } from '../../store/queries.js'
import { printTaskSection } from '../../utils/display.js'
import chalk from 'chalk'

export default class TaskList extends Command {
  static description = 'List tasks'

  static flags = {
    all: Flags.boolean({ char: 'a', description: 'Include done and abandoned tasks' }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(TaskList)
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)

    const open = getAllOpenTasks(project.id)
    const inProgress = open.filter(t => t.status === 'in-progress')
    const todo = open.filter(t => t.status === 'todo')

    console.log()
    printTaskSection('IN PROGRESS', '✅', inProgress, chalk.bold.green)
    printTaskSection('TODO', '📌', todo, chalk.bold.cyan)

    if (flags.all) {
      const done = getTasksByStatus(project.id, 'done')
      const abandoned = getTasksByStatus(project.id, 'abandoned')
      printTaskSection('DONE', '✓', done, chalk.dim)
      printTaskSection('ABANDONED', '✗', abandoned, chalk.dim)
    }
  }
}
